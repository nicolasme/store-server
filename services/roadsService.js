const axios = require("axios");
const h3 = require("h3-js");
const sharp = require("sharp");
const { createCanvas, loadImage } = require("canvas");
const osmtogeojson = require("osmtogeojson");
const fs = require("fs");
const path = require("path");
const h3Service = require("./h3Service");
const turf = require("@turf/turf");

const ROADS_DIR =
  process.env.ROADS_DIR || "/usr/local/src/elevation-simple/server/data/roads";
const GEOJSON_DIR =
  process.env.GEOJSON_DIR ||
  "/usr/local/src/elevation-simple/server/data/geojson";
const DMAP_DIR =
  process.env.DMAP_DIR || "/usr/local/src/elevation-simple/server/data/dmap";
const GCODE_DIR =
  process.env.GCODE_DIR || "/usr/local/src/elevation-simple/server/data/gcode";

// Create cache directory if it doesn't exist
const CACHE_DIR = ROADS_DIR;
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Default road styles
const DEFAULT_ROAD_STYLES = {
  motorway: { color: "#1f4e79", width: 4 }, // Dark blue - most important roads
  trunk: { color: "#c5504b", width: 3 }, // Dark red - major trunk roads
  primary: { color: "#2e8b57", width: 3 }, // Sea green - primary roads
  secondary: { color: "#ff7f00", width: 2 }, // Orange - secondary roads
  tertiary: { color: "#8b4513", width: 2 }, // Saddle brown - tertiary roads
  residential: { color: "#696969", width: 2 }, // Dim gray - residential streets
  living_street: { color: "#32cd32", width: 2 }, // Lime green - living streets
  service: { color: "#a9a9a9", width: 2 }, // Dark gray - service roads
  road: { color: "#808080", width: 2 }, // Gray - generic roads
  link: { color: "#4682b4", width: 2 }, // Steel blue - link roads
  default: { color: "#000000", width: 2 }, // Black - default road style
};

/**
 * Generate a roads image for an H3 hexagon
 * @param {string} hexId - H3 hexagon ID
 * @param {Object} options - Generation options
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateRoadsImage(hexId, options = {}) {
  const {
    roadTypes = DEFAULT_ROAD_STYLES,
    imageWidth = 1024,
    imageHeight = 1024,
    padding = 0,
    backgroundColor = "rgba(255, 255, 255, 0)",
    forceRegenerate = true,
    drawHexagonBorder = true,
    hexagonBorderStyle = { color: "#FF0000", width: 2, dash: [] },
    clipRoads = true, // New option to enable precise road clipping
  } = options;

  console.log(`Generating roads image for hexagon ${hexId}`);

  // Validate H3 index
  if (!h3.isValidCell(hexId)) {
    throw new Error("Invalid H3 hexagon ID");
  }

  // Check if cached image exists and forceRegenerate is false
  const cachePath = path.join(CACHE_DIR, `${hexId}.png`);
  if (!forceRegenerate && fs.existsSync(cachePath)) {
    console.log(`Using cached image for hexagon ${hexId}`);
    return fs.readFileSync(cachePath);
  }

  // Get the hexagon boundary as GeoJSON
  const hexBoundary = h3.cellToBoundary(hexId);
  const hexagonResolution = h3.getResolution(hexId);

  // Convert to [lng, lat] format (h3 returns [lat, lng])
  const boundary = hexBoundary.map((point) => [point[1], point[0]]);

  // Calculate bounding box with padding
  const bbox = calculateBoundingBox(boundary);
  const paddedBbox = addPaddingToBbox(bbox, padding, imageWidth, imageHeight);

  // Check if GeoJSON data exists for this hexagon
  let geojson = retrieveGeoJSON(hexId);
  if (geojson) {
    console.log(`Using cached GeoJSON data for hexagon ${hexId}`);
  } else {
    console.log(`Fetching GeoJSON data for hexagon ${hexId}`);
    // Fetch GeoJSON data for roads within the bounding box
    geojson = await fetchRoadsGeoJSON(paddedBbox, hexagonResolution);
    // Save GeoJSON data to file
    saveGeoJSON(geojson, hexId);
  }

  // Clip roads to hexagon boundary if requested
  if (clipRoads) {
    const hexInfo = await h3Service.getH3Info(hexId);
    geojson = clipRoadsToHexagon(hexInfo, geojson);
    console.log(`Clipped roads to hexagon boundary for ${hexId}`);
  }

  // Create canvas and draw the roads
  const canvas = createCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext("2d");

  // Set background color
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, imageWidth, imageHeight);

  // Draw roads from GeoJSON
  await drawRoadsFromGeoJSON(
    ctx,
    geojson,
    roadTypes,
    paddedBbox,
    imageWidth,
    imageHeight
  );

  // Draw hexagon border if requested (before applying transparency mask)
  if (drawHexagonBorder) {
    drawHexagonBorderOnCanvas(
      ctx,
      boundary,
      paddedBbox,
      imageWidth,
      imageHeight,
      hexagonBorderStyle
    );
  }

  // Make area outside hexagon transparent
  const processedImageBuffer = await makeOutsideHexagonTransparent(
    ctx,
    boundary,
    paddedBbox,
    imageWidth,
    imageHeight
  );

  // Save the image to cache
  fs.writeFileSync(cachePath, processedImageBuffer);
  console.log(`Saved image for hexagon ${hexId} to cache`);

  return processedImageBuffer;
}

/**
 * Calculate the bounding box of a polygon
 * @param {Array} coordinates - Array of [lng, lat] coordinates
 * @returns {Array} Bounding box as [west, south, east, north]
 */
function calculateBoundingBox(coordinates) {
  let minLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLng = coordinates[0][0];
  let maxLat = coordinates[0][1];

  coordinates.forEach((point) => {
    minLng = Math.min(minLng, point[0]);
    minLat = Math.min(minLat, point[1]);
    maxLng = Math.max(maxLng, point[0]);
    maxLat = Math.max(maxLat, point[1]);
  });

  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Add padding to a bounding box
 * @param {Array} bbox - Bounding box as [west, south, east, north]
 * @param {Number} padding - Padding in pixels
 * @param {Number} width - Image width
 * @param {Number} height - Image height
 * @returns {Array} Padded bounding box
 */
function addPaddingToBbox(bbox, padding, width, height) {
  const [west, south, east, north] = bbox;

  // Calculate the current dimensions
  const lngDiff = east - west;
  const latDiff = north - south;

  // Calculate the padding in geographic coordinates
  const lngPadding = (lngDiff * padding) / width;
  const latPadding = (latDiff * padding) / height;

  return [
    west - lngPadding,
    south - latPadding,
    east + lngPadding,
    north + latPadding,
  ];
}

/**
 * Process the image to make areas outside of hexagon transparent
 * @param {CanvasRenderingContext2D} ctx - The canvas context with the drawn image
 * @param {Array} hexBoundary - The hexagon boundary coordinates
 * @param {Array} bbox - The bounding box of the image
 * @param {Number} width - Image width
 * @param {Number} height - Image height
 * @returns {Buffer} Processed image buffer with transparent background
 */
async function makeOutsideHexagonTransparent(
  ctx,
  hexBoundary,
  bbox,
  width,
  height
) {
  try {
    // Store the original composite operation
    const originalComposite = ctx.globalCompositeOperation;

    // Create a canvas for the mask
    const maskCanvas = createCanvas(width, height);
    const maskCtx = maskCanvas.getContext("2d");

    // Fill the mask with transparent background
    maskCtx.fillStyle = "rgba(0, 0, 0, 0)";
    maskCtx.fillRect(0, 0, width, height);

    // Draw the hexagon in white (opaque area to keep)
    maskCtx.fillStyle = "rgba(255, 255, 255, 255)";
    maskCtx.beginPath();

    // Convert geo coordinates to pixel coordinates
    const [west, south, east, north] = bbox;
    const pixelCoords = hexBoundary.map((point) => {
      const x = ((point[0] - west) / (east - west)) * width;
      const y = height - ((point[1] - south) / (north - south)) * height;
      return [x, y];
    });

    // Draw the hexagon
    maskCtx.moveTo(pixelCoords[0][0], pixelCoords[0][1]);
    for (let i = 1; i < pixelCoords.length; i++) {
      maskCtx.lineTo(pixelCoords[i][0], pixelCoords[i][1]);
    }
    maskCtx.closePath();
    maskCtx.fill();

    // Apply the mask using destination-in composite operation
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0);

    // Reset the composite operation to the original
    ctx.globalCompositeOperation = originalComposite;

    return ctx.canvas.toBuffer();
  } catch (error) {
    console.error("Error processing image:", error);
    // Reset composite operation in case of error
    ctx.globalCompositeOperation = "source-over";
    throw error;
  }
}

/**
 * Fetch GeoJSON data for roads within a bounding box
 * @param {Array} bbox - Bounding box as [west, south, east, north]
 * @returns {Object} GeoJSON data for roads
 */
async function fetchRoadsGeoJSON(bbox, hexagonResolution) {
  const [west, south, east, north] = bbox;

  // Fetch roads types (way) depending on hexagon resolution
  const roadTypes = {
    motorway: {
      way: "motorway",
      resolution: 0,
    },
    trunk: {
      way: "trunk",
      resolution: 0,
    },
    primary: {
      way: "primary",
      resolution: 5,
    },
    secondary: {
      way: "secondary",
      resolution: 7,
    },
    tertiary: {
      way: "tertiary",
      resolution: 7,
    },
    unclassified: {
      way: "unclassified",
      resolution: 6,
    },
    residential: {
      way: "residential",
      resolution: 8,
    },
    road: {
      way: "road",
      resolution: 8,
    },
  };

  let queryRoadTypes = [];
  for (const roadType in roadTypes) {
    if (roadTypes[roadType].resolution <= hexagonResolution) {
      queryRoadTypes.push(roadTypes[roadType].way);
    }
  }

  const dynamicQuery = `
      [out:json][timeout:25];
      (
        way["highway"~"${queryRoadTypes.join(
          "|"
        )}"](${south},${west},${north},${east});
      );
      out geom;
      `;

  // Use Overpass API to get road data
  const response = await axios.post(
    "https://overpass-api.de/api/interpreter",
    dynamicQuery,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  // Convert OSM data to GeoJSON using osmtogeojson
  const geojson = osmtogeojson(response.data);

  return geojson;
}

/**
 * Draw roads from GeoJSON data onto canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} geojson - GeoJSON data
 * @param {Object} roadTypes - Road types and their styling
 * @param {Array} bbox - Bounding box as [west, south, east, north]
 * @param {Number} width - Image width
 * @param {Number} height - Image height
 */
async function drawRoadsFromGeoJSON(
  ctx,
  geojson,
  roadTypes,
  bbox,
  width,
  height
) {
  const [west, south, east, north] = bbox;

  // Process each feature in the GeoJSON
  geojson.features.forEach((feature) => {
    const roadType = feature.properties.highway;
    let style = roadTypes[roadType];

    if (!style) {
      style = roadTypes.default;
      // return; // Skip if no style defined for this road type
    }

    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Draw the road geometry
    ctx.beginPath();
    feature.geometry.coordinates.forEach((coord, index) => {
      const x = ((coord[0] - west) / (east - west)) * width;
      const y = height - ((coord[1] - south) / (north - south)) * height;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  });
}

/**
 * Draw hexagon border on canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} hexBoundary - The hexagon boundary coordinates
 * @param {Array} bbox - The bounding box of the image
 * @param {Number} width - Image width
 * @param {Number} height - Image height
 * @param {Object} borderStyle - Border styling options
 */
function drawHexagonBorderOnCanvas(
  ctx,
  hexBoundary,
  bbox,
  width,
  height,
  borderStyle
) {
  const [west, south, east, north] = bbox;

  // Convert geo coordinates to pixel coordinates
  const pixelCoords = hexBoundary.map((point) => {
    const x = ((point[0] - west) / (east - west)) * width;
    const y = height - ((point[1] - south) / (north - south)) * height;
    return [x, y];
  });

  // Set border style
  ctx.strokeStyle = borderStyle.color;
  ctx.lineWidth = borderStyle.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Set dash pattern if provided
  if (borderStyle.dash && borderStyle.dash.length > 0) {
    ctx.setLineDash(borderStyle.dash);
  } else {
    ctx.setLineDash([]);
  }

  // Draw the hexagon border
  ctx.beginPath();
  ctx.moveTo(pixelCoords[0][0], pixelCoords[0][1]);
  for (let i = 1; i < pixelCoords.length; i++) {
    ctx.lineTo(pixelCoords[i][0], pixelCoords[i][1]);
  }
  ctx.closePath();
  ctx.stroke();

  // Reset dash pattern
  ctx.setLineDash([]);
}

/**
 * Get cached image path if exists
 * @param {string} hexId - H3 hexagon ID
 * @returns {string|null} Image path or null if not cached
 */
function getCachedImagePath(hexId) {
  const cachePath = path.join(CACHE_DIR, `${hexId}.png`);
  if (fs.existsSync(cachePath)) {
    return `/roads/${hexId}.png`;
  }
  return null;
}

/**
 * Clear cache for a specific hexagon or all cache
 * @param {string} hexId - H3 hexagon ID (optional)
 */
function clearCache(hexId = null) {
  if (hexId) {
    const cachePath = path.join(CACHE_DIR, `${hexId}.png`);
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      return true;
    }
    return false;
  } else {
    // Clear all cache
    const files = fs.readdirSync(CACHE_DIR);
    files.forEach((file) => {
      if (file.endsWith(".png")) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      }
    });
    return files.length;
  }
}

function saveGeoJSON(geojson, hexId) {
  fs.writeFileSync(
    `${GEOJSON_DIR}/${hexId}.geojson`,
    JSON.stringify(geojson, null, 2)
  );
}

function retrieveGeoJSON(hexId) {
  if (fs.existsSync(`${GEOJSON_DIR}/${hexId}.geojson`)) {
    const geojson = fs.readFileSync(`${GEOJSON_DIR}/${hexId}.geojson`, "utf8");
    return JSON.parse(geojson);
  }
  return null;
}

function retrieveDMAPImage(hexId, minHGT, maxHGT) {
  const dmapImage = `${DMAP_DIR}/${hexId}_${minHGT}_${maxHGT}.png`;
  if (fs.existsSync(dmapImage)) {
    return fs.readFileSync(dmapImage);
  }
  return null;
}

function getDMAPImagePath(hexId, minHGT, maxHGT) {
  return `${DMAP_DIR}/${hexId}_${minHGT}_${maxHGT}.png`;
}

async function generateRoadsGcode(
  hexId,
  minHGT = 0,
  maxHGT = 450,
  safeZ = 10,
  feedRate = 1000,
  zCut = -20,
  yScale = 150,
  carvingDepth = 1.5
) {
  const geojson = retrieveGeoJSON(hexId);
  if (!geojson) {
    throw new Error(`No GeoJSON data found for hexagon ${hexId}`);
  }

  const dmapImagePath = getDMAPImagePath(hexId, minHGT, maxHGT);
  const dmapImage = await loadImage(dmapImagePath);
  if (!dmapImage) {
    throw new Error(`No DMAP image found for hexagon ${hexId}`);
  }

  const ctx = createCanvas(dmapImage.width, dmapImage.height).getContext("2d");
  ctx.drawImage(dmapImage, 0, 0);
  const dmapImageBuffer = ctx.canvas.toBuffer("raw");

  const imgWidth = dmapImage.width;
  const imgHeight = dmapImage.height;

  const hexInfo = await h3Service.getH3Info(hexId);
  // console.log(hexInfo);
  const geoBoundingBox = hexInfo.boundingBox;
  const geoBoundingBoxWidth = geoBoundingBox.maxLng - geoBoundingBox.minLng;
  const geoBoundingBoxHeight = geoBoundingBox.maxLat - geoBoundingBox.minLat;
  const lngScale = imgWidth / geoBoundingBoxWidth;
  const latScale = imgHeight / geoBoundingBoxHeight;

  const pixelToGcodeScaleX = yScale / imgHeight;
  const pixelToGcodeScaleY = yScale / imgWidth;

  const clippedGeojson = clipRoadsToHexagon(hexInfo, geojson);

  // Convert clipped GeoJSON to G-code
  const lines = scaleAndConvertGeoJSONForGcodeProcessing(
    clippedGeojson,
    geoBoundingBox.minLng,
    geoBoundingBox.minLat,
    lngScale,
    latScale,
    geoBoundingBox.maxLat
  );
  // Densify lines to ensure no two points are more than 2 pixels apart
  const densifiedLines = densifyLines(lines, 2);

  const linesWithHeight = await addHeightToLines(
    densifiedLines,
    dmapImage,
    dmapImageBuffer
  );

  const joinedLines = joinAdjacentLines(linesWithHeight);
  const orderedLines = orderLines(joinedLines);

  const gcode = [];
  gcode.push(`(minHGT: ${minHGT})`);
  gcode.push(`(maxHGT: ${maxHGT})`);
  gcode.push(`(safeZ: ${safeZ})`);
  gcode.push(`(feedRate: ${feedRate})`);
  gcode.push(`(zCut: ${zCut})`);
  gcode.push(`(yScale: ${yScale})`);
  gcode.push(`(carvingDepth: ${carvingDepth})`);
  gcode.push(
    ...convertLinesToGcode(
      orderedLines,
      safeZ,
      feedRate,
      zCut,
      pixelToGcodeScaleX,
      pixelToGcodeScaleY,
      carvingDepth,
      yScale
    )
  );

  fs.writeFileSync(`${GCODE_DIR}/${hexId}-roads.gcode`, gcode.join("\n"));

  // console.log(gcode.push('G0 X0 Y0 Z-20.00 F1000'));

  return gcode.join("\n");
}

function removeRoadsOutsideHexagone(hexInfo, geojson) {
  // boundary: [
  //   [ 50.57942056192972, 5.695412018796018 ],
  //   [ 50.548624598180524, 5.684221557774617 ],
  //   [ 50.52993231740069, 5.721092494430421 ],
  //   [ 50.54202970736591, 5.769174867960028 ],
  //   [ 50.572828491433846, 5.780408169202625 ],
  //   [ 50.59152707305058, 5.743516265182356 ]
  // ],

  const hexBoundary = hexInfo.boundary;
  const filteredFeatures = [];

  for (const feature of geojson.features) {
    if (feature.geometry && feature.geometry.coordinates) {
      // Check if any point of the road line is inside the hexagon
      let hasPointInside = false;

      for (const coordinate of feature.geometry.coordinates) {
        // coordinate is in [lng, lat] format from GeoJSON
        if (isInsideHexagon(coordinate, hexBoundary)) {
          hasPointInside = true;
          break;
        }
      }

      // Only include roads that have at least one point inside the hexagon
      if (hasPointInside) {
        filteredFeatures.push(feature);
      }
    }
  }

  // Return a new GeoJSON object with only roads inside the hexagon
  return {
    type: "FeatureCollection",
    features: filteredFeatures,
  };
}

function isInsideHexagon(point, hexBoundary) {
  try {
    // Ensure point is in [lng, lat] format for Turf.js
    let pointCoords;
    if (Array.isArray(point) && point.length >= 2) {
      // If point is [lat, lng], convert to [lng, lat] for Turf.js
      // Check if first coordinate looks like latitude (typically -90 to 90)
      if (
        point[0] >= -90 &&
        point[0] <= 90 &&
        Math.abs(point[0]) > Math.abs(point[1])
      ) {
        pointCoords = [point[1], point[0]]; // Convert [lat, lng] to [lng, lat]
      } else {
        pointCoords = point; // Already in [lng, lat] format
      }
    } else {
      throw new Error("Invalid point format");
    }

    // Convert hexBoundary to Turf.js polygon format
    // hexBoundary is expected to be an array of [lat, lng] coordinates from H3
    const polygonCoords = hexBoundary.map((coord) => {
      // Convert [lat, lng] to [lng, lat] for Turf.js
      return [coord[1], coord[0]];
    });

    // Close the polygon by adding the first point at the end if not already closed
    if (
      polygonCoords[0][0] !== polygonCoords[polygonCoords.length - 1][0] ||
      polygonCoords[0][1] !== polygonCoords[polygonCoords.length - 1][1]
    ) {
      polygonCoords.push(polygonCoords[0]);
    }

    // Create Turf.js point and polygon objects
    const turfPoint = turf.point(pointCoords);
    const turfPolygon = turf.polygon([polygonCoords]);

    // Use Turf.js booleanPointInPolygon to check if point is inside
    return turf.booleanPointInPolygon(turfPoint, turfPolygon);
  } catch (error) {
    console.error("Error checking if point is inside hexagon:", error);
    return false;
  }
}

/**
 * Clip roads that cross the hexagon perimeter, cutting them at intersection points
 * and keeping only the parts inside the hexagon
 * @param {Object} hexInfo - H3 hexagon information with boundary
 * @param {Object} geojson - GeoJSON data containing road features
 * @returns {Object} GeoJSON with roads clipped to hexagon boundary
 */
function clipRoadsToHexagon(hexInfo, geojson) {
  const hexBoundary = hexInfo.boundary;
  const clippedFeatures = [];

  // Convert hexBoundary to Turf.js polygon format
  const polygonCoords = hexBoundary.map((coord) => [coord[1], coord[0]]); // [lat, lng] to [lng, lat]

  // Close the polygon if not already closed
  if (
    polygonCoords[0][0] !== polygonCoords[polygonCoords.length - 1][0] ||
    polygonCoords[0][1] !== polygonCoords[polygonCoords.length - 1][1]
  ) {
    polygonCoords.push(polygonCoords[0]);
  }

  const hexPolygon = turf.polygon([polygonCoords]);

  for (const feature of geojson.features) {
    if (
      feature.geometry &&
      feature.geometry.coordinates &&
      feature.geometry.type === "LineString"
    ) {
      const clippedRoad = clipLineStringToPolygon(feature, hexPolygon);
      if (clippedRoad && clippedRoad.length > 0) {
        // Add each clipped segment as a separate feature
        clippedRoad.forEach((segment) => {
          if (segment.coordinates.length >= 2) {
            clippedFeatures.push({
              ...feature,
              geometry: {
                type: "LineString",
                coordinates: segment.coordinates,
              },
            });
          }
        });
      }
    }
  }

  return {
    type: "FeatureCollection",
    features: clippedFeatures,
  };
}

/**
 * Clip a single LineString feature to a polygon boundary
 * @param {Object} lineFeature - GeoJSON LineString feature
 * @param {Object} polygon - Turf.js polygon object
 * @returns {Array} Array of clipped line segments
 */
function clipLineStringToPolygon(lineFeature, polygon) {
  const coordinates = lineFeature.geometry.coordinates;
  const clippedSegments = [];
  let currentSegment = [];

  for (let i = 0; i < coordinates.length; i++) {
    const currentPoint = coordinates[i];
    const isCurrentInside = turf.booleanPointInPolygon(
      turf.point(currentPoint),
      polygon
    );

    if (i === 0) {
      // First point
      if (isCurrentInside) {
        currentSegment.push(currentPoint);
      }
    } else {
      const previousPoint = coordinates[i - 1];
      const isPreviousInside = turf.booleanPointInPolygon(
        turf.point(previousPoint),
        polygon
      );

      if (isPreviousInside && isCurrentInside) {
        // Both points inside - add current point to segment
        currentSegment.push(currentPoint);
      } else if (isPreviousInside && !isCurrentInside) {
        // Exiting polygon - find intersection and end current segment
        const intersectionPoint = findLinePolygonIntersection(
          [previousPoint, currentPoint],
          polygon
        );
        if (intersectionPoint) {
          currentSegment.push(intersectionPoint);
        }

        // Save current segment if it has at least 2 points
        if (currentSegment.length >= 2) {
          clippedSegments.push({ coordinates: [...currentSegment] });
        }
        currentSegment = [];
      } else if (!isPreviousInside && isCurrentInside) {
        // Entering polygon - find intersection and start new segment
        const intersectionPoint = findLinePolygonIntersection(
          [previousPoint, currentPoint],
          polygon
        );
        if (intersectionPoint) {
          currentSegment = [intersectionPoint, currentPoint];
        } else {
          currentSegment = [currentPoint];
        }
      }
      // If both points are outside, do nothing (skip this segment)
    }
  }

  // Save final segment if it exists
  if (currentSegment.length >= 2) {
    clippedSegments.push({ coordinates: currentSegment });
  }

  return clippedSegments;
}

/**
 * Find intersection point between a line segment and polygon boundary
 * @param {Array} lineSegment - Array of two coordinate points [point1, point2]
 * @param {Object} polygon - Turf.js polygon object
 * @returns {Array|null} Intersection point coordinates or null if no intersection
 */
function findLinePolygonIntersection(lineSegment, polygon) {
  try {
    const line = turf.lineString(lineSegment);
    const intersections = turf.lineIntersect(line, polygon);

    if (intersections.features.length > 0) {
      // Return the first intersection point
      return intersections.features[0].geometry.coordinates;
    }

    return null;
  } catch (error) {
    console.error("Error finding line-polygon intersection:", error);
    return null;
  }
}

function joinAdjacentLines(lines) {
  // [
  //   [ 41.86817229142662, 335.7724415436308, 0.34509803921568627 ],
  //   [ 41.16074743270594, 335.83145955515585, 0.34509803921568627 ],
  //   [ 40.59544630407241, 335.9453393802794, 0.34509803921568627 ],
  //   [ 39.94870348740875, 336.18224266604744, 0.34509803921568627 ],
  //   [ 39.41853406733381, 336.4208084310333, 0.3450980392156862 ]
  // ],
  // [
  //   [ 267.10447574739294, 371.74184148074204, 0.28718112633338283 ],
  //   [ 267.24713177608663, 370.8125156088299, 0.2899621671179743 ],
  //   [ 267.99714052396666, 368.45013266784355, 0.30236816189773236 ],
  //   [ 268.28085568551546, 366.7369478538686, 0.31076568081077366 ],
  //   [ 268.74448777877603, 360.7910910007353, 0.3487671294958972 ],
  //   [ 269.89052669587005, 356.5700563159247, 0.3840089933984117 ]
  // ],

  if (!lines || lines.length === 0) {
    return [];
  }

  // Tolerance for considering two points as the same (in same units as coordinates)
  const tolerance = 0.001;

  // Helper function to calculate distance between two 3D points
  function getDistance(point1, point2) {
    const dx = point1[0] - point2[0];
    const dy = point1[1] - point2[1];
    const dz = point1[2] - point2[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Create a copy of lines array to work with
  let remainingLines = lines.map((line) => [...line]);
  const joinedLines = [];

  while (remainingLines.length > 0) {
    // Start with the first remaining line
    let currentLine = remainingLines.shift();
    let hasJoined = true;

    // Keep trying to join lines until no more joins are possible
    while (hasJoined && remainingLines.length > 0) {
      hasJoined = false;

      for (let i = 0; i < remainingLines.length; i++) {
        const candidateLine = remainingLines[i];
        const currentLastPoint = currentLine[currentLine.length - 1];
        const currentFirstPoint = currentLine[0];
        const candidateFirstPoint = candidateLine[0];
        const candidateLastPoint = candidateLine[candidateLine.length - 1];

        // Check if current line's end connects to candidate line's start
        if (getDistance(currentLastPoint, candidateFirstPoint) <= tolerance) {
          // Join candidate line to the end of current line (skip first point to avoid duplication)
          currentLine = [...currentLine, ...candidateLine.slice(1)];
          remainingLines.splice(i, 1);
          hasJoined = true;
          break;
        }
        // Check if current line's end connects to candidate line's end (reverse candidate)
        else if (
          getDistance(currentLastPoint, candidateLastPoint) <= tolerance
        ) {
          // Join reversed candidate line to the end of current line (skip last point to avoid duplication)
          const reversedCandidate = [...candidateLine].reverse();
          currentLine = [...currentLine, ...reversedCandidate.slice(1)];
          remainingLines.splice(i, 1);
          hasJoined = true;
          break;
        }
        // Check if candidate line's end connects to current line's start
        else if (
          getDistance(candidateLastPoint, currentFirstPoint) <= tolerance
        ) {
          // Join current line to the end of candidate line (skip first point to avoid duplication)
          currentLine = [...candidateLine, ...currentLine.slice(1)];
          remainingLines.splice(i, 1);
          hasJoined = true;
          break;
        }
        // Check if candidate line's start connects to current line's start (reverse candidate)
        else if (
          getDistance(candidateFirstPoint, currentFirstPoint) <= tolerance
        ) {
          // Join reversed candidate line to the start of current line (skip last point to avoid duplication)
          const reversedCandidate = [...candidateLine].reverse();
          currentLine = [...reversedCandidate.slice(0, -1), ...currentLine];
          remainingLines.splice(i, 1);
          hasJoined = true;
          break;
        }
      }
    }

    // Add the joined line to results
    joinedLines.push(currentLine);
  }

  return joinedLines;
}

function orderLines(lines) {
  if (!lines || lines.length <= 1) {
    return lines;
  }

  // Helper function to calculate distance between two 3D points
  function getDistance(point1, point2) {
    const dx = point1[0] - point2[0];
    const dy = point1[1] - point2[1];
    const dz = point1[2] - point2[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Create copies of lines to work with (both normal and reversed orientations)
  const availableLines = lines.map((line, index) => ({
    originalIndex: index,
    line: [...line],
    reversed: false,
  }));

  const orderedLines = [];

  // Start with the line closest to origin (0,0,0) or just the first line
  let currentLineIndex = 0;
  let minDistanceToOrigin = Infinity;

  for (let i = 0; i < availableLines.length; i++) {
    const firstPoint = availableLines[i].line[0];
    const distanceToOrigin = getDistance(firstPoint, [0, 0, 0]);
    if (distanceToOrigin < minDistanceToOrigin) {
      minDistanceToOrigin = distanceToOrigin;
      currentLineIndex = i;
    }
  }

  // Add the starting line to ordered list
  let currentLine = availableLines.splice(currentLineIndex, 1)[0];
  orderedLines.push(
    currentLine.reversed ? [...currentLine.line].reverse() : currentLine.line
  );

  // For each remaining line, find the one with closest start point to current line's end point
  while (availableLines.length > 0) {
    const currentEndPoint = orderedLines[orderedLines.length - 1];
    const currentEndPointCoords = currentEndPoint[currentEndPoint.length - 1];

    let bestDistance = Infinity;
    let bestLineIndex = 0;
    let bestReversed = false;

    // Check all remaining lines in both orientations
    for (let i = 0; i < availableLines.length; i++) {
      const candidateLine = availableLines[i].line;

      // Check normal orientation: distance from current end to candidate start
      const distanceToStart = getDistance(
        currentEndPointCoords,
        candidateLine[0]
      );
      if (distanceToStart < bestDistance) {
        bestDistance = distanceToStart;
        bestLineIndex = i;
        bestReversed = false;
      }

      // Check reversed orientation: distance from current end to candidate end
      const distanceToEnd = getDistance(
        currentEndPointCoords,
        candidateLine[candidateLine.length - 1]
      );
      if (distanceToEnd < bestDistance) {
        bestDistance = distanceToEnd;
        bestLineIndex = i;
        bestReversed = true;
      }
    }

    // Add the best candidate line to ordered list
    const bestLine = availableLines.splice(bestLineIndex, 1)[0];
    const lineToAdd = bestReversed
      ? [...bestLine.line].reverse()
      : bestLine.line;
    orderedLines.push(lineToAdd);
  }

  return orderedLines;
}

function scaleAndConvertGeoJSONForGcodeProcessing(
  geojson,
  minLng,
  minLat,
  lngToPixelScale,
  latToPixelScale,
  maxLat
) {
  // Scale the GeoJSON to the size of the DMAP image
  const lines = [];
  const maxLatOffset = maxLat - minLat;

  for (const feature of geojson.features) {
    const points = [];
    for (const coordinate of feature.geometry.coordinates) {
      coordinate[0] = (coordinate[0] - minLng) * lngToPixelScale;
      coordinate[1] = (coordinate[1] - minLat) * latToPixelScale;
      points.push(coordinate);
    }
    lines.push(points);
  }
  return lines;
}

/**
 * Densifies lines by adding intermediate points so that no two consecutive points
 * are more than maxDistance pixels apart. This ensures better precision when
 * sampling heights from the DMAP image.
 *
 * @param {Array} lines - Array of lines, where each line is an array of [x, y] points
 * @param {number} maxDistance - Maximum distance allowed between consecutive points (in pixels)
 * @returns {Array} - Array of densified lines with additional intermediate points
 */
function densifyLines(lines, maxDistance = 2) {
  const densifiedLines = [];

  for (const line of lines) {
    if (line.length < 2) {
      // Line with less than 2 points doesn't need densification
      densifiedLines.push([...line]);
      continue;
    }

    const densifiedLine = [];
    densifiedLine.push([...line[0]]); // Add first point

    for (let i = 1; i < line.length; i++) {
      const prevPoint = line[i - 1];
      const currentPoint = line[i];

      // Calculate distance between consecutive points
      const dx = currentPoint[0] - prevPoint[0];
      const dy = currentPoint[1] - prevPoint[1];
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > maxDistance) {
        // Need to add intermediate points
        const numSegments = Math.ceil(distance / maxDistance);
        const stepX = dx / numSegments;
        const stepY = dy / numSegments;

        // Add intermediate points (skip the first one as it's already added)
        for (let j = 1; j < numSegments; j++) {
          const interpolatedX = prevPoint[0] + stepX * j;
          const interpolatedY = prevPoint[1] + stepY * j;
          densifiedLine.push([interpolatedX, interpolatedY]);
        }
      }

      // Add the current point
      densifiedLine.push([...currentPoint]);
    }

    densifiedLines.push(densifiedLine);
  }

  return densifiedLines;
}

async function addHeightToLines(lines, dmapImage, dmapImageBuffer) {
  for (const line of lines) {
    for (const point of line) {
      if (!isPointInsideImage(point[0], point[1], dmapImage)) {
        continue;
      }
      point.push(
        await getHeightFromDMAPImage(
          dmapImage,
          dmapImageBuffer,
          point[0],
          point[1]
        )
      );
    }
  }
  return lines;
}

function isPointInsideImage(x, y, dmapImage) {
  // Reserve space for bilinear interpolation (need x+1, y+1)
  return (
    x >= 0 && x < dmapImage.width - 1 && y >= 0 && y < dmapImage.height - 1
  );
}

async function getHeightFromDMAPImage(dmapImage, dmapImageBuffer, x, y) {
  const width = dmapImage.width;
  const imageHeight = dmapImage.height;

  // Additional bounds check for bilinear interpolation
  if (x < 0 || x >= width - 1 || y < 0 || y >= imageHeight - 1) {
    return NaN;
  }

  const inverseY = imageHeight - y;

  const x0 = Math.floor(x);
  const y0 = Math.floor(inverseY);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  // Fixed buffer indexing: (row * width + column) * 4
  const pixel0 = dmapImageBuffer[(y0 * width + x0) * 4];
  const pixel1 = dmapImageBuffer[(y0 * width + x1) * 4];
  const pixel2 = dmapImageBuffer[(y1 * width + x0) * 4];
  const pixel3 = dmapImageBuffer[(y1 * width + x1) * 4];

  const opacity0 = dmapImageBuffer[(y0 * width + x0) * 4 + 3];
  const opacity1 = dmapImageBuffer[(y0 * width + x1) * 4 + 3];
  const opacity2 = dmapImageBuffer[(y1 * width + x0) * 4 + 3];
  const opacity3 = dmapImageBuffer[(y1 * width + x1) * 4 + 3];

  if (
    isNaN(pixel0) ||
    isNaN(pixel1) ||
    isNaN(pixel2) ||
    isNaN(pixel3) ||
    opacity0 === 0 ||
    opacity1 === 0 ||
    opacity2 === 0 ||
    opacity3 === 0
  ) {
    // console.log(x, y, pixel0, pixel1, pixel2, pixel3, opacity);
    return NaN;
  }

  const xWeight = x - x0;
  const yWeight = inverseY - y0;

  const height =
    (pixel0 * (1 - xWeight) * (1 - yWeight) +
      pixel1 * xWeight * (1 - yWeight) +
      pixel2 * (1 - xWeight) * yWeight +
      pixel3 * xWeight * yWeight) /
    256;

  const diff0 = height - pixel0;
  const diff1 = height - pixel1;
  const diff2 = height - pixel2;
  const diff3 = height - pixel3;
  const diff = Math.max(diff0, diff1, diff2, diff3);

  if (diff > 0.05) {
    console.log(x, y, height, diff, pixel0, pixel1, pixel2, pixel3);
    return 0;
  }

  if (height < 0.01) {
    // console.log(x, y, height);
    return NaN;
  }

  return 1 - height;
}

function convertLinesToGcode(
  lines,
  safeZ,
  feedRate,
  zCut,
  pixelToGcodeScaleX,
  pixelToGcodeScaleY,
  carvingDepth,
  yScale
) {
  const gcode = [];

  gcode.push(`G0 Z${safeZ}`);
  gcode.push(`M3 S24000`);
  gcode.push(`G4 P5`);

  safeZ = 2;

  // console.log(zCut, yScale)

  for (const line of lines) {
    const firstPoint = line[0];
    const lastPoint = line[line.length - 1];

    if (isNaN(firstPoint[2])) {
      continue;
    } else if (isNaN(lastPoint[2])) {
      continue;
    }

    const pToScale = (point) => {
      return {
        x: (point[0] * pixelToGcodeScaleX - yScale / 2).toFixed(2),
        y: (point[1] * pixelToGcodeScaleY - yScale / 2).toFixed(2),
      };
    };

    gcode.push(
      `G0 X${pToScale(firstPoint).x} Y${pToScale(firstPoint).y} Z${safeZ}`
    );
    for (let i = 0; i < line.length - 1; i++) {
      const point = line[i];
      if (i > 0) {
        const prevPoint = line[i - 1];
        if (Math.abs(point[2] - prevPoint[2]) > 0.1) {
          continue;
        }
      }
      if (i < line.length - 1) {
        const nextPoint = line[i + 1];
        if (Math.abs(point[2] - nextPoint[2]) > 0.1) {
          continue;
        }
      }
      const z = point[2] * zCut - carvingDepth;

      if (isNaN(z)) {
        continue;
      }

      gcode.push(
        `G1 X${pToScale(point).x} Y${pToScale(point).y} Z${z.toFixed(
          2
        )} F${feedRate}`
      );
    }
    gcode.push(
      `G0 X${pToScale(lastPoint).x} Y${pToScale(lastPoint).y} Z${safeZ}`
    );
  }
  // gcode.push(`G0 Z${safeZ}`);
  // gcode.push(`G0 X0 Y0`);
  // gcode.push(`M5 M30`);
  return gcode;
}

module.exports = {
  generateRoadsImage,
  getCachedImagePath,
  clearCache,
  DEFAULT_ROAD_STYLES,
  generateRoadsGcode,
  clipRoadsToHexagon,
  removeRoadsOutsideHexagone,
  isInsideHexagon,
};
