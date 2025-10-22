const express = require("express");
const cors = require("cors");
const helmet = require('helmet');
const morgan = require("morgan");
const dotenv = require("dotenv");
// const path = require("path");

// Load environment variables
dotenv.config();

const indexRoutes = require("./routes/indexRoutes");
const db = require("./config/database");

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// CORS configuration - Only allow requests from the specified domain
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://dem.nmertens.be';
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests) only in development
    if (!origin || process.env.NODE_ENV !== 'production') {
      console.log('No origin, allowing request');
      return callback(null, true);
    }

    if (origin === allowedOrigin || origin === allowedOrigin.replace('https://', 'http://')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-ID', 'X-Customer-ID']
};

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors(corsOptions));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
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

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database tables
    await db.initializeTables();
    
    // Start server
    app.listen(port, () => {
      console.log(`Elevation Simple server running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
