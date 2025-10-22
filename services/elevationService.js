const path = require('path');
const fs = require('fs').promises;
const hgtParser = require('../utils/hgtParser');
const coordinateUtils = require('../utils/coordinateUtils');
const h3Service = require('./h3Service');

// Cache for loaded HGT data
const hgtCache = new Map();
const CACHE_MAX_SIZE = 20; // Maximum number of HGT files to keep in memory

/**
 * Get HGT data from cache or load from file
 * @param {string} filename - HGT filename
 * @returns {Promise<Int16Array>} HGT elevation data
 */
async function getHgtData(filename) {
  // Check cache
  if (hgtCache.has(filename)) {
    // Move to end (LRU)
    const data = hgtCache.get(filename);
    hgtCache.delete(filename);
    hgtCache.set(filename, data);
    return data;
  }
  
  // Load from file
  const hgtPath = process.env.HGT_DIR || './data/hgt';
  const filepath = path.join(hgtPath, filename);
  
  try {
    const data = await hgtParser.readHgtFile(filepath);
    
    // Add to cache
    hgtCache.set(filename, data);
    
    // Evict oldest if cache is too large
    if (hgtCache.size > CACHE_MAX_SIZE) {
      const firstKey = hgtCache.keys().next().value;
      hgtCache.delete(firstKey);
    }
    
    return data;
  } catch (error) {
    console.error(`Failed to load HGT file ${filename}:`, error.message);
    return null;
  }
}

/**
 * Get elevation data for a hexagon
 * @param {string} h3Index - H3 hexagon ID
 * @returns {Promise<Object>} Elevation data and statistics
 */
async function getHexagonElevation(h3Index) {
  // Get hexagon info
  const hexInfo = h3Service.getH3Info(h3Index);
  const { boundary, boundingBox } = hexInfo;
  
  // Determine required HGT tiles
  const requiredTiles = coordinateUtils.getRequiredHgtTiles(boundingBox);
  
  // Create sample grid within hexagon
  const samplePoints = coordinateUtils.createHexagonSampleGrid(boundary, 100);
  
  // Collect elevation data
  const elevationData = [];
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  let sumElevation = 0;
  let validCount = 0;
  
  // Process each required tile
  for (const tile of requiredTiles) {
    const hgtData = await getHgtData(tile.filename);
    if (!hgtData) continue;
    
    // Extract elevations for sample points in this tile
    for (const [lat, lng] of samplePoints) {
      // Check if point is within this tile
      if (lat >= tile.lat && lat < tile.lat + 1 &&
          lng >= tile.lng && lng < tile.lng + 1) {
        
        const elevation = hgtParser.getInterpolatedElevation(
          hgtData, lat, lng, tile.lat, tile.lng
        );
        
        if (elevation !== null) {
          elevationData.push({
            lat,
            lng,
            elevation
          });
          
          minElevation = Math.min(minElevation, elevation);
          maxElevation = Math.max(maxElevation, elevation);
          sumElevation += elevation;
          validCount++;
        }
      }
    }
  }
  
  // Calculate statistics
  const avgElevation = validCount > 0 ? sumElevation / validCount : 0;
  const elevationRange = maxElevation - minElevation;
  
  return {
    h3Index,
    hexInfo,
    // elevationData,
    statistics: {
      min: minElevation === Infinity ? 0 : minElevation,
      max: maxElevation === -Infinity ? 0 : maxElevation,
      avg: avgElevation,
      range: elevationRange,
      samples: validCount,
      coverage: validCount / samplePoints.length
    },
    requiredTiles: requiredTiles.map(t => t.filename)
  };
}

/**
 * Get elevation grid for a hexagon (for image/gcode generation)
 * @param {string} h3Index - H3 hexagon ID
 * @param {number} gridSize - Size of the grid (default 256)
 * @returns {Promise<Object>} Grid data with elevations
 */
async function getHexagonElevationGrid(h3Index, gridSize = 256) {
  // Get hexagon info
  const hexInfo = h3Service.getH3Info(h3Index);
  const { boundary, boundingBox } = hexInfo;
  
  // Determine required HGT tiles
  const requiredTiles = coordinateUtils.getRequiredHgtTiles(boundingBox);
  
  // Create grid
  const grid = new Float32Array(gridSize * gridSize);
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  
  // Calculate grid spacing
  const latRange = boundingBox.maxLat - boundingBox.minLat;
  const lngRange = boundingBox.maxLng - boundingBox.minLng;
  const latStep = latRange / (gridSize - 1);
  const lngStep = lngRange / (gridSize - 1);
  
  // Load all required tiles
  const tileDataMap = new Map();
  for (const tile of requiredTiles) {
    const hgtData = await getHgtData(tile.filename);
    if (hgtData) {
      tileDataMap.set(tile.filename, { data: hgtData, tile });
    }
  }
  
  // Fill grid
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const lat = boundingBox.maxLat - row * latStep; // Top to bottom
      const lng = boundingBox.minLng + col * lngStep; // Left to right
      
      const point = [lat, lng];
      let elevation = null;
      
      // Check if point is inside hexagon
      if (coordinateUtils.isPointInPolygon(point, boundary)) {
        // Find which tile contains this point
        const tileLat = Math.floor(lat);
        const tileLng = Math.floor(lng);
        const tileFilename = hgtParser.getHgtFilename(lat, lng);
        
        const tileInfo = tileDataMap.get(tileFilename);
        if (tileInfo) {
          elevation = hgtParser.getInterpolatedElevation(
            tileInfo.data, lat, lng, tileLat, tileLng
          );
        }
      }
      
      // Set grid value
      const index = row * gridSize + col;
      grid[index] = elevation !== null ? elevation : -1; // -1 for outside/no data
      
      if (elevation !== null) {
        minElevation = Math.min(minElevation, elevation);
        maxElevation = Math.max(maxElevation, elevation);
      }
    }
  }
  
  return {
    h3Index,
    hexInfo,
    grid,
    gridSize,
    bounds: boundingBox,
    elevationRange: {
      min: minElevation === Infinity ? 0 : minElevation,
      max: maxElevation === -Infinity ? 0 : maxElevation
    }
  };
}

/**
 * Check which HGT files are available
 * @returns {Promise<Array>} List of available HGT files
 */
async function getAvailableHgtFiles() {
  const hgtPath = process.env.HGT_DIR || './data/hgt';
  
  try {
    const files = await fs.readdir(hgtPath);
    return files
      .filter(f => f.endsWith('.hgt'))
      .map(f => {
        try {
          const coords = hgtParser.parseHgtFilename(f);
          return { filename: f, ...coords };
        } catch (e) {
          return null;
        }
      })
      .filter(f => f !== null);
  } catch (error) {
    console.error('Error reading HGT directory:', error);
    return [];
  }
}

/**
 * Clear the HGT cache
 */
function clearCache() {
  hgtCache.clear();
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    size: hgtCache.size,
    maxSize: CACHE_MAX_SIZE,
    files: Array.from(hgtCache.keys())
  };
}

module.exports = {
  getHexagonElevation,
  getHexagonElevationGrid,
  getAvailableHgtFiles,
  clearCache,
  getCacheStats
}; 