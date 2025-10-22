const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const h3Controller = require("../controllers/h3Controller");
const elevationController = require("../controllers/elevationController");
const reliefController = require("../controllers/reliefController");
const roadsController = require("../controllers/roadsController");

// Rate limiter configuration for H3 routes
// Limits each IP to a certain number of requests per time window
const h3RateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: {
      message: "Too many requests from this IP, please try again later.",
      status: 429
    }
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting in development if needed
  skip: (req) => process.env.NODE_ENV === 'development' && process.env.RATE_LIMIT_SKIP === 'true'
});

// Rate limiter for image generation routes (more restrictive due to CPU/memory intensive operations)
const imageGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 image generation requests per windowMs
  message: {
    error: {
      message: "Too many image generation requests, please try again later.",
      status: 429
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development' && process.env.RATE_LIMIT_SKIP === 'true'
});

// Apply general rate limiter to all H3 routes
router.use(h3RateLimiter);

// H3 routes (general rate limiter applied to all routes)
router.get(`/from-coords`, h3Controller.coordinatesToH3);
router.get(`/:hexagonId`, h3Controller.getHexagonInfo);
router.get(`/:hexagonId/neighbors`, h3Controller.getNeighbors);
router.get(`/:hexagonId/elevation`, elevationController.getHexagonElevation);

// Relief image routes (with additional stricter rate limiter for resource-intensive operations)
router.get(`/:hexagonId/relief-image`, imageGenerationLimiter, reliefController.generateReliefImage);
router.get(`/:hexagonId/relief-image/contour`, imageGenerationLimiter, reliefController.generateContourImage);
router.get(`/:hexagonId/relief-image/metadata`, reliefController.getImageMetadata);

// Roads image routes (with additional stricter rate limiter for resource-intensive operations)
router.get(`/:hexagonId/roads-image`, imageGenerationLimiter, roadsController.generateRoadsImage);
router.get(`/:hexagonId/roads-image/metadata`, roadsController.getRoadsMetadata);
router.get(`/:hexagonId/roads-image/gcode`, imageGenerationLimiter, roadsController.generateRoadsGcode);

module.exports = router;
