const fs = require('fs');
const path = require('path');
const constants = require('../config/constants');

/**
 * Parse HGT filename to extract latitude and longitude
 * @param {string} filename - HGT filename (e.g., 'N48E002.hgt')
 * @returns {Object} { lat, lng }
 */
function parseHgtFilename(filename) {
  const match = filename.match(/^([NS])(\d{2})([EW])(\d{3})\.hgt$/i);
  if (!match) {
    throw new Error('Invalid HGT filename format');
  }
  
  const lat = parseInt(match[2]) * (match[1] === 'S' ? -1 : 1);
  const lng = parseInt(match[4]) * (match[3] === 'W' ? -1 : 1);
  
  return { lat, lng };
}

/**
 * Get HGT filename from coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} HGT filename
 */
function getHgtFilename(lat, lng) {
  const latInt = Math.floor(lat);
  const lngInt = Math.floor(lng);
  
  const latPrefix = latInt >= 0 ? 'N' : 'S';
  const lngPrefix = lngInt >= 0 ? 'E' : 'W';
  
  const latStr = Math.abs(latInt).toString().padStart(2, '0');
  const lngStr = Math.abs(lngInt).toString().padStart(3, '0');
  
  return `${latPrefix}${latStr}${lngPrefix}${lngStr}.hgt`;
}

/**
 * Read elevation data from HGT file
 * @param {string} filepath - Path to HGT file
 * @returns {Promise<Int16Array>} Elevation data array
 */
async function readHgtFile(filepath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filepath, (err, buffer) => {
      if (err) {
        reject(err);
        return;
      }
      
      const tileSize = constants.elevation.hgtTileSize;
      const expectedSize = tileSize * tileSize * 2; // 2 bytes per value
      
      if (buffer.length !== expectedSize) {
        reject(new Error(`Invalid HGT file size. Expected ${expectedSize}, got ${buffer.length}`));
        return;
      }
      
      // Convert buffer to Int16Array (big-endian)
      const elevations = new Int16Array(tileSize * tileSize);
      for (let i = 0; i < elevations.length; i++) {
        // Read big-endian 16-bit signed integer
        elevations[i] = buffer.readInt16BE(i * 2);
      }
      
      resolve(elevations);
    });
  });
}

/**
 * Get elevation at specific coordinates from HGT data
 * @param {Int16Array} hgtData - HGT elevation data
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} tileLat - Tile base latitude
 * @param {number} tileLng - Tile base longitude
 * @returns {number} Elevation in meters
 */
function getElevationAtPoint(hgtData, lat, lng, tileLat, tileLng) {
  const tileSize = constants.elevation.hgtTileSize;
  
  // Calculate position within tile (0-1)
  const latOffset = lat - tileLat;
  const lngOffset = lng - tileLng;
  
  // Convert to pixel coordinates (0 to tileSize-1)
  // Note: HGT data is stored from north to south
  const row = Math.floor((1 - latOffset) * (tileSize - 1));
  const col = Math.floor(lngOffset * (tileSize - 1));
  
  // Bounds check
  if (row < 0 || row >= tileSize || col < 0 || col >= tileSize) {
    return constants.elevation.noDataValue;
  }
  
  // Get elevation value
  const index = row * tileSize + col;
  const elevation = hgtData[index];
  
  // Check for void values
  if (elevation === constants.elevation.noDataValue) {
    return null;
  }
  
  return elevation;
}

/**
 * Bilinear interpolation for smooth elevation values
 * @param {Int16Array} hgtData - HGT elevation data
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} tileLat - Tile base latitude
 * @param {number} tileLng - Tile base longitude
 * @returns {number} Interpolated elevation in meters
 */
function getInterpolatedElevation(hgtData, lat, lng, tileLat, tileLng) {
  const tileSize = constants.elevation.hgtTileSize;
  
  // Calculate position within tile (0-1)
  const latOffset = lat - tileLat;
  const lngOffset = lng - tileLng;
  
  // Convert to continuous pixel coordinates
  const y = (1 - latOffset) * (tileSize - 1);
  const x = lngOffset * (tileSize - 1);
  
  // Get integer coordinates
  const x0 = Math.floor(x);
  const x1 = Math.min(x0 + 1, tileSize - 1);
  const y0 = Math.floor(y);
  const y1 = Math.min(y0 + 1, tileSize - 1);
  
  // Get fractional parts
  const fx = x - x0;
  const fy = y - y0;
  
  // Get four corner elevations
  const e00 = hgtData[y0 * tileSize + x0];
  const e10 = hgtData[y0 * tileSize + x1];
  const e01 = hgtData[y1 * tileSize + x0];
  const e11 = hgtData[y1 * tileSize + x1];
  
  // Check for void values
  if (e00 === constants.elevation.noDataValue || 
      e10 === constants.elevation.noDataValue ||
      e01 === constants.elevation.noDataValue || 
      e11 === constants.elevation.noDataValue) {
    // Try to use valid values if available
    const validValues = [e00, e10, e01, e11].filter(e => e !== constants.elevation.noDataValue);
    if (validValues.length > 0) {
      return validValues.reduce((a, b) => a + b) / validValues.length;
    }
    return null;
  }
  
  // Bilinear interpolation
  const e0 = e00 * (1 - fx) + e10 * fx;
  const e1 = e01 * (1 - fx) + e11 * fx;
  const elevation = e0 * (1 - fy) + e1 * fy;
  
  return Math.round(elevation);
}

/**
 * Get elevation statistics for a region
 * @param {Int16Array} hgtData - HGT elevation data
 * @param {Object} bounds - { minLat, maxLat, minLng, maxLng }
 * @param {number} tileLat - Tile base latitude
 * @param {number} tileLng - Tile base longitude
 * @returns {Object} { min, max, avg, samples }
 */
function getElevationStats(hgtData, bounds, tileLat, tileLng) {
  const tileSize = constants.elevation.hgtTileSize;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  
  // Sample at reasonable intervals
  const latStep = (bounds.maxLat - bounds.minLat) / 50;
  const lngStep = (bounds.maxLng - bounds.minLng) / 50;
  
  for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += latStep) {
    for (let lng = bounds.minLng; lng <= bounds.maxLng; lng += lngStep) {
      const elevation = getInterpolatedElevation(hgtData, lat, lng, tileLat, tileLng);
      if (elevation !== null) {
        min = Math.min(min, elevation);
        max = Math.max(max, elevation);
        sum += elevation;
        count++;
      }
    }
  }
  
  return {
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
    avg: count > 0 ? sum / count : 0,
    samples: count
  };
}

module.exports = {
  parseHgtFilename,
  getHgtFilename,
  readHgtFile,
  getElevationAtPoint,
  getInterpolatedElevation,
  getElevationStats
}; 