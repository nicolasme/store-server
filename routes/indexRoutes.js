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
  // if(!req.user.clientId && !req.user.customerId) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }
  next();
});

router.get("/", (req, res) => {
  res.send("Hello World");
});

router.use("/h3", h3Routes);
router.use("/projects", projectRoutes);
router.use("/projects", gpxRoutes);

module.exports = router;
