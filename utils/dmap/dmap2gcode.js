const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Convert a depth map image to G-code using dmap2gcode
 * @param {string} imagePath - Path to the input image
 * @param {Object} options - Conversion options
 * @returns {Promise<{success: boolean, gcode?: string[], error?: string}>}
 */
async function convertImageToGcode(imagePath, options = {}) {
  return new Promise((resolve, reject) => {
    // Default options
    const config = {
      yscale: 1.0,
      z_safe: 0.25,
      z_cut: 0.25,
      tool: 'ball',
      tool_diameter: 0.25,
      v_angle: 45,
      feed_rate: 100,
      plunge_feed: 25,
      stepover: 0.1,
      units: 'in',
      origin: 'default',
      invert: false,
      normalize: true,
      scan_pattern: 'rows',
      scan_direction: 'alternating',
      disable_arcs: false,
      ...options
    };

    // Build command arguments
    const scriptPath = path.join(__dirname, 'dmap2gcode_cli.py');
    const args = [scriptPath, imagePath, '--json'];

    // Add config options as arguments
    Object.entries(config).forEach(([key, value]) => {
      const argName = '--' + key.replace(/_/g, '-');
      if (typeof value === 'boolean') {
        if (value) args.push(argName);
      } else {
        args.push(argName, String(value));
      }
    });

    // Spawn the Python process
    const python = spawn('python', args);
    
    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`dmap2gcode process exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.success) {
          resolve({
            success: true,
            gcode: result.gcode
          });
        } else {
          reject(new Error(result.error));
        }
      } catch (e) {
        reject(new Error(`Failed to parse output: ${e.message}`));
      }
    });

    python.on('error', (err) => {
      reject(new Error(`Failed to start dmap2gcode: ${err.message}`));
    });
  });
}

/**
 * Save G-code to a file
 * @param {string[]} gcode - Array of G-code lines
 * @param {string} outputPath - Path to save the file
 */
async function saveGcode(gcode, outputPath) {
  const content = gcode.join('\n');
  await fs.writeFile(outputPath, content, 'utf8');
}

/**
 * Convert image to G-code and save to file
 * @param {string} imagePath - Input image path
 * @param {string} outputPath - Output G-code file path
 * @param {Object} options - Conversion options
 */
async function convertAndSave(imagePath, outputPath, options = {}) {
  const result = await convertImageToGcode(imagePath, options);
  if (result.success) {
    await saveGcode(result.gcode, outputPath);
    return { success: true, outputPath };
  }
  return result;
}

module.exports = {
  convertImageToGcode,
  saveGcode,
  convertAndSave
}; 