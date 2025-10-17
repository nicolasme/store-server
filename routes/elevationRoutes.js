const express = require("express");
const router = express.Router();

const elevationController = require("../controllers/elevationController");

router.get(`/hgt-files`, elevationController.getAvailableHgtFiles);
router.get(`/cache-stats`, elevationController.getCacheStats);

module.exports = router;
