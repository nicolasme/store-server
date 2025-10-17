const express = require("express");
const router = express.Router();

const gcodeController = require("../controllers/gcodeController");

router.get(`/test`, gcodeController.generateTestGCode);
router.get(`/parameters`, gcodeController.getMachiningParameters);

module.exports = router;
