#!/usr/bin/env python3

"""
run_tests.py

Simple test runner for the WriteGCode function.
Runs the test script and provides easy command-line interface.
"""

import sys
import os

def main():
    """Main test runner"""
    print("WriteGCode Function Test Runner")
    print("=" * 50)
    
    # Check dependencies
    try:
        import numpy as np
        print("✅ NumPy available")
    except ImportError:
        print("❌ NumPy not available - some tests may fail")
    
    try:
        from PIL import Image
        print("✅ PIL available")
    except ImportError:
        print("❌ PIL not available - tests will fail")
        return 1
    
    # Run the main test script
    try:
        print("\nRunning test script...")
        os.system(f"python3 {os.path.join(os.path.dirname(__file__), 'test_write_gcode.py')}")
        return 0
    except Exception as e:
        print(f"❌ Failed to run tests: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 