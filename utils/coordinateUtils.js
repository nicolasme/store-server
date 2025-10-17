/**
 * Check if a point is inside a polygon
 * @param {Array} point - [lat, lng]
 * @param {Array} polygon - Array of [lat, lng] vertices
 * @returns {boolean} True if point is inside polygon
 */
function isPointInPolygon(point, polygon) {
  const [lat, lng] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lat1, lng1] = polygon[i];
    const [lat2, lng2] = polygon[j];
    
    if ((lng1 > lng) !== (lng2 > lng) &&
        lat < (lat2 - lat1) * (lng - lng1) / (lng2 - lng1) + lat1) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Get bounding box from polygon
 * @param {Array} polygon - Array of [lat, lng] vertices
 * @returns {Object} { minLat, maxLat, minLng, maxLng }
 */
function getBoundingBox(polygon) {
  const lats = polygon.map(coord => coord[0]);
  const lngs = polygon.map(coord => coord[1]);
  
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs)
  };
}

/**
 * Calculate area of polygon using shoelace formula
 * @param {Array} polygon - Array of [lat, lng] vertices
 * @returns {number} Area in square degrees (approximate)
 */
function getPolygonArea(polygon) {
  let area = 0;
  
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][1] * polygon[j][0];
    area -= polygon[j][1] * polygon[i][0];
  }
  
  return Math.abs(area / 2);
}

/**
 * Get center of polygon
 * @param {Array} polygon - Array of [lat, lng] vertices
 * @returns {Array} [lat, lng] center point
 */
function getPolygonCenter(polygon) {
  let latSum = 0;
  let lngSum = 0;
  
  for (const [lat, lng] of polygon) {
    latSum += lat;
    lngSum += lng;
  }
  
  return [
    latSum / polygon.length,
    lngSum / polygon.length
  ];
}

/**
 * Determine which HGT tiles are needed for a bounding box
 * @param {Object} bbox - { minLat, maxLat, minLng, maxLng }
 * @returns {Array} Array of { lat, lng, filename } for required tiles
 */
function getRequiredHgtTiles(bbox) {
  const tiles = [];
  
  // Get integer bounds (HGT tiles are 1x1 degree)
  const minLat = Math.floor(bbox.minLat);
  const maxLat = Math.floor(bbox.maxLat);
  const minLng = Math.floor(bbox.minLng);
  const maxLng = Math.floor(bbox.maxLng);
  
  // Generate all required tiles
  for (let lat = minLat; lat <= maxLat; lat++) {
    for (let lng = minLng; lng <= maxLng; lng++) {
      const latPrefix = lat >= 0 ? 'N' : 'S';
      const lngPrefix = lng >= 0 ? 'E' : 'W';
      
      const latStr = Math.abs(lat).toString().padStart(2, '0');
      const lngStr = Math.abs(lng).toString().padStart(3, '0');
      
      tiles.push({
        lat,
        lng,
        filename: `${latPrefix}${latStr}${lngPrefix}${lngStr}.hgt`
      });
    }
  }
  
  return tiles;
}

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lng1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lng2 - Second point longitude
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Convert degrees to radians
 * @param {number} degrees
 * @returns {number} radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Create a grid of sample points within a bounding box
 * @param {Object} bbox - { minLat, maxLat, minLng, maxLng }
 * @param {number} resolution - Number of points per side
 * @returns {Array} Array of [lat, lng] sample points
 */
function createSampleGrid(bbox, resolution = 50) {
  const points = [];
  const latStep = (bbox.maxLat - bbox.minLat) / (resolution - 1);
  const lngStep = (bbox.maxLng - bbox.minLng) / (resolution - 1);
  
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      points.push([
        bbox.minLat + i * latStep,
        bbox.minLng + j * lngStep
      ]);
    }
  }
  
  return points;
}

/**
 * Create a grid of sample points within a hexagon
 * @param {Array} hexBoundary - Array of [lat, lng] vertices
 * @param {number} resolution - Approximate number of points per side
 * @returns {Array} Array of [lat, lng] sample points inside hexagon
 */
function createHexagonSampleGrid(hexBoundary, resolution = 50) {
  const bbox = getBoundingBox(hexBoundary);
  const allPoints = createSampleGrid(bbox, resolution);
  
  // Filter to only points inside the hexagon
  return allPoints.filter(point => isPointInPolygon(point, hexBoundary));
}

module.exports = {
  isPointInPolygon,
  getBoundingBox,
  getPolygonArea,
  getPolygonCenter,
  getRequiredHgtTiles,
  haversineDistance,
  toRadians,
  createSampleGrid,
  createHexagonSampleGrid
}; 