#!/usr/bin/env python3

"""
generate_gcode.py

Simple script to generate G-code from heightmap images using the WriteGCode function.

Usage:
    python generate_gcode.py input_image.png output.gcode
    
Or modify the configuration section below and run:
    python generate_gcode.py
"""

import sys
import os
import json  # Python 3.11+

from write_gcode import GCodeConfig, WriteGCode

def load_config_from_toml(config_file="dmapConfig.json"):
    """
    Load configuration from JSON file.
    Returns a dictionary with the configuration values.
    """

    try:
        with open(config_file, 'rb') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Warning: Config file '{config_file}' not found. Using default configuration.")
        return None
    except Exception as e:
        print(f"Error reading config file '{config_file}': {e}")
        return None

def create_default_config():
    """
    Create a default configuration for G-code generation.
    First tries to read from dmapConfig.toml, falls back to hardcoded defaults.
    """
    config = GCodeConfig()
    
    # Try to load from TOML file
    json_config = load_config_from_toml()
    
    if json_config:
        # Load from JSON file
        basic = json_config.get('basic', {})
        roughing = json_config.get('roughing', {})
        advanced = json_config.get('advanced', {})
        
        # Basic settings
        config.set_units(basic.get('units', 'mm'))
        config.set_tool_type(basic.get('tool_type', 'Ball'))
        config.dia.set(str(basic.get('dia', 4.0)))
        config.v_angle.set(str(basic.get('v_angle', 60.0)))
        
        # Workpiece dimensions
        config.yscale.set(str(basic.get('yscale', 150.0)))
        config.z_cut.set(str(basic.get('z_cut', -20.0)))
        config.z_safe.set(str(basic.get('z_safe', 10.0)))
        
        # Feed rates
        config.f_feed.set(str(basic.get('f_feed', 3000.0)))
        config.p_feed.set(str(basic.get('p_feed', 1500.0)))
        
        # Cutting strategy
        config.stepover.set(str(basic.get('stepover', 1.0)))
        config.set_scan_pattern(basic.get('scan_pattern', 'Rows'))
        config.set_scan_direction(basic.get('scan_direction', 'Alternating'))
        config.set_origin(basic.get('origin', 'Mid-Center'))
        
        # Quality settings
        config.tolerance.set(str(basic.get('tolerance', 0.05)))
        config.plungetype.set(basic.get('plungetype', 'simple'))
        
        # Image processing
        config.invert.set(basic.get('invert', False))
        config.normalize.set(basic.get('normalize', True))
        config.cuttop.set(basic.get('cuttop', True))
        
        # Roughing pass settings
        config.ROUGH_TOOL.set(roughing.get('tool', 'Flat'))
        config.ROUGH_DIA.set(str(roughing.get('dia', 6.0)))
        config.ROUGH_STEPOVER.set(str(roughing.get('stepover', 3.0)))
        config.ROUGH_DEPTH_PP.set(str(roughing.get('depth_per_pass', 3.0)))
        config.ROUGH_R_FEED.set(str(roughing.get('feed_rate', 5000.0)))
        config.ROUGH_P_FEED.set(str(roughing.get('plunge_rate', 1500.0)))
        config.ROUGH_OFFSET.set(str(roughing.get('offset', 1.0)))
        
        # Advanced settings
        config.cutperim.set(advanced.get('cutperim', False))
        config.disable_arcs.set(advanced.get('disable_arcs', True))
        config.splitstep.set(str(advanced.get('splitstep', 0.0)))
        config.lace_bound.set(advanced.get('lace_bound', 'None'))
        config.cangle.set(str(advanced.get('cangle', 45.0)))
        
        # G-code prefix and suffix
        gpre_commands = advanced.get('gpre', ['G17 G90 M3 S24000', 'G4 P5000'])
        if isinstance(gpre_commands, list):
            for cmd in gpre_commands:
                config.gpre.set(cmd)
        else:
            config.gpre.set(str(gpre_commands))
            
        gpost_commands = advanced.get('gpost', ['M5', 'M30'])
        if isinstance(gpost_commands, list):
            config.gpost.set(' '.join(gpost_commands))
        else:
            config.gpost.set(str(gpost_commands))
            
        print("Configuration loaded from dmapConfig.json")
        
    else:
        # Fallback to hardcoded defaults
        print("Using hardcoded default configuration")
        
        # Basic settings
        config.set_units("mm")
        config.set_tool_type("Ball")
        config.dia.set("4.0")
        config.v_angle.set("60.0")
        
        # Workpiece dimensions
        config.yscale.set("150.0")
        config.z_cut.set("-20.0")
        config.z_safe.set("10.0")
        
        # Feed rates
        config.f_feed.set("3000.0")
        config.p_feed.set("1500.0")
        
        # Cutting strategy
        config.stepover.set("1.0")
        config.set_scan_pattern("Rows")
        config.set_scan_direction("Alternating")
        config.set_origin("Mid-Center")
        
        # Quality settings
        config.tolerance.set("0.05")
        config.plungetype.set("simple")
        
        # Image processing
        config.invert.set(False)
        config.normalize.set(True)
        config.cuttop.set(True)
        
        # Roughing pass settings
        config.ROUGH_TOOL.set("Flat")
        config.ROUGH_DIA.set("6.0")
        config.ROUGH_STEPOVER.set("3.0")
        config.ROUGH_DEPTH_PP.set("3.0")
        config.ROUGH_R_FEED.set("5000.0")
        config.ROUGH_P_FEED.set("1500.0")
        config.ROUGH_OFFSET.set("1.0")
        
        # Advanced settings
        config.cutperim.set(False)
        config.disable_arcs.set(True)
        config.splitstep.set("0.0")
        config.lace_bound.set("None")
        config.cangle.set("45.0")
        
        # G-code prefix and suffix
        config.gpre.set("G17 G90 M3 S24000")
        config.gpre.set("G4 P5000")
        config.gpost.set("M5 M30")
    
    return config

def save_gcode(gcode_lines, output_file):
    """Save G-code lines to a file"""
    try:
        with open(output_file, 'w') as f:
            for line in gcode_lines:
                f.write(line + '\n')
        print(f"G-code saved to: {output_file}")
        print(f"Total lines: {len(gcode_lines)}")
    except Exception as e:
        print(f"Error saving G-code: {e}")

def print_config_summary(config):
    """Print a summary of the current configuration"""
    print("\n=== Configuration Summary ===")
    summary = config.get_config_summary()
    for key, value in summary.items():
        print(f"  {key}: {value}")
    print()

def main():
    # =============================================================================
    # CONFIGURATION - Edit these paths if not using command line arguments
    # =============================================================================
    
    default_image = "relief-image.png"      # Default input image
    default_output = "output.gcode"      # Default output file
    
    # Parse command line arguments
    if len(sys.argv) >= 3:
        image_path = sys.argv[1]
        output_path = sys.argv[2]
    elif len(sys.argv) == 2:
        image_path = sys.argv[1]
        output_path = default_output
    else:
        image_path = default_image
        output_path = default_output
        print(f"Using default files: {image_path} -> {output_path}")
        print("Usage: python generate_gcode.py <input_image> [output_file]")
    
    # Check if input file exists
    if not os.path.exists(image_path):
        print(f"Error: Input image '{image_path}' not found!")
        print("Please check the file path or provide a valid image file.")
        return 1
    
    # Create configuration
    print("Creating configuration...")
    config = create_default_config()
    
    # Load the image
    print(f"Loading image: {image_path}")
    config.load_image(image_path)
    
    if config.im is None:
        print("Error: Could not load the image!")
        print("Supported formats: PNG, JPEG, BMP, TIFF, etc.")
        return 1
    
    # Display configuration
    print_config_summary(config)
    
    # Ask user about roughing pass
    generate_rough = input("Generate roughing pass? (y/n): ").lower().startswith('y')
    
    gcode_lines = []

    # print(config)
    
    if generate_rough:
        print("\nGenerating roughing pass...")
        try:
            rough_gcode = WriteGCode(config, rough_flag=1)
            if rough_gcode:
                gcode_lines.extend(rough_gcode)
                print(f"Roughing pass: {len(rough_gcode)} lines")
            else:
                print("Warning: No roughing G-code generated")

            save_gcode(rough_gcode, 'relief-rough.gcode')
        except Exception as e:
            import traceback
            print(f"Error generating roughing pass: {e}")
            print("\nDetailed traceback:")
            traceback.print_exc()
            return 1
    
    print("\nGenerating finish pass...")
    try:
        finish_gcode = WriteGCode(config, rough_flag=0)
        if finish_gcode:
            if gcode_lines:
                # Add separation comment between passes
                gcode_lines.append("(--- Finish Pass ---)")
            # gcode_lines.extend(finish_gcode)
            print(f"Finish pass: {len(finish_gcode)} lines")

            save_gcode(finish_gcode, 'relief-finish.gcode')
        else:
            print("Error: No finish G-code generated")
            return 1
    except Exception as e:
        print(f"Error generating finish pass: {e}")
        return 1
    
    # Save the output
    # print(f"\nSaving G-code to: {output_path}")
    # save_gcode(gcode_lines, output_path)
    
    # Print some statistics
    # rapid_moves = sum(1 for line in gcode_lines if line.startswith('G0'))
    # cut_moves = sum(1 for line in gcode_lines if line.startswith('G1'))
    # arc_moves = sum(1 for line in gcode_lines if line.startswith('G2') or line.startswith('G3'))
    
    # print(f"\n=== G-code Statistics ===")
    # print(f"  Total lines: {len(gcode_lines)}")
    # print(f"  Rapid moves (G0): {rapid_moves}")
    # print(f"  Linear moves (G1): {cut_moves}")
    # print(f"  Arc moves (G2/G3): {arc_moves}")
    
    print(f"\nG-code generation complete!")
    # print(f"Output file: {output_path}")
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 