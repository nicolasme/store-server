const express = require("express");
const router = express.Router();

const h3Routes = require("./h3Routes");
const projectRoutes = require("./projectRoutes");
const gpxRoutes = require("./gpxRoutes");

// Middleware to extract user info from headers
router.use((req, res, next) => {
  req.user = {
    clientId: req.headers['x-client-id'],
    customerId: req.headers['x-customer-id'] || null
  };
  next();
});

router.use("/h3", h3Routes);
router.use("/projects", projectRoutes);
router.use("/projects", gpxRoutes);

module.exports = router;
