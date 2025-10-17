const elevationService = require('../services/elevationService');
const h3Service = require('../services/h3Service');

/**
 * Get elevation data for a hexagon
 */
async function getHexagonElevation(req, res, next) {
  try {
    const { hexagonId } = req.params;
    
    // Validate H3 index
    if (!h3Service.isValidH3Index(hexagonId)) {
      return res.status(400).json({
        error: 'Invalid H3 hexagon ID'
      });
    }
    
    // Get elevation data
    const elevationData = await elevationService.getHexagonElevation(hexagonId);
    
    // Check if we have data
    if (elevationData.statistics.samples === 0) {
      return res.status(404).json({
        error: 'No elevation data available for this hexagon',
        requiredTiles: elevationData.requiredTiles
      });
    }
    
    res.json({
      h3Index: elevationData.h3Index,
      center: elevationData.hexInfo.center,
      statistics: elevationData.statistics,
      requiredTiles: elevationData.requiredTiles,
      sampleCount: elevationData.elevationData.length
    });
    
  } catch (error) {
    next(error);
  }
}

/**
 * Get available HGT files
 */
async function getAvailableHgtFiles(req, res, next) {
  try {
    const files = await elevationService.getAvailableHgtFiles();
    
    res.json({
      count: files.length,
      files: files.sort((a, b) => {
        if (a.lat !== b.lat) return b.lat - a.lat;
        return a.lng - b.lng;
      })
    });
    
  } catch (error) {
    next(error);
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats(req, res, next) {
  try {
    const stats = elevationService.getCacheStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getHexagonElevation,
  getAvailableHgtFiles,
  getCacheStats
}; 