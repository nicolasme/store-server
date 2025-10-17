# WriteGCode Function Tests

This directory contains comprehensive tests for the WriteGCode function and GCodeConfig class.

## Files

- `write_gcode.py` - Main library with WriteGCode function and dependencies
- `test_write_gcode.py` - Comprehensive test suite
- `run_tests.py` - Simple test runner
- `README_TESTS.md` - This file

## Prerequisites

Before running tests, ensure you have the required dependencies:

```bash
pip install numpy pillow
```

## Running Tests

### Option 1: Simple Test Runner
```bash
python3 run_tests.py
```

### Option 2: Direct Test Execution
```bash
python3 test_write_gcode.py
```

## Test Categories

### 1. Basic Functionality Tests
- ✅ Basic G-code generation
- ✅ Config file mode
- ✅ Error handling

### 2. Tool Type Tests
- ✅ Ball end mill
- ✅ Flat end mill  
- ✅ V-bit tool

### 3. Scan Pattern Tests
- ✅ Row scanning
- ✅ Column scanning
- ✅ Columns then Rows

### 4. Unit Tests
- ✅ Inch units (G20)
- ✅ Metric units (G21)

### 5. Pass Type Tests
- ✅ Finishing pass
- ✅ Roughing pass

### 6. Edge Case Tests
- ✅ Very small images
- ✅ Large images
- ✅ Zero cutting depth
- ✅ No image loaded

## Test Output

The test script generates:

1. **Test Results**: Pass/fail status for each test
2. **Summary Statistics**: Total tests, pass rate, failures
3. **Demonstration**: Practical usage example with realistic settings
4. **Sample Files**: Generated G-code files in temp directory

## Example Output

```
🧪 Starting WriteGCode Tests...
============================================================
✅ Basic functionality
✅ Roughing pass
✅ Tool type: Ball
✅ Tool type: Flat
✅ Tool type: V
✅ Scan pattern: Rows
✅ Scan pattern: Columns
✅ Scan pattern: C then R
✅ Units: in
✅ Units: mm
✅ Config file mode
✅ No image loaded
✅ Invalid image
✅ Large image (100x100)
✅ Tiny image (5x5)
✅ Zero cutting depth

============================================================
TEST SUMMARY
============================================================
Total Tests: 15
Passed: 15
Failed: 0
Success Rate: 100.0%
```

## Practical Demo

The test script includes a comprehensive demonstration that:

1. Creates a realistic bowl-shaped heightmap
2. Configures for aluminum machining (metric units)
3. Sets up proper feeds, speeds, and cutting parameters
4. Generates both roughing and finishing G-code
5. Saves output files to temp directory

## Generated Files

During testing, the following files are created in your system's temp directory:

- `demo_rough.nc` - Roughing pass G-code
- `demo_finish.nc` - Finishing pass G-code
- Various test images (`test_*.png`)

## Troubleshooting

### Common Issues

1. **ImportError: No module named 'numpy'**
   ```bash
   pip install numpy
   ```

2. **ImportError: No module named 'PIL'**
   ```bash
   pip install pillow
   ```

3. **Permission errors on temp files**
   - Check write permissions to temp directory
   - May need to run with appropriate privileges

### Known Limitations

- Progress reporting is disabled (commented out)
- Some header-only variables are excluded from G-code output
- Large images may take longer to process

## Validating G-code Output

The tests validate G-code by checking for:

- ✅ Proper header comments
- ✅ Movement commands (G0/G1)
- ✅ Program termination (M2)
- ✅ Correct units (G20/G21)
- ✅ String format consistency

## Contributing

To add new tests:

1. Add test function to `test_write_gcode.py`
2. Follow naming convention: `test_<feature_name>`
3. Use `results.add_test()` to record results
4. Add to `run_all_tests()` function

Example:
```python
def test_my_feature(results):
    try:
        # Test code here
        results.add_test("My feature", True)
    except Exception as e:
        results.add_test("My feature", False, str(e))
``` 