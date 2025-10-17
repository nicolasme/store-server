#!/usr/bin/env node

const path = require('path');
const { convertImageToGcode, saveGcode, convertAndSave } = require('./dmap2gcode');

// Example 1: Basic conversion with default settings
async function basicExample() {
  console.log('Example 1: Basic conversion with default settings');
  try {
    const result = await convertImageToGcode('example_image.png');
    
    if (result.success) {
      console.log(`Generated ${result.gcode.length} lines of G-code`);
      // Display first 10 lines
      console.log('\nFirst 10 lines of G-code:');
      result.gcode.slice(0, 10).forEach(line => console.log(line));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 2: Custom settings for CNC machining
async function customSettingsExample() {
  console.log('\n\nExample 2: Custom settings for CNC machining');
  
  const options = {
    // Machine settings
    units: 'mm',              // Use metric units
    
    // Image scaling
    yscale: 50,               // 50mm height for the image
    
    // Depths
    z_safe: 5,                // Safe height above work
    z_cut: 3,                 // Maximum cut depth
    
    // Tool settings
    tool: 'ball',             // Ball nose end mill
    tool_diameter: 6,         // 6mm diameter
    
    // Feed rates
    feed_rate: 1000,          // 1000 mm/min cutting feed
    plunge_feed: 300,         // 300 mm/min plunge feed
    
    // Path generation
    stepover: 2,              // 2mm stepover
    scan_pattern: 'both',     // Cut both rows and columns
    scan_direction: 'alternating',
    
    // Origin
    origin: 'center',         // Center the work piece
    
    // Options
    normalize: true,          // Normalize depth values
    invert: false,           // Don't invert the depth map
    disable_arcs: false      // Allow arc moves
  };
  
  try {
    const result = await convertImageToGcode('example_image.png', options);
    
    if (result.success) {
      // Save to file
      await saveGcode(result.gcode, 'output/custom_example.nc');
      console.log('G-code saved to output/custom_example.nc');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 3: V-bit carving settings
async function vbitExample() {
  console.log('\n\nExample 3: V-bit carving');
  
  const options = {
    units: 'in',
    yscale: 4,                // 4 inch height
    z_safe: 0.25,
    z_cut: 0.5,
    
    // V-bit settings
    tool: 'v',
    tool_diameter: 0.5,       // 1/2 inch V-bit
    v_angle: 90,              // 90 degree V-bit
    
    feed_rate: 60,            // 60 IPM
    plunge_feed: 20,
    stepover: 0.1,            // Fine stepover for detail
    
    scan_pattern: 'rows',
    scan_direction: 'positive',
    origin: 'bottom-left'
  };
  
  try {
    await convertAndSave('vcarve_image.png', 'output/vcarve.nc', options);
    console.log('V-carve G-code saved to output/vcarve.nc');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 4: Roughing and finishing passes
async function roughingExample() {
  console.log('\n\nExample 4: Roughing pass for foam or wood');
  
  const options = {
    units: 'mm',
    yscale: 100,              // 100mm height
    z_safe: 10,
    z_cut: 20,                // 20mm deep
    
    // Use flat end mill for roughing
    tool: 'flat',
    tool_diameter: 10,        // 10mm end mill
    
    feed_rate: 2000,          // Fast feed for roughing
    plunge_feed: 500,
    stepover: 7,              // 70% stepover for roughing
    
    scan_pattern: 'rows',
    scan_direction: 'alternating',
    origin: 'top-left',
    
    normalize: true,
    disable_arcs: true        // Disable arcs for compatibility
  };
  
  try {
    const result = await convertImageToGcode('depth_map.png', options);
    
    if (result.success) {
      await saveGcode(result.gcode, 'output/roughing_pass.nc');
      console.log('Roughing pass saved to output/roughing_pass.nc');
      console.log(`Total G-code lines: ${result.gcode.length}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 5: Processing multiple images
async function batchProcessing() {
  console.log('\n\nExample 5: Batch processing multiple images');
  
  const images = [
    { input: 'image1.png', output: 'image1.nc' },
    { input: 'image2.png', output: 'image2.nc' },
    { input: 'image3.png', output: 'image3.nc' }
  ];
  
  const sharedOptions = {
    units: 'mm',
    yscale: 50,
    z_safe: 5,
    z_cut: 10,
    tool: 'ball',
    tool_diameter: 3,
    feed_rate: 800,
    plunge_feed: 200,
    stepover: 1.5
  };
  
  for (const { input, output } of images) {
    try {
      console.log(`Processing ${input}...`);
      await convertAndSave(input, `output/${output}`, sharedOptions);
      console.log(`  ✓ Saved to output/${output}`);
    } catch (error) {
      console.error(`  ✗ Error processing ${input}:`, error.message);
    }
  }
}

// Run examples based on command line argument
const args = process.argv.slice(2);
const example = args[0] || 'basic';

async function main() {
  console.log('dmap2gcode Node.js Examples\n');
  
  switch (example) {
    case 'basic':
      await basicExample();
      break;
    case 'custom':
      await customSettingsExample();
      break;
    case 'vbit':
      await vbitExample();
      break;
    case 'roughing':
      await roughingExample();
      break;
    case 'batch':
      await batchProcessing();
      break;
    case 'all':
      await basicExample();
      await customSettingsExample();
      await vbitExample();
      await roughingExample();
      await batchProcessing();
      break;
    default:
      console.log('Usage: node example_dmap2gcode.js [example]');
      console.log('Examples: basic, custom, vbit, roughing, batch, all');
  }
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 