const express = require("express");
const cors = require("cors");
// const helmet = require('helmet');
const morgan = require("morgan");
const dotenv = require("dotenv");
// const path = require("path");

// Load environment variables
dotenv.config();

const indexRoutes = require("./routes/indexRoutes");

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
// app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Routes
app.use("/api", indexRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || "Internal Server Error",
      status: err.status || 500,
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: "Not Found",
      status: 404,
    },
  });
});

// Start server
app.listen(port, () => {
  console.log(`Elevation Simple server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`HGT data path: ${process.env.HGT_DATA_PATH || "./data/hgt"}`);
});
