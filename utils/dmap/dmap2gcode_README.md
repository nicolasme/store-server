# dmap2gcode CLI Tool

A command-line interface for converting depth map images to G-code for CNC machining. This tool is based on the original dmap2gcode GUI application and provides a programmatic interface suitable for integration with Node.js applications.

## Features

- Convert grayscale images to G-code for CNC milling
- Support for multiple tool types (ball nose, flat end mill, V-bit)
- Configurable cutting parameters (feed rates, depths, stepover)
- Multiple scanning patterns and directions
- JSON output for easy integration with Node.js
- Batch processing capabilities

## Installation

### Prerequisites

1. Python 3.x installed on your system
2. Required Python packages:
   ```bash
   pip install Pillow numpy
   ```

3. Node.js and npm (for the Node.js wrapper)

### Setup

1. Copy the Python CLI script (`dmap2gcode_cli.py`) to your project
2. Copy the Node.js wrapper (`dmap2gcode.js`) to your project
3. Ensure Python is accessible from your system PATH

## Usage

### Command Line (Python)

Basic usage:
```bash
python dmap2gcode_cli.py input_image.png -o output.nc
```

With custom parameters:
```bash
python dmap2gcode_cli.py input.png \
  --output output.nc \
  --yscale 50 \
  --z-safe 5 \
  --z-cut 10 \
  --tool ball \
  --tool-diameter 6 \
  --feed-rate 1000 \
  --units mm
```

Get JSON output for integration:
```bash
python dmap2gcode_cli.py input.png --json > result.json
```

### Node.js Integration

```javascript
const { convertImageToGcode, saveGcode } = require('./dmap2gcode');

// Basic conversion
const result = await convertImageToGcode('depth_map.png');
if (result.success) {
  await saveGcode(result.gcode, 'output.nc');
}

// With custom options
const options = {
  yscale: 50,          // Image height in units
  z_safe: 5,           // Safe Z height
  z_cut: 10,           // Maximum cut depth
  tool: 'ball',        // Tool type: 'ball', 'flat', or 'v'
  tool_diameter: 6,    // Tool diameter
  feed_rate: 1000,     // Cutting feed rate
  plunge_feed: 300,    // Plunge feed rate
  units: 'mm'          // Units: 'in' or 'mm'
};

const result = await convertImageToGcode('input.png', options);
```

## Parameters

### Required Parameters

- `image` - Path to input image file (grayscale PNG, JPG, or GIF)

### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `yscale` | float | 1.0 | Height of the image in units |
| `z_safe` | float | 0.25 | Safe Z height above work |
| `z_cut` | float | 0.25 | Maximum cutting depth |
| `tool` | string | 'ball' | Tool type: 'ball', 'flat', or 'v' |
| `tool_diameter` | float | 0.25 | Tool diameter in units |
| `v_angle` | float | 45 | V-bit angle (degrees) for V tools |
| `feed_rate` | float | 100 | Cutting feed rate |
| `plunge_feed` | float | 25 | Plunge feed rate |
| `stepover` | float | 0.1 | Distance between cutting passes |
| `units` | string | 'in' | Units: 'in' or 'mm' |
| `origin` | string | 'default' | Origin position (see below) |
| `invert` | boolean | false | Invert the depth map |
| `normalize` | boolean | true | Normalize depth values |
| `scan_pattern` | string | 'rows' | Scanning pattern: 'rows', 'columns', or 'both' |
| `scan_direction` | string | 'alternating' | Direction: 'alternating', 'positive', or 'negative' |
| `disable_arcs` | boolean | false | Disable arc moves (for GRBL compatibility) |

### Origin Positions

- `default` - Origin at 0,0
- `top-left`, `top-center`, `top-right`
- `center` - Center of the workpiece
- `bottom-left`, `bottom-center`, `bottom-right`

## Image Requirements

- Images should be grayscale (color images will be converted)
- Black pixels represent the deepest cuts
- White pixels represent the highest points (least cutting)
- Gray values create intermediate depths
- 16-bit grayscale images are supported for higher precision

## Examples

### Example 1: Simple Wood Carving

```javascript
const options = {
  yscale: 100,         // 100mm wide carving
  z_cut: 5,            // 5mm maximum depth
  tool: 'ball',
  tool_diameter: 3,    // 3mm ball nose
  feed_rate: 800,      // 800mm/min
  stepover: 1,         // 1mm stepover
  units: 'mm'
};

await convertAndSave('logo.png', 'logo_carving.nc', options);
```

### Example 2: V-Bit Engraving

```javascript
const options = {
  yscale: 4,           // 4 inch wide
  z_cut: 0.125,        // 1/8 inch deep
  tool: 'v',
  tool_diameter: 0.5,  // 1/2 inch V-bit
  v_angle: 60,         // 60 degree V-bit
  feed_rate: 40,       // 40 IPM
  stepover: 0.05,      // Fine detail
  units: 'in'
};

await convertAndSave('text.png', 'engraving.nc', options);
```

### Example 3: Foam Roughing

```javascript
const options = {
  yscale: 200,         // 200mm
  z_cut: 50,           // 50mm deep
  tool: 'flat',        // Flat end mill
  tool_diameter: 10,   // 10mm diameter
  feed_rate: 3000,     // Fast roughing
  stepover: 7,         // 70% stepover
  disable_arcs: true,  // For GRBL
  units: 'mm'
};

await convertAndSave('terrain.png', 'foam_rough.nc', options);
```

## Output G-Code

The generated G-code includes:

- Safety headers and initialization
- Tool paths based on the depth map
- Rapid moves at safe height
- Feed rate controls
- Arc interpolation (when enabled)
- Program end codes

## Troubleshooting

### Common Issues

1. **"Python not found"** - Ensure Python is in your system PATH
2. **"PIL not found"** - Install Pillow: `pip install Pillow`
3. **"Image file not found"** - Check file path and permissions
4. **Large file sizes** - Reduce image resolution or increase stepover
5. **Slow processing** - Install NumPy for faster processing: `pip install numpy`

### Performance Tips

- Use smaller images (100-500 pixels) for faster processing
- Increase stepover for roughing passes
- Disable arcs if not needed
- Use NumPy for significant speed improvements

## Integration with CNC Software

The generated G-code is compatible with most CNC control software including:

- LinuxCNC
- Mach3/Mach4  
- GRBL (with `disable_arcs: true`)
- Universal Gcode Sender
- CNCjs

## License

This CLI tool is based on dmap2gcode by Scorch and maintains the same GPL v3 license.

## Contributing

Feel free to submit issues and enhancement requests!

## Credits

- Original dmap2gcode by Scorch
- Based on image-to-gcode.py by Chris Radek and Jeff Epler 