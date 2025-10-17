# G-Code Generation Script

This script (`generate_gcode.py`) provides an easy way to generate CNC G-code from heightmap images using the WriteGCode function.

## Quick Start

### Command Line Usage

```bash
# Generate G-code with command line arguments
python generate_gcode.py input_image.png output.gcode

# Use default output filename
python generate_gcode.py my_heightmap.png

# Use default files (edit script to change defaults)
python generate_gcode.py
```

### Configuration

The script provides sensible defaults that you can easily modify by editing the `create_default_config()` function:

#### Basic Settings (Most Important)
- **Units**: `"mm"` (metric) or `"in"` (imperial)
- **Tool Type**: `"Ball"`, `"Flat"`, or `"V"`
- **Tool Diameter**: e.g., `"3.175"` (1/8" in mm)
- **Image Scale**: `"50.0"` (real-world height in units)
- **Max Depth**: `"5.0"` (maximum cutting depth)
- **Feed Rate**: `"300.0"` (cutting speed in units/min)

#### Example Configuration for Different Setups

**Metric Setup (Default):**
```python
config.set_units("mm")
config.dia.set("3.175")          # 1/8" ball end mill
config.yscale.set("50.0")        # 50mm image height
config.z_cut.set("5.0")          # 5mm max depth
config.f_feed.set("300.0")       # 300mm/min
```

**Imperial Setup:**
```python
config.set_units("in")
config.dia.set("0.125")          # 1/8" ball end mill
config.yscale.set("2.0")         # 2" image height
config.z_cut.set("0.2")          # 0.2" max depth
config.f_feed.set("12.0")        # 12 in/min
```

**V-Bit Engraving:**
```python
config.set_tool_type("V")
config.dia.set("6.35")           # 1/4" V-bit
config.v_angle.set("60.0")       # 60-degree V-bit
config.yscale.set("25.0")        # 25mm image height
config.z_cut.set("1.0")          # 1mm max depth
```

## Features

### Interactive Options
- **Roughing Pass**: The script asks if you want to generate a roughing pass
- **Configuration Summary**: Shows your settings before generation
- **Statistics**: Reports G-code statistics after generation

### Supported Image Formats
- PNG (recommended for heightmaps)
- JPEG
- BMP
- TIFF
- Any format supported by PIL/Pillow

### Output Features
- **Complete G-code**: Ready to run on CNC machine
- **Multiple Passes**: Optional roughing + finish passes
- **Arc Moves**: Smooth toolpaths with G02/G03
- **Statistics**: Move counts and file info

## Configuration Options

### Tool Settings
```python
config.set_tool_type("Ball")     # Tool type: Ball, Flat, V
config.dia.set("3.175")          # Tool diameter
config.v_angle.set("60.0")       # V-bit angle (for V tools)
```

### Cutting Strategy
```python
config.stepover.set("1.0")               # Distance between passes
config.set_scan_pattern("Rows")          # Rows, Columns, C then R
config.set_scan_direction("Alternating") # Cutting direction
config.set_origin("Bot-Left")            # Coordinate origin
```

### Quality Settings
```python
config.tolerance.set("0.1")      # Path accuracy (smaller = more precise)
config.plungetype.set("arc")     # Entry cut type: simple or arc
```

### Image Processing
```python
config.invert.set(False)         # Invert: white=deep, black=shallow
config.normalize.set(True)       # Normalize brightness range
config.cuttop.set(True)          # Cut above surface level
```

### Roughing Pass
```python
config.ROUGH_TOOL.set("Flat")    # Roughing tool type
config.ROUGH_DIA.set("6.35")     # Larger roughing tool
config.ROUGH_STEPOVER.set("3.0") # Faster roughing stepover
config.ROUGH_DEPTH_PP.set("2.0") # Depth per roughing pass
config.ROUGH_OFFSET.set("0.5")   # Material left for finish pass
```

## Example Workflows

### Simple 2D Engraving
1. Create or find a grayscale heightmap image
2. Set small tool diameter and shallow depth
3. Use "Rows" or "Columns" pattern
4. Generate finish pass only

### 3D Relief Carving
1. Use high-resolution heightmap
2. Generate roughing pass with large tool
3. Generate finish pass with small ball end mill
4. Use "C then R" pattern for best surface finish

### V-Bit Engraving
1. Use high-contrast image (black/white)
2. Set tool type to "V"
3. Configure appropriate V-angle
4. Use shallow cutting depth

## Output Files

The generated G-code includes:
- Configuration comments (for reference)
- Spindle control commands
- Proper G-code initialization
- Optimized toolpaths
- Safe Z-height moves
- Program termination

## Troubleshooting

### Common Issues

**"No Image Loaded" Error:**
- Check file path is correct
- Ensure image format is supported
- Verify PIL/Pillow is installed

**G-code Too Dense:**
- Increase `tolerance` value (e.g., 0.2 or 0.5)
- Increase `stepover` value
- Use larger tool diameter

**G-code Too Rough:**
- Decrease `tolerance` value (e.g., 0.05)
- Decrease `stepover` value
- Use smaller tool diameter

**Cutting Too Deep:**
- Decrease `z_cut` value
- Check image is correct (white should be high areas)
- Try `invert.set(True)` if image appears inverted

### Dependencies
- Python 3.x
- PIL/Pillow for image processing
- NumPy (optional, for better performance)

## Customization

To create custom configurations, modify the `create_default_config()` function or create multiple configuration functions for different types of work:

```python
def create_engraving_config():
    config = GCodeConfig()
    config.set_units("mm")
    config.set_tool_type("V")
    config.dia.set("6.35")
    config.v_angle.set("30.0")
    # ... more engraving-specific settings
    return config

def create_relief_config():
    config = GCodeConfig()
    config.set_units("mm")
    config.set_tool_type("Ball")
    config.dia.set("1.5")
    # ... more relief-specific settings
    return config
```

Then call the appropriate function in `main()` based on your needs. 