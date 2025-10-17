#!/usr/bin/env python3

"""
test_write_gcode.py

Comprehensive test script for the WriteGCode function and GCodeConfig class.
Tests various configurations, error conditions, and validates G-code output.
"""

import os
import sys
import tempfile
import numpy as np
from PIL import Image
import traceback

# Add the current directory to path so we can import write_gcode
sys.path.insert(0, os.path.dirname(__file__))

from write_gcode import WriteGCode, GCodeConfig

class TestResults:
    """Class to track test results"""
    def __init__(self):
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.failures = []
    
    def add_test(self, test_name, passed, error_msg=None):
        self.total_tests += 1
        if passed:
            self.passed_tests += 1
            print(f"✅ {test_name}")
        else:
            self.failed_tests += 1
            self.failures.append((test_name, error_msg))
            print(f"❌ {test_name}: {error_msg}")
    
    def print_summary(self):
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total Tests: {self.total_tests}")
        print(f"Passed: {self.passed_tests}")
        print(f"Failed: {self.failed_tests}")
        print(f"Success Rate: {(self.passed_tests/self.total_tests*100):.1f}%")
        
        if self.failures:
            print(f"\nFAILURES:")
            for test_name, error_msg in self.failures:
                print(f"  • {test_name}: {error_msg}")

def create_test_image(width=100, height=100, pattern="gradient"):
    """
    Create a test heightmap image
    
    Args:
        width (int): Image width in pixels
        height (int): Image height in pixels
        pattern (str): Pattern type - "gradient", "pyramid", "bowl", "random"
    
    Returns:
        PIL.Image: Test image
    """
    if pattern == "gradient":
        # Simple linear gradient from black to white
        data = np.zeros((height, width), dtype=np.uint8)
        for y in range(height):
            data[y, :] = int(255 * y / height)
    
    elif pattern == "pyramid":
        # Pyramid shape - brightest in center
        data = np.zeros((height, width), dtype=np.uint8)
        center_x, center_y = width // 2, height // 2
        for y in range(height):
            for x in range(width):
                dist = min(abs(x - center_x), abs(y - center_y))
                max_dist = min(center_x, center_y)
                intensity = max(0, 255 * (max_dist - dist) / max_dist)
                data[y, x] = int(intensity)
    
    elif pattern == "bowl":
        # Bowl shape - circular depression
        data = np.ones((height, width), dtype=np.uint8) * 255
        center_x, center_y = width // 2, height // 2
        max_radius = min(width, height) // 2
        for y in range(height):
            for x in range(width):
                dist = np.sqrt((x - center_x)**2 + (y - center_y)**2)
                if dist < max_radius:
                    intensity = 255 * (dist / max_radius)
                    data[y, x] = int(intensity)
    
    elif pattern == "random":
        # Random noise pattern
        data = np.random.randint(0, 256, (height, width), dtype=np.uint8)
    
    else:
        # Default to gradient
        return create_test_image(width, height, "gradient")
    
    return Image.fromarray(data, mode='L')

def save_test_image(image, filename):
    """Save test image to temporary file"""
    temp_dir = tempfile.gettempdir()
    filepath = os.path.join(temp_dir, filename)
    image.save(filepath)
    return filepath

def validate_gcode(gcode_lines):
    """
    Validate that G-code output is reasonable
    
    Args:
        gcode_lines (list): List of G-code lines
    
    Returns:
        tuple: (is_valid, error_message)
    """
    if not gcode_lines:
        return False, "No G-code generated"
    
    if not isinstance(gcode_lines, list):
        return False, "G-code output is not a list"
    
    # Check for basic G-code structure
    has_header = False
    has_moves = False
    has_end = False
    
    for line in gcode_lines:
        if not isinstance(line, str):
            return False, f"Non-string line in G-code: {type(line)}"
        
        line = line.strip()
        if line.startswith('('):
            has_header = True
        elif line.startswith('G0') or line.startswith('G1'):
            has_moves = True
        elif line == 'M2':
            has_end = True
    
    if not has_header:
        return False, "No header comments found"
    
    if not has_moves:
        return False, "No movement commands found"
    
    if not has_end:
        return False, "No program end command (M2) found"
    
    return True, "Valid G-code structure"

def test_basic_functionality(results):
    """Test basic WriteGCode functionality"""
    try:
        # Create test image
        test_image = create_test_image(50, 50, "gradient")
        image_path = save_test_image(test_image, "test_basic.png")
        
        # Create config
        config = GCodeConfig()
        config.load_image(image_path)
        
        # Generate G-code
        gcode = WriteGCode(config, rough_flag=0)
        
        # Validate output
        is_valid, msg = validate_gcode(gcode)
        results.add_test("Basic functionality", is_valid, msg if not is_valid else None)
        
        # Cleanup
        os.remove(image_path)
        
    except Exception as e:
        results.add_test("Basic functionality", False, str(e))

def test_rough_pass(results):
    """Test roughing pass functionality"""
    try:
        # Create test image
        test_image = create_test_image(40, 40, "pyramid")
        image_path = save_test_image(test_image, "test_rough.png")
        
        # Create config
        config = GCodeConfig()
        config.load_image(image_path)
        
        # Configure for roughing
        config.ROUGH_DEPTH_PP.set("1.0")  # 1mm per pass
        
        # Generate roughing G-code
        gcode = WriteGCode(config, rough_flag=1)
        
        # Validate output
        is_valid, msg = validate_gcode(gcode)
        results.add_test("Roughing pass", is_valid, msg if not is_valid else None)
        
        # Cleanup
        os.remove(image_path)
        
    except Exception as e:
        results.add_test("Roughing pass", False, str(e))

def test_different_tools(results):
    """Test different tool types"""
    tool_types = ["Ball", "Flat", "V"]
    
    for tool_type in tool_types:
        try:
            # Create test image
            test_image = create_test_image(30, 30, "bowl")
            image_path = save_test_image(test_image, f"test_{tool_type.lower()}.png")
            
            # Create config
            config = GCodeConfig()
            config.load_image(image_path)
            config.set_tool_type(tool_type)
            
            if tool_type == "V":
                config.v_angle.set("60.0")  # Set V-bit angle
            
            # Generate G-code
            gcode = WriteGCode(config, rough_flag=0)
            
            # Validate output
            is_valid, msg = validate_gcode(gcode)
            results.add_test(f"Tool type: {tool_type}", is_valid, msg if not is_valid else None)
            
            # Cleanup
            os.remove(image_path)
            
        except Exception as e:
            results.add_test(f"Tool type: {tool_type}", False, str(e))

def test_scan_patterns(results):
    """Test different scan patterns"""
    patterns = ["Rows", "Columns", "C then R"]
    
    for pattern in patterns:
        try:
            # Create test image
            test_image = create_test_image(25, 25, "gradient")
            image_path = save_test_image(test_image, f"test_scan_{pattern.replace(' ', '_')}.png")
            
            # Create config
            config = GCodeConfig()
            config.load_image(image_path)
            config.set_scan_pattern(pattern)
            
            # Generate G-code
            gcode = WriteGCode(config, rough_flag=0)
            
            # Validate output
            is_valid, msg = validate_gcode(gcode)
            results.add_test(f"Scan pattern: {pattern}", is_valid, msg if not is_valid else None)
            
            # Cleanup
            os.remove(image_path)
            
        except Exception as e:
            results.add_test(f"Scan pattern: {pattern}", False, str(e))

def test_units(results):
    """Test different units (inches vs mm)"""
    units = ["in", "mm"]
    
    for unit in units:
        try:
            # Create test image
            test_image = create_test_image(20, 20, "pyramid")
            image_path = save_test_image(test_image, f"test_{unit}.png")
            
            # Create config
            config = GCodeConfig()
            config.load_image(image_path)
            config.set_units(unit)
            
            # Generate G-code
            gcode = WriteGCode(config, rough_flag=0)
            
            # Validate output
            is_valid, msg = validate_gcode(gcode)
            
            # Check for correct units in G-code
            has_correct_units = False
            expected_code = "G20" if unit == "in" else "G21"
            for line in gcode:
                if expected_code in line:
                    has_correct_units = True
                    break
            
            if is_valid and not has_correct_units:
                is_valid = False
                msg = f"G-code missing {expected_code} units command"
            
            results.add_test(f"Units: {unit}", is_valid, msg if not is_valid else None)
            
            # Cleanup
            os.remove(image_path)
            
        except Exception as e:
            results.add_test(f"Units: {unit}", False, str(e))

def test_config_file_mode(results):
    """Test config file generation mode"""
    try:
        # Create config
        config = GCodeConfig()
        
        # Generate config file (header only)
        gcode = WriteGCode(config, config_file=True)
        
        # Validate it's only header
        is_valid = True
        error_msg = None
        
        if not gcode:
            is_valid = False
            error_msg = "No config generated"
        else:
            # Should only contain comments, no movement commands
            for line in gcode:
                if line.startswith('G0') or line.startswith('G1') or line.startswith('F'):
                    is_valid = False
                    error_msg = "Config mode contains movement commands"
                    break
        
        results.add_test("Config file mode", is_valid, error_msg)
        
    except Exception as e:
        results.add_test("Config file mode", False, str(e))

def test_error_conditions(results):
    """Test error handling"""
    
    # Test with no image loaded
    try:
        config = GCodeConfig()
        # Don't load an image
        gcode = WriteGCode(config, rough_flag=0)
        
        # Should return early with no G-code or handle gracefully
        results.add_test("No image loaded", True)  # Should not crash
        
    except Exception as e:
        results.add_test("No image loaded", False, f"Crashed: {str(e)}")
    
    # Test with invalid image
    try:
        config = GCodeConfig()
        config.im = None  # Explicitly set to None
        gcode = WriteGCode(config, rough_flag=0)
        
        results.add_test("Invalid image", True)  # Should not crash
        
    except Exception as e:
        results.add_test("Invalid image", False, f"Crashed: {str(e)}")

def test_large_image(results):
    """Test with larger image to check performance"""
    try:
        # Create larger test image
        test_image = create_test_image(100, 100, "random")
        image_path = save_test_image(test_image, "test_large.png")
        
        # Create config with faster settings
        config = GCodeConfig()
        config.load_image(image_path)
        config.stepover.set("2.0")  # Larger stepover for speed
        config.tolerance.set("0.01")  # Larger tolerance
        
        # Generate G-code
        gcode = WriteGCode(config, rough_flag=0)
        
        # Validate output
        is_valid, msg = validate_gcode(gcode)
        results.add_test("Large image (100x100)", is_valid, msg if not is_valid else None)
        
        # Cleanup
        os.remove(image_path)
        
    except Exception as e:
        results.add_test("Large image (100x100)", False, str(e))

def test_edge_cases(results):
    """Test edge cases and boundary conditions"""
    
    # Test very small image
    try:
        test_image = create_test_image(5, 5, "gradient")
        image_path = save_test_image(test_image, "test_tiny.png")
        
        config = GCodeConfig()
        config.load_image(image_path)
        gcode = WriteGCode(config, rough_flag=0)
        
        is_valid, msg = validate_gcode(gcode)
        results.add_test("Tiny image (5x5)", is_valid, msg if not is_valid else None)
        
        os.remove(image_path)
        
    except Exception as e:
        results.add_test("Tiny image (5x5)", False, str(e))
    
    # Test with zero depth
    try:
        test_image = create_test_image(20, 20, "gradient")
        image_path = save_test_image(test_image, "test_zero_depth.png")
        
        config = GCodeConfig()
        config.load_image(image_path)
        config.z_cut.set("0.0")  # Zero cutting depth
        gcode = WriteGCode(config, rough_flag=0)
        
        results.add_test("Zero cutting depth", True)  # Should not crash
        
        os.remove(image_path)
        
    except Exception as e:
        results.add_test("Zero cutting depth", False, str(e))

def run_all_tests():
    """Run all tests and return results"""
    results = TestResults()
    
    print("🧪 Starting WriteGCode Tests...")
    print("=" * 60)
    
    # Run test suites
    test_basic_functionality(results)
    test_rough_pass(results)
    test_different_tools(results)
    test_scan_patterns(results)
    test_units(results)
    test_config_file_mode(results)
    test_error_conditions(results)
    test_large_image(results)
    test_edge_cases(results)
    
    return results

def demonstrate_usage():
    """Demonstrate practical usage of the WriteGCode function"""
    print("\n" + "=" * 60)
    print("DEMONSTRATION: Practical Usage Example")
    print("=" * 60)
    
    try:
        # Create a more realistic test pattern
        print("1. Creating test heightmap (bowl pattern)...")
        test_image = create_test_image(80, 80, "bowl")
        image_path = save_test_image(test_image, "demo_heightmap.png")
        print(f"   Saved to: {image_path}")
        
        # Configure for realistic machining
        print("\n2. Configuring for 3-axis CNC machining...")
        config = GCodeConfig()
        config.load_image(image_path)
        
        # Set up for aluminum machining in metric
        config.set_units("mm")
        config.set_tool_type("Ball")
        config.dia.set("6.0")              # 6mm ball end mill
        config.yscale.set("50.0")          # 50mm part size
        config.z_cut.set("10.0")           # 10mm max depth
        config.z_safe.set("15.0")          # 15mm safe height
        config.f_feed.set("800.0")         # 800mm/min feed
        config.p_feed.set("200.0")         # 200mm/min plunge
        config.stepover.set("2.0")         # 2mm stepover (33% of tool)
        
        # Set cutting strategy
        config.set_scan_pattern("Rows")
        config.set_scan_direction("Alternating")
        config.set_origin("Bot-Left")
        
        # Enable arc entry cuts
        config.plungetype.set("arc")
        
        print("   Configuration:")
        for key, value in config.get_config_summary().items():
            print(f"     {key}: {value}")
        
        # Generate roughing pass
        print("\n3. Generating roughing pass G-code...")
        config.ROUGH_DIA.set("12.0")       # 12mm rough end mill
        config.ROUGH_DEPTH_PP.set("3.0")   # 3mm per pass
        config.ROUGH_STEPOVER.set("6.0")   # 6mm roughing stepover
        config.ROUGH_R_FEED.set("1200.0")  # 1200mm/min roughing feed
        
        rough_gcode = WriteGCode(config, rough_flag=1)
        print(f"   Generated {len(rough_gcode)} lines of roughing G-code")
        
        # Generate finishing pass
        print("\n4. Generating finishing pass G-code...")
        finish_gcode = WriteGCode(config, rough_flag=0)
        print(f"   Generated {len(finish_gcode)} lines of finishing G-code")
        
        # Save G-code files
        rough_file = os.path.join(tempfile.gettempdir(), "demo_rough.nc")
        finish_file = os.path.join(tempfile.gettempdir(), "demo_finish.nc")
        
        with open(rough_file, 'w') as f:
            f.write('\n'.join(rough_gcode))
        
        with open(finish_file, 'w') as f:
            f.write('\n'.join(finish_gcode))
        
        print(f"\n5. G-code files saved:")
        print(f"   Roughing: {rough_file}")
        print(f"   Finishing: {finish_file}")
        
        # Show sample output
        print(f"\n6. Sample G-code output (first 10 lines of finish):")
        for i, line in enumerate(finish_gcode[:10]):
            print(f"   {line}")
        
        print(f"\n   ... ({len(finish_gcode)-10} more lines)")
        
        # Cleanup
        os.remove(image_path)
        
        print(f"\n✅ Demonstration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Demonstration failed: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    print("WriteGCode Test Suite")
    print("=" * 60)
    
    # Run tests
    results = run_all_tests()
    
    # Print results
    results.print_summary()
    
    # Run demonstration
    demonstrate_usage()
    
    # Exit with appropriate code
    sys.exit(0 if results.failed_tests == 0 else 1) 