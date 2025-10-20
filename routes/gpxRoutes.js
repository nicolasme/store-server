const express = require('express');
const multer = require('multer');
const gpxController = require('../controllers/gpxController');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept .gpx, .kml, and .tcx files
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.gpx') || ext.endsWith('.kml') || ext.endsWith('.tcx')) {
      cb(null, true);
    } else {
      cb(new Error('Only GPX, KML, and TCX files are allowed'));
    }
  }
});

/**
 * GPX Track Routes
 * All routes are prefixed with /api/projects/:projectId/gpx
 */

// Upload GPX track
router.post('/:projectId/gpx', upload.single('gpxFile'), gpxController.uploadGpxTrack);

// Get all GPX tracks for a project
router.get('/:projectId/gpx', gpxController.getProjectGpxTracks);

// Get a single GPX track by ID
router.get('/:projectId/gpx/:trackId', gpxController.getGpxTrackById);

// Get GPX file content
router.get('/:projectId/gpx/:trackId/content', gpxController.getGpxFileContent);

// Get GeoJSON content for a track
router.get('/:projectId/gpx/:trackId/geojson', gpxController.getGeojsonContent);

// Retry conversion for a track
router.post('/:projectId/gpx/:trackId/retry-conversion', gpxController.retryConversion);

// Delete a GPX track
router.delete('/:projectId/gpx/:trackId', gpxController.deleteGpxTrack);

module.exports = router;
