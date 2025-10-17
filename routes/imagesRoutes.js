const express = require("express");

const router = express.Router();

const reliefController = require("../controllers/reliefController");

router.get(`/cache-stats`, reliefController.getImageCacheStats);
router.delete(`/cache`, reliefController.clearImageCache);

module.exports = router;