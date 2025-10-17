# Elevation Simple Web App - Project Plan

## Overview
A Node.js + Express web application that provides elevation data services using H3 hexagonal grid system and HGT elevation files.

## Core Technologies
- Node.js + Express
- Uber H3 library for hexagonal grid system
- HGT file parsing for elevation data (SRTM format)
- Sharp or Canvas for image generation
- G-Code generation for CNC machining

## API Endpoints

### 1. GET /api/h3/from-coords
Convert coordinates and zoom level to H3 hexagon ID
- Query params: lat, lng, zoom
- Response: { hexagonId: string }

### 2. GET /api/h3/:hexagonId/relief-image
Generate black and white relief image for hexagon
- Params: hexagonId
- Query params: width (default: 512), height (default: 512)
- Response: PNG image (binary)
- Black = lowest elevation, White = highest elevation

### 3. GET /api/h3/:hexagonId/gcode
Generate G-Code file for CNC machining
- Params: hexagonId
- Response: G-Code text file

## Project Structure
```
elevation-simple/
├── server.js                 # Main Express server
├── package.json
├── .env                      # Environment variables
├── config/
│   ├── constants.js          # Machining parameters & constants
│   └── database.js           # (Optional) DB config if needed
├── controllers/
│   ├── h3Controller.js      # H3 conversion logic
│   ├── reliefController.js  # Relief image generation
│   └── gcodeController.js   # G-Code generation
├── services/
│   ├── h3Service.js         # H3 hexagon calculations
│   ├── elevationService.js  # HGT file reading & processing
│   ├── imageService.js      # Image generation
│   └── gcodeService.js      # G-Code generation logic
├── utils/
│   ├── hgtParser.js         # Parse HGT files
│   └── coordinateUtils.js   # Coordinate transformations
├── data/
│   └── hgt/                 # HGT files (1x1 degree tiles)
└── public/                  # Static files (if needed)
```

## Machining Parameters (config/constants.js)
```javascript
module.exports = {
  machining: {
    endmillDiameter: 3.175,      // mm (1/8 inch)
    feedRate: 1000,              // mm/min
    plungeRate: 300,             // mm/min
    spindleSpeed: 18000,         // RPM
    stepOver: 1.5,               // mm
    depthPerPass: 1.0,           // mm
    safeHeight: 5,               // mm above workpiece
    maxDepth: 10,                // mm maximum carving depth
    workpieceHeight: 20,         // mm
    hexagonSize: 100,            // mm (physical size)
  },
  image: {
    defaultWidth: 512,
    defaultHeight: 512,
  }
};
```

## Implementation Steps

### Phase 1: Setup & Core Infrastructure
1. Initialize Node.js project with Express
2. Install dependencies: express, h3-js, sharp/canvas, cors, dotenv
3. Set up basic Express server with error handling
4. Create project structure

### Phase 2: H3 Integration
1. Implement coordinate to H3 conversion endpoint
2. Add H3 boundary calculation utilities
3. Test with various zoom levels (0-15)

### Phase 3: HGT File Processing
1. Implement HGT file parser (3601x3601 grid)
2. Create elevation data extraction for H3 boundaries
3. Handle multiple HGT tiles for large hexagons
4. Add caching mechanism for performance

### Phase 4: Relief Image Generation
1. Convert elevation data to normalized values (0-255)
2. Generate grayscale image using Sharp or Canvas
3. Apply smoothing/interpolation if needed
4. Implement image caching

### Phase 5: G-Code Generation
1. Convert elevation data to 3D toolpaths
2. Implement contouring strategy
3. Add safety features (safe heights, boundaries)
4. Generate optimized toolpaths
5. Output standard G-Code format

### Phase 6: Testing & Optimization
1. Unit tests for each service
2. Integration tests for endpoints
3. Performance optimization (caching, async processing)
4. Error handling improvements

## Key Algorithms

### HGT File Reading
- Each file covers 1x1 degree
- 3601x3601 16-bit signed integers (big-endian)
- Filename format: N{lat}E{lon}.hgt

### H3 to Geographic Bounds
```javascript
const h3 = require('h3-js');
const bounds = h3.cellToBoundary(hexagonId);
// Returns array of [lat, lng] pairs
```

### Elevation Interpolation
- Bilinear interpolation for smooth elevation data
- Handle edge cases at HGT tile boundaries

### G-Code Generation Strategy
1. Raster pattern (back and forth)
2. Calculate Z height based on elevation
3. Add lead-in/lead-out moves
4. Optimize for minimal tool lifts

## Environment Variables (.env)
```
PORT=3000
HGT_DATA_PATH=./data/hgt
CACHE_ENABLED=true
CACHE_TTL=3600
MAX_HEXAGON_RESOLUTION=9
```

## Dependencies
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "h3-js": "^4.1.0",
    "sharp": "^0.32.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "morgan": "^1.10.0",
    "helmet": "^7.0.0"
  }
}
```

## API Examples

### Get H3 ID from coordinates
```
GET /api/h3/from-coords?lat=48.8566&lng=2.3522&zoom=7
Response: { "hexagonId": "871fa0003ffffff" }
```

### Get relief image
```
GET /api/h3/871fa0003ffffff/relief-image?width=1024&height=1024
Response: Binary PNG image
```

### Get G-Code
```
GET /api/h3/871fa0003ffffff/gcode
Response: G-Code text file
```

## Performance Considerations
- Cache processed hexagon data
- Use streaming for large G-Code files
- Implement request queuing for heavy operations
- Consider WebSocket for progress updates

## Security
- Validate H3 IDs
- Limit hexagon resolution to prevent huge areas
- Rate limiting on endpoints
- Input sanitization

## Future Enhancements
- WebSocket for real-time progress
- Batch processing endpoints
- 3D preview generation
- Multiple G-Code strategies
- Support for different CNC machines
- Database for processed results 