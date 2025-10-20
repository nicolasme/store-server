const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { DOMParser } = require('@xmldom/xmldom');
const toGeoJSON = require('@tmcw/togeojson');
const db = require('../config/database');

/**
 * Ensure GeoJSON storage directory exists
 */
async function ensureGeojsonDirectory() {
  const storagePath = process.env.GEOJSON_STORAGE_PATH || './data/geojson';
  try {
    await fs.mkdir(storagePath, { recursive: true });
    return storagePath;
  } catch (error) {
    console.error('Failed to create GeoJSON storage directory:', error);
    throw new Error('Failed to create storage directory');
  }
}

/**
 * Generate unique filename for GeoJSON file
 */
function generateGeojsonFilename(originalFilename, trackId) {
  const basename = path.basename(originalFilename, path.extname(originalFilename));
  const sanitizedBasename = basename.replace(/[^a-zA-Z0-9-_]/g, '_');
  const shortId = trackId.substring(0, 8);
  return `${sanitizedBasename}_${shortId}.geojson`;
}

/**
 * Detect file type from filename
 */
function detectFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.gpx') return 'gpx';
  if (ext === '.kml') return 'kml';
  if (ext === '.tcx') return 'tcx';
  return null;
}

/**
 * Convert GPX to GeoJSON
 */
function convertGpxToGeojson(xmlContent) {
  const dom = new DOMParser().parseFromString(xmlContent, 'text/xml');
  return toGeoJSON.gpx(dom);
}

/**
 * Convert KML to GeoJSON
 */
function convertKmlToGeojson(xmlContent) {
  const dom = new DOMParser().parseFromString(xmlContent, 'text/xml');
  return toGeoJSON.kml(dom);
}

/**
 * Convert TCX to GeoJSON
 */
function convertTcxToGeojson(xmlContent) {
  const dom = new DOMParser().parseFromString(xmlContent, 'text/xml');
  return toGeoJSON.tcx(dom);
}

/**
 * Convert track file to GeoJSON based on file type
 */
async function convertToGeojson(trackId, filePath, originalFilename) {
  const fileType = detectFileType(originalFilename);

  if (!fileType) {
    throw new Error('Unsupported file type');
  }

  try {
    // Update status to 'processing'
    await db.query(
      'UPDATE gpx_tracks SET conversion_status = $1 WHERE id = $2',
      ['processing', trackId]
    );

    // Read the XML file
    const xmlContent = await fs.readFile(filePath, 'utf-8');

    // Convert to GeoJSON based on file type
    let geojson;
    switch (fileType) {
      case 'gpx':
        geojson = convertGpxToGeojson(xmlContent);
        break;
      case 'kml':
        geojson = convertKmlToGeojson(xmlContent);
        break;
      case 'tcx':
        geojson = convertTcxToGeojson(xmlContent);
        break;
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }

    // Ensure GeoJSON directory exists
    const geojsonDir = await ensureGeojsonDirectory();

    // Generate GeoJSON filename
    const geojsonFilename = generateGeojsonFilename(originalFilename, trackId);
    const geojsonPath = path.join(geojsonDir, geojsonFilename);

    // Write GeoJSON to disk
    await fs.writeFile(geojsonPath, JSON.stringify(geojson, null, 2), 'utf-8');

    // Update database with GeoJSON info and status
    const result = await db.query(
      `UPDATE gpx_tracks
       SET geojson_filename = $1,
           geojson_path = $2,
           conversion_status = $3,
           file_type = $4,
           conversion_error = NULL
       WHERE id = $5
       RETURNING *`,
      [geojsonFilename, geojsonPath, 'completed', fileType, trackId]
    );

    console.log(`Successfully converted ${fileType.toUpperCase()} to GeoJSON: ${geojsonFilename}`);

    return {
      track: result.rows[0],
      geojson
    };

  } catch (error) {
    console.error(`Failed to convert track ${trackId}:`, error);

    // Update database with error status
    await db.query(
      `UPDATE gpx_tracks
       SET conversion_status = $1,
           conversion_error = $2
       WHERE id = $3`,
      ['failed', error.message, trackId]
    );

    throw error;
  }
}

/**
 * Get GeoJSON content for a track
 */
async function getGeojsonContent(trackId) {
  const result = await db.query(
    'SELECT * FROM gpx_tracks WHERE id = $1',
    [trackId]
  );

  const track = result.rows[0];
  if (!track) {
    throw new Error('Track not found');
  }

  if (track.conversion_status !== 'completed') {
    throw new Error(`Track conversion status: ${track.conversion_status}`);
  }

  if (!track.geojson_path) {
    throw new Error('GeoJSON file not found');
  }

  try {
    const geojsonContent = await fs.readFile(track.geojson_path, 'utf-8');
    return {
      track,
      geojson: JSON.parse(geojsonContent)
    };
  } catch (error) {
    console.error('Failed to read GeoJSON file:', error);
    throw new Error('Failed to read GeoJSON file');
  }
}

/**
 * Retry failed conversions
 */
async function retryConversion(trackId) {
  const result = await db.query(
    'SELECT * FROM gpx_tracks WHERE id = $1',
    [trackId]
  );

  const track = result.rows[0];
  if (!track) {
    throw new Error('Track not found');
  }

  return await convertToGeojson(trackId, track.file_path, track.original_filename);
}

module.exports = {
  convertToGeojson,
  getGeojsonContent,
  retryConversion,
  ensureGeojsonDirectory
};
