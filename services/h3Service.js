const h3 = require('h3-js');
const constants = require('../config/constants');

/**
 * Convert coordinates and zoom level to H3 hexagon ID
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} zoom - Zoom level (0-15)
 * @returns {string} H3 hexagon ID
 */
function coordinatesToH3(lat, lng, zoom) {
  // Convert zoom level to H3 resolution
  // Zoom 0-3 -> res 0-2
  // Zoom 4-6 -> res 3-5
  // Zoom 7-9 -> res 6-8
  // Zoom 10+ -> res 9
  let resolution;
  if (zoom <= 3) {
    resolution = Math.floor(zoom * 2 / 3);
  } else if (zoom <= 6) {
    resolution = Math.floor((zoom - 1) / 1.5) + 1;
  } else if (zoom <= 9) {
    resolution = Math.floor((zoom - 1) / 1.5) + 2;
  } else {
    resolution = Math.min(9, Math.floor((zoom - 1) / 1.5) + 3);
  }
  
  // Clamp resolution to configured limits
  resolution = Math.max(constants.h3.minResolution, 
                       Math.min(resolution, constants.h3.maxResolution));
  
  // Convert coordinates to H3 index
  const h3Index = h3.latLngToCell(lat, lng, resolution);
  
  return h3Index;
}

/**
 * Get H3 hexagon boundary coordinates
 * @param {string} h3Index - H3 hexagon ID
 * @returns {Array} Array of [lat, lng] coordinates
 */
function getH3Boundary(h3Index) {
  try {
    // Get boundary as array of [lat, lng] pairs
    const boundary = h3.cellToBoundary(h3Index);
    return boundary;
  } catch (error) {
    throw new Error(`Invalid H3 index: ${h3Index}`);
  }
}

/**
 * Get H3 hexagon information
 * @param {string} h3Index - H3 hexagon ID
 * @returns {Object} Hexagon information
 */
function getH3Info(h3Index) {
  try {
    const boundary = getH3Boundary(h3Index);
    const center = h3.cellToLatLng(h3Index);
    const resolution = h3.getResolution(h3Index);
    
    // Calculate bounding box
    const lats = boundary.map(coord => coord[0]);
    const lngs = boundary.map(coord => coord[1]);
    
    const bbox = {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs)
    };
    
    // Calculate approximate area in km²
    const edgeLength = h3.getHexagonEdgeLengthAvg(resolution, h3.UNITS.km);
    const area = h3.getHexagonAreaAvg(resolution, h3.UNITS.km2);
    
    return {
      h3Index,
      resolution,
      center: {
        lat: center[0],
        lng: center[1]
      },
      boundary,
      boundingBox: bbox,
      edgeLengthKm: edgeLength,
      areaKm2: area
    };
  } catch (error) {
    throw new Error(`Invalid H3 index: ${h3Index}`);
  }
}

/**
 * Validate H3 index
 * @param {string} h3Index - H3 hexagon ID
 * @returns {boolean} True if valid
 */
function isValidH3Index(h3Index) {
  return h3.isValidCell(h3Index);
}

/**
 * Get neighboring hexagons
 * @param {string} h3Index - H3 hexagon ID
 * @param {number} ringSize - Number of rings (default 1)
 * @returns {Array} Array of H3 indexes
 */
function getH3Neighbors(h3Index, ringSize = 1) {
  try {
    return h3.gridDisk(h3Index, ringSize);
  } catch (error) {
    throw new Error(`Invalid H3 index: ${h3Index}`);
  }
}

/**
 * Convert H3 resolution to approximate zoom level
 * @param {number} resolution - H3 resolution (0-15)
 * @returns {number} Approximate zoom level
 */
function resolutionToZoom(resolution) {
  // Approximate reverse mapping
  if (resolution <= 2) return resolution * 1.5;
  if (resolution <= 5) return (resolution - 1) * 1.5 + 1;
  if (resolution <= 8) return (resolution - 2) * 1.5 + 1;
  return (resolution - 3) * 1.5 + 1;
}

module.exports = {
  coordinatesToH3,
  getH3Boundary,
  getH3Info,
  isValidH3Index,
  getH3Neighbors,
  resolutionToZoom
}; 