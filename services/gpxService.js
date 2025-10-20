const db = require('../config/database');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const conversionService = require('./conversionService');

/**
 * Ensure GPX storage directory exists
 */
async function ensureStorageDirectory() {
  const storagePath = process.env.GPX_STORAGE_PATH || './data/gpx';
  try {
    await fs.mkdir(storagePath, { recursive: true });
    return storagePath;
  } catch (error) {
    console.error('Failed to create GPX storage directory:', error);
    throw new Error('Failed to create storage directory');
  }
}

/**
 * Generate unique filename for GPX file
 */
function generateUniqueFilename(originalFilename) {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalFilename);
  const basename = path.basename(originalFilename, ext);

  // Sanitize basename (remove special characters)
  const sanitizedBasename = basename.replace(/[^a-zA-Z0-9-_]/g, '_');

  return `${sanitizedBasename}_${timestamp}_${randomString}${ext}`;
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
 * Upload a track file (GPX/KML/TCX) to storage and save metadata to database
 */
async function uploadGpxTrack(projectId, file) {
  const storagePath = await ensureStorageDirectory();

  // Detect file type
  const fileType = detectFileType(file.originalname);
  if (!fileType) {
    throw new Error('Unsupported file type. Please upload GPX, KML, or TCX files.');
  }

  // Generate unique filename
  const uniqueFilename = generateUniqueFilename(file.originalname);
  const filePath = path.join(storagePath, uniqueFilename);

  try {
    // Write file to disk
    await fs.writeFile(filePath, file.buffer);

    // Get file size
    const fileSize = file.size || file.buffer.length;

    // Save metadata to database with pending conversion status
    const result = await db.query(
      `INSERT INTO gpx_tracks (project_id, filename, original_filename, file_path, file_size, file_type, conversion_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [projectId, uniqueFilename, file.originalname, filePath, fileSize, fileType, 'pending']
    );

    const track = result.rows[0];

    // Trigger conversion to GeoJSON asynchronously (don't wait for it)
    setImmediate(async () => {
      try {
        await conversionService.convertToGeojson(track.id, filePath, file.originalname);
        console.log(`Track ${track.id} converted successfully`);
      } catch (error) {
        console.error(`Failed to convert track ${track.id}:`, error);
      }
    });

    return track;
  } catch (error) {
    // Clean up file if database insert fails
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      console.error('Failed to clean up file after database error:', unlinkError);
    }
    throw error;
  }
}

/**
 * Get all GPX tracks for a project
 */
async function getProjectGpxTracks(projectId) {
  const result = await db.query(
    'SELECT * FROM gpx_tracks WHERE project_id = $1 ORDER BY uploaded_at DESC',
    [projectId]
  );
  return result.rows;
}

/**
 * Get a single GPX track by ID
 */
async function getGpxTrackById(trackId, projectId = null) {
  const query = projectId
    ? 'SELECT * FROM gpx_tracks WHERE id = $1 AND project_id = $2'
    : 'SELECT * FROM gpx_tracks WHERE id = $1';

  const params = projectId ? [trackId, projectId] : [trackId];
  const result = await db.query(query, params);

  return result.rows[0] || null;
}

/**
 * Delete a GPX track (file and database record)
 */
async function deleteGpxTrack(trackId, projectId) {
  // Get track info first
  const track = await getGpxTrackById(trackId, projectId);

  if (!track) {
    throw new Error('GPX track not found or does not belong to this project');
  }

  try {
    // Delete file from disk
    await fs.unlink(track.file_path);
  } catch (error) {
    console.error('Failed to delete GPX file from disk:', error);
    // Continue with database deletion even if file deletion fails
  }

  // Delete from database
  const result = await db.query(
    'DELETE FROM gpx_tracks WHERE id = $1 AND project_id = $2 RETURNING *',
    [trackId, projectId]
  );

  return result.rows[0] || null;
}

/**
 * Read GPX file content
 */
async function readGpxFileContent(trackId, projectId) {
  const track = await getGpxTrackById(trackId, projectId);

  if (!track) {
    throw new Error('GPX track not found');
  }

  try {
    const content = await fs.readFile(track.file_path, 'utf-8');
    return {
      track,
      content
    };
  } catch (error) {
    console.error('Failed to read GPX file:', error);
    throw new Error('Failed to read GPX file');
  }
}

module.exports = {
  uploadGpxTrack,
  getProjectGpxTracks,
  getGpxTrackById,
  deleteGpxTrack,
  readGpxFileContent,
  ensureStorageDirectory
};
