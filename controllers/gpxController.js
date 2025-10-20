const gpxService = require('../services/gpxService');
const conversionService = require('../services/conversionService');

/**
 * Upload a GPX file for a project
 */
async function uploadGpxTrack(req, res) {
  try {
    const { projectId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file type
    const filename = req.file.originalname.toLowerCase();
    if (!filename.endsWith('.gpx') && !filename.endsWith('.kml') && !filename.endsWith('.tcx')) {
      return res.status(400).json({ error: 'Only GPX, KML, and TCX files are allowed' });
    }

    const track = await gpxService.uploadGpxTrack(projectId, req.file);

    res.status(201).json({
      message: 'GPX track uploaded successfully',
      track
    });
  } catch (error) {
    console.error('Error uploading GPX track:', error);
    res.status(500).json({ error: 'Failed to upload GPX track' });
  }
}

/**
 * Get all GPX tracks for a project
 */
async function getProjectGpxTracks(req, res) {
  try {
    const { projectId } = req.params;
    const tracks = await gpxService.getProjectGpxTracks(projectId);

    res.json({
      tracks,
      count: tracks.length
    });
  } catch (error) {
    console.error('Error fetching GPX tracks:', error);
    res.status(500).json({ error: 'Failed to fetch GPX tracks' });
  }
}

/**
 * Get a single GPX track by ID
 */
async function getGpxTrackById(req, res) {
  try {
    const { projectId, trackId } = req.params;
    const track = await gpxService.getGpxTrackById(trackId, projectId);

    if (!track) {
      return res.status(404).json({ error: 'GPX track not found' });
    }

    res.json({ track });
  } catch (error) {
    console.error('Error fetching GPX track:', error);
    res.status(500).json({ error: 'Failed to fetch GPX track' });
  }
}

/**
 * Delete a GPX track
 */
async function deleteGpxTrack(req, res) {
  try {
    const { projectId, trackId } = req.params;
    const deletedTrack = await gpxService.deleteGpxTrack(trackId, projectId);

    if (!deletedTrack) {
      return res.status(404).json({ error: 'GPX track not found' });
    }

    res.json({
      message: 'GPX track deleted successfully',
      track: deletedTrack
    });
  } catch (error) {
    console.error('Error deleting GPX track:', error);
    res.status(500).json({ error: error.message || 'Failed to delete GPX track' });
  }
}

/**
 * Get GPX file content
 */
async function getGpxFileContent(req, res) {
  try {
    const { projectId, trackId } = req.params;
    const { track, content } = await gpxService.readGpxFileContent(trackId, projectId);

    res.json({
      track,
      content
    });
  } catch (error) {
    console.error('Error reading GPX file:', error);
    res.status(500).json({ error: error.message || 'Failed to read GPX file' });
  }
}

/**
 * Get GeoJSON content for a track
 */
async function getGeojsonContent(req, res) {
  try {
    const { trackId } = req.params;
    const { track, geojson } = await conversionService.getGeojsonContent(trackId);

    res.json({
      track,
      geojson
    });
  } catch (error) {
    console.error('Error reading GeoJSON:', error);
    res.status(500).json({ error: error.message || 'Failed to read GeoJSON' });
  }
}

/**
 * Retry conversion for a failed track
 */
async function retryConversion(req, res) {
  try {
    const { trackId } = req.params;
    const result = await conversionService.retryConversion(trackId);

    res.json({
      message: 'Conversion retry initiated',
      track: result.track
    });
  } catch (error) {
    console.error('Error retrying conversion:', error);
    res.status(500).json({ error: error.message || 'Failed to retry conversion' });
  }
}

module.exports = {
  uploadGpxTrack,
  getProjectGpxTracks,
  getGpxTrackById,
  deleteGpxTrack,
  getGpxFileContent,
  getGeojsonContent,
  retryConversion
};
