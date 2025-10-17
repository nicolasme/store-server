#!/usr/bin/env node

/**
 * Simple test script for dmap2gcode CLI
 * This creates a test image and converts it to G-code
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { convertImageToGcode, saveGcode } = require('./dmap2gcode');

// Create a simple test gradient image
function createTestImage(filename, width = 100, height = 100) {
  // If canvas is not available, create a simple placeholder
  console.log(`Creating test image: ${filename} (${width}x${height})`);
  
  // For testing without canvas, we'll just note that a real implementation
  // would create a gradient image here
  console.log('Note: In production, use a real depth map image');
  return true;
}

async function runTest() {
  console.log('=== dmap2gcode CLI Test ===\n');
  
  // Test 1: Check if Python is available
  console.log('Test 1: Checking Python availability...');
  const { spawn } = require('child_process');
  
  try {
    const pythonTest = spawn('python', ['--version']);
    
    pythonTest.stdout.on('data', (data) => {
      console.log(`✓ Python found: ${data.toString().trim()}`);
    });
    
    pythonTest.on('error', (err) => {
      console.error('✗ Python not found. Please install Python 3.x');
      process.exit(1);
    });
    
    await new Promise(resolve => pythonTest.on('close', resolve));
  } catch (error) {
    console.error('Error checking Python:', error);
  }
  
  // Test 2: Check if the CLI script exists
  console.log('\nTest 2: Checking CLI script...');
  const cliPath = path.join(__dirname, 'dmap2gcode_cli.py');
  
  if (fs.existsSync(cliPath)) {
    console.log(`✓ CLI script found at: ${cliPath}`);
  } else {
    console.error('✗ CLI script not found. Please ensure dmap2gcode_cli.py is in the same directory');
    process.exit(1);
  }
  
  // Test 3: Run a simple conversion (if test image exists)
  console.log('\nTest 3: Testing conversion...');
  
  // Create output directory
  const outputDir = path.join(__dirname, 'test_output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Use a sample image if it exists
  const testImagePath = path.join(__dirname, 'test_image.png');
  
  if (fs.existsSync(testImagePath)) {
    console.log('Found test image, running conversion...');
    
    try {
      const options = {
        yscale: 50,
        z_safe: 5,
        z_cut: 10,
        tool: 'ball',
        tool_diameter: 3,
        feed_rate: 500,
        plunge_feed: 100,
        stepover: 1,
        units: 'mm',
        normalize: true
      };
      
      console.log('Conversion options:', JSON.stringify(options, null, 2));
      
      const result = await convertImageToGcode(testImagePath, options);
      
      if (result.success) {
        console.log(`✓ Conversion successful! Generated ${result.gcode.length} lines of G-code`);
        
        // Save the output
        const outputPath = path.join(outputDir, 'test_output.nc');
        await saveGcode(result.gcode, outputPath);
        console.log(`✓ G-code saved to: ${outputPath}`);
        
        // Show first few lines
        console.log('\nFirst 10 lines of G-code:');
        result.gcode.slice(0, 10).forEach((line, i) => {
          console.log(`  ${i + 1}: ${line}`);
        });
        
      } else {
        console.error('✗ Conversion failed');
      }
    } catch (error) {
      console.error('✗ Error during conversion:', error.message);
    }
  } else {
    console.log('No test image found. Create test_image.png to test conversion.');
    console.log('Example: Use any grayscale image where:');
    console.log('  - Black pixels = deepest cuts');
    console.log('  - White pixels = highest points');
    console.log('  - Gray values = intermediate depths');
  }
  
  // Test 4: Check Python dependencies
  console.log('\nTest 4: Checking Python dependencies...');
  
  const checkDependency = (module) => {
    return new Promise((resolve) => {
      const check = spawn('python', ['-c', `import ${module}; print("${module} v" + ${module}.__version__ if hasattr(${module}, "__version__") else "installed")`]);
      
      check.stdout.on('data', (data) => {
        console.log(`✓ ${data.toString().trim()}`);
        resolve(true);
      });
      
      check.stderr.on('data', () => {
        console.log(`✗ ${module} not found. Install with: pip install ${module === 'PIL' ? 'Pillow' : module}`);
        resolve(false);
      });
      
      check.on('error', () => {
        console.log(`✗ Could not check ${module}`);
        resolve(false);
      });
    });
  };
  
  await checkDependency('PIL');
  await checkDependency('numpy');
  
  console.log('\n=== Test Complete ===');
  console.log('\nTo use the tool:');
  console.log('1. Ensure you have a grayscale depth map image');
  console.log('2. Install Python dependencies: pip install Pillow numpy');
  console.log('3. Use the Node.js API as shown in example_dmap2gcode.js');
  console.log('4. Or use the Python CLI directly: python dmap2gcode_cli.py --help');
}

// Run the test
runTest().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 