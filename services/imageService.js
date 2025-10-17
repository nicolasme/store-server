const sharp = require('sharp');
const elevationService = require('./elevationService');
const constants = require('../config/constants');
const crypto = require('crypto');

// Simple in-memory cache for generated images
const imageCache = new Map();
const CACHE_MAX_SIZE = 50; // Maximum number of cached images
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Generate cache key for image request
 */
function getCacheKey(h3Index, width, height, type = 'relief', minScale = undefined, maxScale = undefined, options = {}) {
  const keyData = {
    h3Index,
    width,
    height,
    type,
    minScale,
    maxScale,
    ...options
  };
  return crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex');
}

/**
 * Get image from cache
 */
function getFromCache(key) {
  const cached = imageCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  // Remove expired entry
  if (cached) {
    imageCache.delete(key);
  }
  return null;
}

/**
 * Add image to cache
 */
function addToCache(key, data) {
  // Remove oldest entries if cache is full
  if (imageCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = [...imageCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    imageCache.delete(oldestKey);
  }
  
  imageCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Generate a relief image from elevation data
 * @param {string} h3Index - H3 hexagon ID
 * @param {number} width - Image width (default from constants)
 * @param {number} height - Image height (default from constants)
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateReliefImage(h3Index, width, height, minScale = undefined, maxScale = undefined) {
  // Use defaults if not specified
  width = width || constants.image.defaultWidth;
  height = height || constants.image.defaultHeight;
  
  // Check cache
  const cacheKey = getCacheKey(h3Index, width, height, 'relief', minScale, maxScale);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Get elevation grid
  const gridSize = Math.max(width, height);
  const elevationData = await elevationService.getHexagonElevationGrid(h3Index, gridSize);
  
  // Check if we have data
  if (!elevationData.grid || elevationData.elevationRange.min === elevationData.elevationRange.max) {
    throw new Error('No elevation data available for this hexagon');
  }
  
  const { grid, elevationRange } = elevationData;
  let { min: minElevation, max: maxElevation } = elevationRange;

  if (minScale) {
    minElevation = minScale;
  }
  if (maxScale) {
    maxElevation = maxScale;
  }

  const elevationSpan = maxElevation - minElevation;
  
  // Create grayscale buffer
  const imageBuffer = Buffer.alloc(gridSize * gridSize);
  
  // Convert elevation to grayscale (0-255)
  // Higher elevation = lighter (white), lower elevation = darker (black)
  for (let i = 0; i < grid.length; i++) {
    const elevation = grid[i];
    
    if (elevation === -1) {
      // Outside hexagon or no data - make it transparent/black
      imageBuffer[i] = 0;
    } else {
      // Normalize to 0-255 range
      const normalized = elevationSpan > 0 
        ? ((elevation - minElevation) / elevationSpan) * 255
        : 128; // Middle gray if no variation
      
      imageBuffer[i] = Math.round(normalized);
    }
  }
  
  // Create hexagon mask for transparency
  const maskBuffer = await createHexagonMask(elevationData, gridSize);
  
  // Generate PNG with Sharp
  const image = await sharp(imageBuffer, {
    raw: {
      width: gridSize,
      height: gridSize,
      channels: 1
    }
  })
  .resize(width, height, {
    kernel: sharp.kernel.lanczos3,
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .composite([{
    input: maskBuffer,
    blend: 'dest-in'
  }])
  .png({
    compressionLevel: 9
  })
  .toBuffer();
  
  // Add to cache
  addToCache(cacheKey, image);
  
  return image;
}

/**
 * Create a hexagon mask for transparency
 * @param {Object} elevationData - Elevation data with hexInfo
 * @param {number} size - Size of the mask
 * @returns {Promise<Buffer>} Mask buffer
 */
async function createHexagonMask(elevationData, size) {
  const { hexInfo, bounds } = elevationData;
  const { boundary } = hexInfo;
  
  // Create SVG hexagon path
  const svgPath = boundary.map((coord, index) => {
    const x = ((coord[1] - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * size;
    const y = ((bounds.maxLat - coord[0]) / (bounds.maxLat - bounds.minLat)) * size;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ') + ' Z';
  
  // Create SVG
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <path d="${svgPath}" fill="white" />
    </svg>
  `;
  
  // Convert SVG to mask
  const mask = await sharp(Buffer.from(svg))
    .resize(size, size)
    .greyscale()
    .toBuffer();
  
  return mask;
}

/**
 * Generate a relief image with contour lines
 * @param {string} h3Index - H3 hexagon ID
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} contourInterval - Elevation interval for contour lines (meters)
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateContourImage(h3Index, width, height, contourInterval = 50) {
  width = width || constants.image.defaultWidth;
  height = height || constants.image.defaultHeight;
  
  // Check cache
  const cacheKey = getCacheKey(h3Index, width, height, 'contour', { interval: contourInterval });
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Get elevation grid
  const gridSize = Math.max(width, height);
  const elevationData = await elevationService.getHexagonElevationGrid(h3Index, gridSize);
  
  const { grid, elevationRange, bounds, hexInfo } = elevationData;
  const { min: minElevation, max: maxElevation } = elevationRange;
  
  // Create base relief image
  const reliefBuffer = await generateReliefImage(h3Index, gridSize, gridSize);
  
  // Generate contour lines SVG
  const contourSvg = generateContourSvg(grid, gridSize, minElevation, maxElevation, contourInterval, bounds, hexInfo.boundary);
  
  // Composite relief and contours
  const finalImage = await sharp(reliefBuffer)
    .composite([{
      input: Buffer.from(contourSvg),
      top: 0,
      left: 0
    }])
    .resize(width, height, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain'
    })
    .png()
    .toBuffer();
  
  // Add to cache
  addToCache(cacheKey, finalImage);
  
  return finalImage;
}

/**
 * Generate SVG contour lines
 */
function generateContourSvg(grid, gridSize, minElevation, maxElevation, interval, bounds, boundary) {
  // Calculate contour levels
  const startLevel = Math.ceil(minElevation / interval) * interval;
  const endLevel = Math.floor(maxElevation / interval) * interval;
  const contourLevels = [];
  
  for (let level = startLevel; level <= endLevel; level += interval) {
    contourLevels.push(level);
  }
  
  // Create hexagon clip path
  const clipPath = boundary.map((coord, index) => {
    const x = ((coord[1] - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * gridSize;
    const y = ((bounds.maxLat - coord[0]) / (bounds.maxLat - bounds.minLat)) * gridSize;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ') + ' Z';
  
  // Simple contour line generation (basic implementation)
  let contourPaths = '';
  
  // This is a simplified version - a full implementation would use 
  // marching squares algorithm for proper contour extraction
  contourLevels.forEach(level => {
    const levelColor = level % (interval * 5) === 0 ? '#000' : '#666';
    const strokeWidth = level % (interval * 5) === 0 ? 2 : 1;
    
    contourPaths += `<path d="" stroke="${levelColor}" stroke-width="${strokeWidth}" fill="none" opacity="0.5"/>`;
  });
  
  return `
    <svg width="${gridSize}" height="${gridSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="hexClip">
          <path d="${clipPath}" />
        </clipPath>
      </defs>
      <g clip-path="url(#hexClip)">
        ${contourPaths}
      </g>
    </svg>
  `;
}

/**
 * Get image metadata for a hexagon
 * @param {string} h3Index - H3 hexagon ID
 * @returns {Promise<Object>} Image metadata
 */
async function getImageMetadata(h3Index) {
  const elevationData = await elevationService.getHexagonElevationGrid(h3Index, 256);
  const { elevationRange, hexInfo } = elevationData;
  
  return {
    h3Index,
    center: hexInfo.center,
    elevationRange,
    areaKm2: hexInfo.areaKm2,
    recommendedSize: {
      width: constants.image.defaultWidth,
      height: constants.image.defaultHeight
    }
  };
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  const now = Date.now();
  const stats = {
    size: imageCache.size,
    maxSize: CACHE_MAX_SIZE,
    ttl: CACHE_TTL,
    entries: []
  };
  
  imageCache.forEach((value, key) => {
    stats.entries.push({
      key,
      age: now - value.timestamp,
      expired: now - value.timestamp > CACHE_TTL
    });
  });
  
  return stats;
}

/**
 * Clear the image cache
 */
function clearCache() {
  imageCache.clear();
}

module.exports = {
  generateReliefImage,
  generateContourImage,
  getImageMetadata,
  getCacheStats,
  clearCache
}; 