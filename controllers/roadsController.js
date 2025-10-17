const roadsService = require('../services/roadsService');
const fs = require('fs');

const ROADS_DIR = process.env.ROADS_DIR || '/usr/local/src/elevation-simple/server/data/images/roads';
/**
 * Generate roads image for an H3 hexagon
 */
async function generateRoadsImage(req, res, next) {
  try {
    const { hexagonId } = req.params;
    const { 
      width, 
      height, 
      styles,
      backgroundColor,
      forceRegenerate,
      drawHexagonBorder,
      hexagonBorderColor,
      hexagonBorderWidth,
      hexagonBorderDash,
      hgtMinScale,
      hgtMaxScale
    } = req.query;

    // Parse dimensions
    const imageWidth = 1024//parseInt(width) || 600;
    const imageHeight = 1024//parseInt(height) || 600;
    
    // Validate dimensions
    if (imageWidth < 64 || imageWidth > 2048) {
      return res.status(400).json({
        error: 'Width must be between 64 and 2048 pixels'
      });
    }
    
    if (imageHeight < 64 || imageHeight > 2048) {
      return res.status(400).json({
        error: 'Height must be between 64 and 2048 pixels'
      });
    }

    // Parse road styles if provided
    let roadTypes = undefined;
    if (styles) {
      try {
        roadTypes = JSON.parse(styles);
      } catch (e) {
        return res.status(400).json({
          error: 'Invalid road styles format'
        });
      }
    }

    // Parse hexagon border style
    let hexagonBorderStyle = {
      color: hexagonBorderColor || "#FF0000",
      width: parseInt(hexagonBorderWidth) || 2,
      dash: hexagonBorderDash ? hexagonBorderDash.split(',').map(n => parseInt(n)) : []
    };

    // Generate the roads image
    const imageBuffer = await roadsService.generateRoadsImage(hexagonId, {
      roadTypes,
      imageWidth,
      imageHeight,
      padding: 0,
      backgroundColor: backgroundColor || "rgba(255, 255, 255, 0)",
      forceRegenerate: true, //forceRegenerate === 'true',
      drawHexagonBorder: true, //drawHexagonBorder === 'true',
      hexagonBorderStyle
    });

    // // Generate G-code
    // const gcode = await roadsService.generateRoadsGcode(hexagonId, hgtMinScale, hgtMaxScale, 10, 1000);

    // save image to data/images
    fs.writeFileSync(`${ROADS_DIR}/${hexagonId}.png`, imageBuffer);

    // Set response headers
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=3600'
    });
    
    // Send image buffer
    res.send(imageBuffer);

  } catch (error) {
    if (error.message === 'Invalid H3 hexagon ID') {
      return res.status(400).json({ error: error.message });
    }
    if (error.message.includes('No elevation data')) {
      return res.status(404).json({
        error: 'No elevation data available for this hexagon'
      });
    }
    next(error);
  }
}

/**
 * Get roads metadata for an H3 hexagon
 */
async function getRoadsMetadata(req, res, next) {
  try {
    const { hexagonId } = req.params;
    
    // Return metadata including available road types
    res.json({
      hexagonId,
      supportedRoadTypes: Object.keys(roadsService.DEFAULT_ROAD_STYLES),
      defaultStyles: roadsService.DEFAULT_ROAD_STYLES,
      usage: {
        example: 'Pass styles as JSON string in query parameter',
        queryParam: 'styles',
        format: JSON.stringify({
          motorway: { color: "#FF0000", width: 4 },
          primary: { color: "#0000FF", width: 3 }
        })
      },
      parameters: {
        width: {
          type: 'integer',
          default: 600,
          min: 64,
          max: 2048,
          description: 'Image width in pixels'
        },
        height: {
          type: 'integer',
          default: 600,
          min: 64,
          max: 2048,
          description: 'Image height in pixels'
        },
        backgroundColor: {
          type: 'string',
          default: 'rgba(255, 255, 255, 0)',
          description: 'Background color in CSS format'
        },
        forceRegenerate: {
          type: 'boolean',
          default: false,
          description: 'Force regeneration even if cached'
        },
        drawHexagonBorder: {
          type: 'boolean',
          default: false,
          description: 'Draw the hexagon boundary border'
        },
        hexagonBorderColor: {
          type: 'string',
          default: '#FF0000',
          description: 'Hexagon border color in CSS format'
        },
        hexagonBorderWidth: {
          type: 'integer',
          default: 2,
          min: 1,
          max: 10,
          description: 'Hexagon border width in pixels'
        },
        hexagonBorderDash: {
          type: 'string',
          default: '',
          description: 'Dash pattern for border (comma-separated numbers, e.g., "5,5" for dashed line)'
        }
      }
    });

  } catch (error) {
    next(error);
  }
}

async function generateRoadsGcode(req, res, next) {
  try {
    const { hexagonId } = req.params;
    const { hgtMinScale, hgtMaxScale, safeZ, feedRate } = req.query;

    console.log(`Generating roads G-code for hexagon ${hexagonId} with params: hgtMinScale=${hgtMinScale}, hgtMaxScale=${hgtMaxScale}, safeZ=${safeZ}, feedRate=${feedRate}`);

    const gcode = await roadsService.generateRoadsGcode(hexagonId, hgtMinScale, hgtMaxScale, safeZ, feedRate);

    res.send(gcode);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  generateRoadsImage,
  getRoadsMetadata,
  generateRoadsGcode
}; 