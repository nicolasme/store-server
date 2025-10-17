# Elevation Simple API

A Node.js + Express web application that generates elevation relief images and G-Code for CNC machining based on terrain data from HGT (SRTM) files using Uber H3 hexagon indexing.

## Features

- Convert geographic coordinates to H3 hexagon IDs
- Extract elevation data from SRTM HGT files
- Generate black & white relief images with hexagonal masking
- Generate G-Code for CNC machining of elevation reliefs
  - **Raster strategy**: Traditional back-and-forth pattern with multiple depth passes
  - **Spiral strategy**: Single-pass spiral pattern from center outward
- Generate G-Code for hexagon contour cutting
- Configurable machining parameters
- Efficient caching for HGT files and generated images

## Installation

```bash
# Clone the repository
cd elevation-simple

# Install dependencies
npm install

# Copy HGT files to data/hgt directory
# HGT files can be obtained from NASA SRTM or other elevation data sources

# Start the server
npm start
```

## Configuration

The application uses environment variables for configuration:

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `HGT_DATA_PATH` - Path to HGT files (default: ./data/hgt)

Machining parameters can be configured in `config/constants.js`.

## API Endpoints

### H3 Hexagon Operations

- `GET /api/h3/from-coords?lat={lat}&lng={lng}&zoom={zoom}`
  - Convert coordinates to H3 hexagon ID
  - Zoom levels 0-15 map to H3 resolutions 0-9

- `GET /api/h3/{hexagonId}`
  - Get hexagon information (center, boundary, area)

- `GET /api/h3/{hexagonId}/neighbors`
  - Get neighboring hexagon IDs

### Elevation Data

- `GET /api/h3/{hexagonId}/elevation`
  - Get elevation statistics for a hexagon

- `GET /api/elevation/hgt-files`
  - List available HGT files

- `GET /api/elevation/cache-stats`
  - Get HGT file cache statistics

### Relief Images

- `GET /api/h3/{hexagonId}/relief-image?width={width}&height={height}`
  - Generate grayscale relief image
  - Parameters:
    - `width`: Image width in pixels (64-2048, default: 512)
    - `height`: Image height in pixels (64-2048, default: 512)
    - `format`: Output format (png/jpeg, default: png)
    - `quality`: JPEG quality (1-100, default: 90)

- `GET /api/h3/{hexagonId}/relief-image/contour`
  - Generate relief image with contour lines
  - Same parameters as above plus:
    - `interval`: Contour interval in meters (default: 10)

- `GET /api/h3/{hexagonId}/relief-image/metadata`
  - Get image generation metadata

### G-Code Generation

- `GET /api/h3/{hexagonId}/gcode`
  - Generate G-Code for CNC machining
  - Parameters:
    - `download`: Force download (true/false, default: true)
    - `strategy`: Machining strategy ('raster' or 'spiral', default: 'raster')
    - `endmillDiameter`: Tool diameter in mm
    - `feedRate`: Feed rate in mm/min
    - `plungeRate`: Plunge rate in mm/min
    - `spindleSpeed`: Spindle speed in RPM
    - `stepOver`: Step over distance in mm
    - `depthPerPass`: Depth per pass in mm (raster only)
    - `maxDepth`: Maximum carving depth in mm

- `GET /api/h3/{hexagonId}/gcode/contour`
  - Generate G-Code for hexagon contour cutting
  - Parameters:
    - `download`: Force download (true/false, default: true)
    - `endmillDiameter`: Tool diameter in mm
    - `feedRate`: Feed rate in mm/min
    - `plungeRate`: Plunge rate in mm/min
    - `spindleSpeed`: Spindle speed in RPM
    - `cutDepth`: Total cut depth in mm
    - `depthPerPass`: Depth per pass in mm
    - `offset`: Offset from hexagon edge in mm (negative=inside, positive=outside)
    - `hexagonSize`: Physical hexagon size in mm

- `GET /api/h3/{hexagonId}/gcode/preview`
  - Get G-Code preview with time estimates

- `GET /api/gcode/test`
  - Generate simple test G-Code

- `GET /api/gcode/parameters`
  - Get current machining parameters and available strategies

### Cache Management

- `GET /api/images/cache-stats`
  - Get image cache statistics

- `DELETE /api/images/cache`
  - Clear image cache

## Example Usage

```bash
# Get H3 ID for coordinates
curl "http://localhost:3000/api/h3/from-coords?lat=48.5&lng=2.5&zoom=7"

# Get elevation data
curl "http://localhost:3000/api/h3/861fb0d5fffffff/elevation"

# Generate relief image
curl "http://localhost:3000/api/h3/861fb0d5fffffff/relief-image" -o relief.png

# Generate G-Code with raster strategy
curl "http://localhost:3000/api/h3/861fb0d5fffffff/gcode?strategy=raster&stepOver=2&maxDepth=15" -o terrain-raster.gcode

# Generate G-Code with spiral strategy (single pass)
curl "http://localhost:3000/api/h3/861fb0d5fffffff/gcode?strategy=spiral&stepOver=3&maxDepth=10" -o terrain-spiral.gcode

# Generate hexagon contour G-Code (cut outline)
curl "http://localhost:3000/api/h3/861fb0d5fffffff/gcode/contour?cutDepth=10&offset=-1" -o hexagon-contour.gcode
```

## Machining Strategies

### Raster Strategy
- Traditional back-and-forth pattern
- Multiple depth passes for safety
- Zigzag pattern to minimize rapid movements
- Best for detailed terrain with varying depths

### Spiral Strategy
- Single pass at full depth
- Starts from center and spirals outward
- Continuous cutting motion
- Best for decorative reliefs or when time is critical

### Contour Cutting
- Cuts the hexagon outline
- Multiple depth passes for deep cuts
- Supports offset for inside/outside cuts
- Perfect for cutting out the finished piece

## Test Pages

- `/test-relief.html` - Interactive relief image generation
- `/test-gcode.html` - Interactive G-Code generation with strategy selection

## HGT File Format

The application expects SRTM HGT files in the following format:
- File naming: `N{lat}E{lng}.hgt` or `S{lat}W{lng}.hgt`
- Resolution: 3601x3601 points (1 arc-second) or 1201x1201 points (3 arc-seconds)
- Data format: 16-bit signed integers, big-endian

## Machining Parameters

Default parameters (configurable in `config/constants.js`):
- Endmill diameter: 3.175mm (1/8")
- Feed rate: 1000 mm/min
- Plunge rate: 300 mm/min
- Spindle speed: 18000 RPM
- Step over: 1.5mm
- Depth per pass: 1mm
- Safe height: 5mm
- Max depth: 10mm
- Workpiece height: 20mm
- Hexagon size: 100mm

## Performance

- HGT file caching: Up to 20 files cached in memory
- Image caching: Up to 50 images cached with 1-hour TTL
- Typical relief image generation: ~700ms (first), ~30ms (cached)
- G-Code generation time varies based on complexity and parameters
- Spiral strategy generates smaller files than raster

## Dependencies

- express - Web framework
- h3-js - Uber H3 hexagon indexing
- sharp - Image processing
- cors - CORS middleware
- helmet - Security headers
- morgan - HTTP request logging
- dotenv - Environment variable management

## License

ISC 