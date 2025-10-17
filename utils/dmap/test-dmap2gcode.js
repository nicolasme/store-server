#!/usr/bin/env node

const path = require('path');
const fs = require('fs').promises;
const { 
    pngToGcodeFile, 
    saveGcodeToFile, 
    createDepthMapFromPNG, 
    DepthMapConverter,
    CONFIG 
} = require('./dmap2gcode.js');

// Default configuration for testing - ALL VALUES IN MILLIMETERS
const DEFAULT_CONFIG = {
    // Tool settings
    toolDiameter: 6.0,       // 3.175mm (1/8" equivalent) end mill
    toolType: "endmill",       // endmill, ball, or vee
    toolAngle: 0,              // For V-bits (degrees)
    
    // Feed rates (in mm per minute)
    feedRate: 3000.0,           // Cutting feed rate (mm/min)
    plungeFeedRate: 1500.0,     // Plunge feed rate (mm/min)
    roughingFeedRate: 5000.0,   // Roughing feed rate (mm/min)
    
    // Units and scaling
    units: "G21",              // G21 for mm (millimeters)
    pixelSize: 0.1,            // Each pixel = 0.1mm
    
    // Heights (in mm)
    safetyHeight: 25.0,         // Safe height in mm
    homeHeight: 50.0,          // Home position height in mm
    
    // Machining strategy
    convertRows: true,         // Machine in rows
    convertCols: false,         // Machine in columns
    colsFirst: false,          // Do rows first, then columns
    scanDirection: "alternating", // alternating, increasing, decreasing
    
    // Quality settings (in mm)
    tolerance: 0.5,           // Path tolerance in mm
    edgeOffset: 1.0,           // Offset from image edges in mm
    
    // Roughing (in mm)
    roughingDelta: 3.0,        // 0 = no roughing, 0.5 = 0.5mm per roughing pass
    roughingOffset: 1.0,       // Leave 0.1mm for finishing pass
    
    // Work offset (in mm)
    xOffset: 0.0,              // X offset in mm
    yOffset: 0.0               // Y offset in mm
};

const DEFAULT_PNG_OPTIONS = {
    maxDepth: 20.0,                    // 20mm deep for black pixels
    minDepth: 0.0,                    // Surface level (0mm) for white pixels
    invertDepth: false,               // false = black is deep, white is shallow
    transparencyHandling: 'white',     // skip, white, black, depth, error
    transparencyDepth: 0.0,           // Depth for transparent pixels (mm)
    alphaThreshold: 128,              // Alpha < 128 = transparent (0-255)
    resizeWidth: null,                // Set to resize image width (pixels)
    resizeHeight: null                // Set to resize image height (pixels)
};

function showUsage() {
    console.log(`
Usage: node test-dmap2gcode.js <input-image> [options]

Arguments:
  <input-image>     Path to PNG image file

Options:
  -o, --output      Output filename (without extension)
  -d, --depth       Maximum cutting depth in mm (default: 2.0)
  -t, --tool        Tool diameter in mm (default: 3.175)
  -f, --feed        Feed rate in mm/min (default: 300.0)
  -p, --pixel       Pixel size in mm (default: 0.1)
  -r, --resize      Resize image width in pixels
  --rough           Enable roughing with depth per pass in mm
  --invert          Invert depth (white=deep, black=shallow)
  --preset          Use preset: shallow, deep, relief (default: custom)
  --help            Show this help

Note: All units are in millimeters (mm). Output G-code uses G21 (metric).

Examples:
  node test-dmap2gcode.js logo.png
  node test-dmap2gcode.js logo.png -o carved_logo -d 1.5 -f 400
  node test-dmap2gcode.js logo.png --tool 1.5 --pixel 0.05 --resize 200
  node test-dmap2gcode.js logo.png --rough 0.5 --feed 500
  node test-dmap2gcode.js logo.png --preset shallow --invert
`);
}

function parseArguments() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help')) {
        showUsage();
        process.exit(0);
    }
    
    const inputImage = args[0];
    const options = {
        output: null,
        depth: 20.0,         // mm
        tool: 6.0,        // mm (3.175mm = 1/8")
        feed: 3000.0,        // mm/min
        pixel: 0.1,         // mm
        resize: null,       // pixels
        rough: null,        // mm
        invert: false,
        preset: null
    };
    
    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '-o':
            case '--output':
                options.output = args[++i];
                break;
            case '-d':
            case '--depth':
                options.depth = parseFloat(args[++i]);
                break;
            case '-t':
            case '--tool':
                options.tool = parseFloat(args[++i]);
                break;
            case '-f':
            case '--feed':
                options.feed = parseFloat(args[++i]);
                break;
            case '-p':
            case '--pixel':
                options.pixel = parseFloat(args[++i]);
                break;
            case '-r':
            case '--resize':
                options.resize = parseInt(args[++i]);
                break;
            case '--rough':
                options.rough = parseFloat(args[++i]);
                break;
            case '--invert':
                options.invert = true;
                break;
            case '--preset':
                options.preset = args[++i];
                break;
            default:
                console.error(`Unknown option: ${args[i]}`);
                process.exit(1);
        }
    }
    
    return { inputImage, options };
}

async function checkFileExists(filepath) {
    try {
        await fs.access(filepath);
        return true;
    } catch {
        return false;
    }
}

async function main() {
    try {
        const { inputImage, options } = parseArguments();
        
        // Check if input file exists
        if (!(await checkFileExists(inputImage))) {
            console.error(`Error: Input file '${inputImage}' not found`);
            process.exit(1);
        }
        
        console.log('🎯 Depth Map to G-code Converter');
        console.log('================================');
        console.log(`Input image: ${inputImage}`);
        console.log(`📏 Units: Millimeters (G21)`);
        
        // Generate output filename if not provided
        const outputName = options.output || path.basename(inputImage, path.extname(inputImage));
        
        // Build configuration
        const config = { ...DEFAULT_CONFIG };
        const pngOptions = { ...DEFAULT_PNG_OPTIONS };
        
        // Apply command line options
        config.toolDiameter = options.tool;
        config.feedRate = options.feed;
        config.pixelSize = options.pixel;
        
        pngOptions.maxDepth = options.depth;
        pngOptions.invertDepth = options.invert;
        
        if (options.resize) {
            pngOptions.resizeWidth = options.resize;
        }
        
        if (options.rough) {
            config.roughingDelta = options.rough;
            console.log(`🔨 Roughing enabled: ${options.rough}mm per pass`);
        }
        
        // Apply preset if specified
        if (options.preset) {
            switch (options.preset.toLowerCase()) {
                case 'shallow':
                    pngOptions.maxDepth = 0.5;  // 0.5mm shallow engraving
                    break;
                case 'deep':
                    pngOptions.maxDepth = 5.0;  // 5mm deep carving
                    break;
                case 'relief':
                    pngOptions.maxDepth = 1.0;  // 1mm for relief carving
                    pngOptions.minDepth = -0.2; // Slight raise for white areas
                    break;
                default:
                    console.warn(`Unknown preset: ${options.preset}`);
            }
            console.log(`🎨 Using preset: ${options.preset}`);
        }
        
        // Display configuration
        console.log(`🔧 Tool diameter: ${config.toolDiameter}mm`);
        console.log(`⚡ Feed rate: ${config.feedRate}mm/min`);
        console.log(`📐 Pixel size: ${config.pixelSize}mm`);
        console.log(`🕳️  Max depth: ${pngOptions.maxDepth}mm`);
        console.log(`💾 Output: ${outputName}_TIMESTAMP.nc`);
        
        if (options.resize) {
            console.log(`🔄 Resize to: ${options.resize} pixels wide`);
        }
        
        if (options.invert) {
            console.log(`🔄 Inverted: White=deep, Black=shallow`);
        }
        
        console.log('\n⚙️  Processing...');
        
        // Convert PNG to G-code file
        const startTime = Date.now();
        const result = await pngToGcodeFile(inputImage, outputName, config, pngOptions);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        
        // Display results
        console.log('\n✅ Conversion Complete!');
        console.log('======================');
        console.log(`📊 Image size: ${result.stats.imageSize} pixels`);
        console.log(`📏 Depth range: ${result.stats.depthRange}mm`);
        console.log(`📝 G-code lines: ${result.stats.gcodeLines}`);
        console.log(`💾 File size: ${(result.file.size / 1024).toFixed(2)} KB`);
        console.log(`⏱️  Processing time: ${elapsed}s`);
        console.log(`📁 Saved to: ${result.file.filepath}`);
        
        console.log('\n🎉 Ready for machining!');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('\nFor help, run: node test-dmap2gcode.js --help');
        process.exit(1);
    }
}

// Run the script
main(); 