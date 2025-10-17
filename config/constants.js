module.exports = {
  machining: {
    endmillDiameter: 3.175,      // mm (1/8 inch)
    feedRate: 1000,              // mm/min
    plungeRate: 300,             // mm/min
    spindleSpeed: 18000,         // RPM
    stepOver: 1.5,               // mm
    depthPerPass: 1.0,           // mm
    safeHeight: 20,               // mm above workpiece
    maxDepth: 10,                // mm maximum carving depth
    workpieceHeight: 20,         // mm
    hexagonSize: 250,            // mm (physical size)
  },
  image: {
    defaultWidth: 512,
    defaultHeight: 512,
  },
  h3: {
    defaultResolution: 7,        // Default H3 resolution
    minResolution: 0,
    maxResolution: 9,            // Maximum allowed resolution for safety
  },
  elevation: {
    hgtTileSize: 3601,           // SRTM 1 arc-second resolution
    noDataValue: -32768,         // SRTM void value
  }
}; 