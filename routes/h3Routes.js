const express = require("express");
const router = express.Router();

const h3Controller = require("../controllers/h3Controller");
const elevationController = require("../controllers/elevationController");
const reliefController = require("../controllers/reliefController");
const roadsController = require("../controllers/roadsController");

// H3 routes
router.get(`/from-coords`, h3Controller.coordinatesToH3);
router.get(`/:hexagonId`, h3Controller.getHexagonInfo);
router.get(`/:hexagonId/neighbors`, h3Controller.getNeighbors);
router.get(`/:hexagonId/elevation`, elevationController.getHexagonElevation);

// Relief image routes
router.get(`/:hexagonId/relief-image`, reliefController.generateReliefImage);
router.get(`/:hexagonId/relief-image/contour`, reliefController.generateContourImage);
router.get(`/:hexagonId/relief-image/metadata`, reliefController.getImageMetadata);

// Roads image routes
router.get(`/:hexagonId/roads-image`, roadsController.generateRoadsImage);
router.get(`/:hexagonId/roads-image/metadata`, roadsController.getRoadsMetadata);
router.get(`/:hexagonId/roads-image/gcode`, roadsController.generateRoadsGcode);

module.exports = router;
