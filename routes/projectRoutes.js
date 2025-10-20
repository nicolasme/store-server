const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');

// Project routes
router.get('/', projectController.listProjects);
router.get('/active', projectController.getActiveProject);
router.post('/', projectController.createProject);
router.get('/:projectId', projectController.getProject);
router.put('/:projectId', projectController.updateProject);
router.delete('/:projectId', projectController.deleteProject);

// Hexagon routes within projects
router.post('/:projectId/hexagons', projectController.addHexagon);
router.delete('/:projectId/hexagons/:hexagonId', projectController.removeHexagon);

module.exports = router;

