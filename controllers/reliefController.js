const imageService = require('../services/imageService');
const h3Service = require('../services/h3Service');
const fs = require('fs');

const DMAP_DIR = process.env.DMAP_DIR || '/usr/local/src/elevation-simple/server/data/dmap';
/**
 * Generate relief image for a hexagon
 */
async function generateReliefImage(req, res, next) {
  try {
    const { hexagonId } = req.params;
    const { width, height, hgtMinScale, hgtMaxScale } = req.query;
    
    // Validate H3 index
    if (!h3Service.isValidH3Index(hexagonId)) {
      return res.status(400).json({
        error: 'Invalid H3 hexagon ID'
      });
    }

    // check if image already exists
    if (fs.existsSync(`${DMAP_DIR}/${hexagonId}_${hgtMinScale}_${hgtMaxScale}.png`)) {
      const imageBuffer = fs.readFileSync(`${DMAP_DIR}/${hexagonId}_${hgtMinScale}_${hgtMaxScale}.png`);
      res.set({
        'Content-Type': 'image/png',
        'Content-Length': imageBuffer.length,
        'Cache-Control': 'public, max-age=3600'
      });
      res.send(imageBuffer);
      return;
    }
    
    // Parse dimensions
    const imageWidth = parseInt(width) || undefined;
    const imageHeight = parseInt(height) || undefined;
    const minScale = parseFloat(hgtMinScale) || undefined;
    const maxScale = parseFloat(hgtMaxScale) || undefined;
    
    // Validate dimensions
    if (imageWidth && (imageWidth < 64 || imageWidth > 2048)) {
      return res.status(400).json({
        error: 'Width must be between 64 and 2048 pixels'
      });
    }
    
    if (imageHeight && (imageHeight < 64 || imageHeight > 2048)) {
      return res.status(400).json({
        error: 'Height must be between 64 and 2048 pixels'
      });
    }
    
    // Generate image
    const imageBuffer = await imageService.generateReliefImage(
      hexagonId, 
      imageWidth, 
      imageHeight,
      minScale,
      maxScale
    );

    // save image to data/images
    fs.writeFileSync(`${DMAP_DIR}/${hexagonId}_${hgtMinScale}_${hgtMaxScale}.png`, imageBuffer);
    
    // Set response headers
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=3600'
    });
    
    // Send image
    res.send(imageBuffer);
    
  } catch (error) {
    if (error.message.includes('No elevation data')) {
      return res.status(404).json({
        error: 'No elevation data available for this hexagon'
      });
    }
    next(error);
  }
}

/**
 * Generate relief image with contour lines
 */
async function generateContourImage(req, res, next) {
  try {
    const { hexagonId } = req.params;
    const { width, height, interval } = req.query;
    
    // Validate H3 index
    if (!h3Service.isValidH3Index(hexagonId)) {
      return res.status(400).json({
        error: 'Invalid H3 hexagon ID'
      });
    }
    
    // Parse parameters
    const imageWidth = parseInt(width) || undefined;
    const imageHeight = parseInt(height) || undefined;
    const contourInterval = parseInt(interval) || 50;
    
    // Validate parameters
    if (imageWidth && (imageWidth < 64 || imageWidth > 2048)) {
      return res.status(400).json({
        error: 'Width must be between 64 and 2048 pixels'
      });
    }
    
    if (imageHeight && (imageHeight < 64 || imageHeight > 2048)) {
      return res.status(400).json({
        error: 'Height must be between 64 and 2048 pixels'
      });
    }
    
    if (contourInterval < 10 || contourInterval > 500) {
      return res.status(400).json({
        error: 'Contour interval must be between 10 and 500 meters'
      });
    }
    
    // Generate image
    const imageBuffer = await imageService.generateContourImage(
      hexagonId, 
      imageWidth, 
      imageHeight,
      contourInterval
    );
    
    // Set response headers
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=3600'
    });
    
    // Send image
    res.send(imageBuffer);
    
  } catch (error) {
    if (error.message.includes('No elevation data')) {
      return res.status(404).json({
        error: 'No elevation data available for this hexagon'
      });
    }
    next(error);
  }
}

/**
 * Get image metadata
 */
async function getImageMetadata(req, res, next) {
  try {
    const { hexagonId } = req.params;
    
    // Validate H3 index
    if (!h3Service.isValidH3Index(hexagonId)) {
      return res.status(400).json({
        error: 'Invalid H3 hexagon ID'
      });
    }
    
    const metadata = await imageService.getImageMetadata(hexagonId);
    
    res.json(metadata);
    
  } catch (error) {
    if (error.message.includes('No elevation data')) {
      return res.status(404).json({
        error: 'No elevation data available for this hexagon'
      });
    }
    next(error);
  }
}

/**
 * Get image cache statistics
 */
async function getImageCacheStats(req, res, next) {
  try {
    const stats = imageService.getCacheStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
}

/**
 * Clear image cache
 */
async function clearImageCache(req, res, next) {
  try {
    imageService.clearCache();
    res.json({ message: 'Image cache cleared successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  generateReliefImage,
  generateContourImage,
  getImageMetadata,
  getImageCacheStats,
  clearImageCache
}; 