const h3Service = require('../services/h3Service');
const elevationService = require('../services/elevationService');

/**
 * Convert coordinates to H3 hexagon ID
 */
async function coordinatesToH3(req, res, next) {
  try {
    const { lat, lng, zoom } = req.query;

    console.log(req.headers['x-client-id'])
    console.log(req.headers['x-customer-id'])
    
    // Validate input
    if (!lat || !lng) {
      return res.status(400).json({
        error: 'Missing required parameters: lat, lng'
      });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const zoomLevel = parseInt(zoom) || 7; // Default zoom level
    
    // Validate coordinate ranges
    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      return res.status(400).json({
        error: 'Invalid latitude. Must be between -90 and 90'
      });
    }
    
    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        error: 'Invalid longitude. Must be between -180 and 180'
      });
    }
    
    if (isNaN(zoomLevel) || zoomLevel < 0 || zoomLevel > 15) {
      return res.status(400).json({
        error: 'Invalid zoom level. Must be between 0 and 15'
      });
    }
    
    // Convert to H3
    const hexagonId = h3Service.coordinatesToH3(latitude, longitude, zoomLevel);
    
    // Get additional info about the hexagon
    const hexInfo = h3Service.getH3Info(hexagonId);
    const hexElevation = await elevationService.getHexagonElevation(hexagonId);

    // Get hexagon neighbors
    const hexNeighbors = h3Service.getH3Neighbors(hexagonId, 1);
    const hexNeighborsInfo = hexNeighbors.map(neighbor => {
      const neighborInfo = h3Service.getH3Info(neighbor);
      return {
        ...neighborInfo,
        hexagonId: neighbor, // Add hexagonId for consistency
        coordinates: neighborInfo.boundary // Map boundary to coordinates for consistency
      };
    });

    res.json({
      hexagonId,
      resolution: hexInfo.resolution,
      center: hexInfo.center,
      areaKm2: hexInfo.areaKm2,
      edgeLengthKm: hexInfo.edgeLengthKm,
      input: {
        lat: latitude,
        lng: longitude,
        zoom: zoomLevel
      },
      coordinates: h3Service.getH3Boundary(hexagonId), //array of coordinates
      elevation: hexElevation,
      neighbors: hexNeighborsInfo
    });
    
  } catch (error) {
    next(error);
  }
}

/**
 * Get hexagon information by ID
 */
async function getHexagonInfo(req, res, next) {
  try {
    const { hexagonId } = req.params;
    
    // Validate H3 index
    if (!h3Service.isValidH3Index(hexagonId)) {
      return res.status(400).json({
        error: 'Invalid H3 hexagon ID'
      });
    }
    
    // Get hexagon info
    const hexInfo = h3Service.getH3Info(hexagonId);
    
    res.json(hexInfo);
    
  } catch (error) {
    next(error);
  }
}

/**
 * Get neighboring hexagons
 */
async function getNeighbors(req, res, next) {
  try {
    const { hexagonId } = req.params;
    const { rings } = req.query;
    
    // Validate H3 index
    if (!h3Service.isValidH3Index(hexagonId)) {
      return res.status(400).json({
        error: 'Invalid H3 hexagon ID'
      });
    }
    
    const ringSize = parseInt(rings) || 1;
    if (ringSize < 1 || ringSize > 5) {
      return res.status(400).json({
        error: 'Ring size must be between 1 and 5'
      });
    }
    
    // Get neighbors
    const neighbors = h3Service.getH3Neighbors(hexagonId, ringSize);
    
    res.json({
      hexagonId,
      ringSize,
      neighbors,
      count: neighbors.length
    });
    
  } catch (error) {
    next(error);
  }
}

module.exports = {
  coordinatesToH3,
  getHexagonInfo,
  getNeighbors
}; 