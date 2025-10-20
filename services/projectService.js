const db = require('../config/database');

/**
 * Migrate anonymous projects to customer account
 * This happens automatically when a user logs in
 */
async function migrateAnonymousProjects(clientId, customerId) {
  // Check if there are any anonymous projects for this clientId
  const anonymousProjectsResult = await db.query(
    'SELECT id FROM projects WHERE client_id = $1 AND customer_id IS NULL',
    [clientId]
  );

  if (anonymousProjectsResult.rows.length === 0) {
    // No anonymous projects to migrate
    return 0;
  }

  // Migrate all anonymous projects to the customer account
  const migrateResult = await db.query(
    `UPDATE projects 
     SET customer_id = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE client_id = $2 AND customer_id IS NULL`,
    [customerId, clientId]
  );

  console.log(`Migrated ${migrateResult.rowCount} anonymous projects to customer ${customerId}`);
  return migrateResult.rowCount;
}

/**
 * Get all projects for a user (by clientId or customerId)
 * Automatically migrates anonymous projects when user is logged in
 */
async function getUserProjects(clientId, customerId = null) {
  // If user is logged in (has customerId), migrate their anonymous projects first
  if (customerId && clientId) {
    await migrateAnonymousProjects(clientId, customerId);
  }

  const query = customerId
    ? 'SELECT * FROM projects WHERE customer_id = $1 ORDER BY updated_at DESC'
    : 'SELECT * FROM projects WHERE client_id = $1 AND customer_id IS NULL ORDER BY updated_at DESC';
  
  const params = customerId ? [customerId] : [clientId];
  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Get a single project by ID
 */
async function getProjectById(projectId, clientId, customerId = null) {
  const query = customerId
    ? 'SELECT * FROM projects WHERE id = $1 AND customer_id = $2'
    : 'SELECT * FROM projects WHERE id = $1 AND client_id = $2 AND customer_id IS NULL';
  
  const params = customerId ? [projectId, customerId] : [projectId, clientId];
  const result = await db.query(query, params);
  return result.rows[0] || null;
}

/**
 * Get project with all its hexagons
 */
async function getProjectWithHexagons(projectId, clientId, customerId = null) {
  // If user is logged in (has customerId), migrate their anonymous projects first
  if (customerId && clientId) {
    await migrateAnonymousProjects(clientId, customerId);
  }

  const project = await getProjectById(projectId, clientId, customerId);
  if (!project) {
    return null;
  }

  const hexagonsResult = await db.query(
    'SELECT * FROM project_hexagons WHERE project_id = $1 ORDER BY created_at ASC',
    [projectId]
  );

  return {
    project,
    hexagons: hexagonsResult.rows,
  };
}

/**
 * Create a new project
 */
async function createProject(clientId, customerId = null, name = null, resolution = 8) {
  // Generate default name if not provided
  const projectName = name || `Project ${new Date().toLocaleDateString()}`;

  const query = `
    INSERT INTO projects (client_id, customer_id, name, resolution, status)
    VALUES ($1, $2, $3, $4, 'active')
    RETURNING *
  `;

  const result = await db.query(query, [clientId, customerId, projectName, resolution]);
  return result.rows[0];
}

/**
 * Update a project
 */
async function updateProject(projectId, clientId, customerId = null, updates) {
  const { name, resolution } = updates;

  // First verify ownership
  const project = await getProjectById(projectId, clientId, customerId);
  if (!project) {
    throw new Error('Project not found or access denied');
  }

  const query = `
    UPDATE projects
    SET name = COALESCE($1, name),
        resolution = COALESCE($2, resolution),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
  `;

  const result = await db.query(query, [name, resolution, projectId]);
  return result.rows[0];
}

/**
 * Delete a project
 */
async function deleteProject(projectId, clientId, customerId = null) {
  // First verify ownership
  const project = await getProjectById(projectId, clientId, customerId);
  if (!project) {
    throw new Error('Project not found or access denied');
  }

  const query = customerId
    ? 'DELETE FROM projects WHERE id = $1 AND customer_id = $2'
    : 'DELETE FROM projects WHERE id = $1 AND client_id = $2 AND customer_id IS NULL';
  
  const params = customerId ? [projectId, customerId] : [projectId, clientId];
  await db.query(query, params);
  return true;
}

/**
 * Get or create active project for user
 */
async function getOrCreateActiveProject(clientId, customerId = null) {
  // If user is logged in (has customerId), migrate their anonymous projects first
  if (customerId && clientId) {
    await migrateAnonymousProjects(clientId, customerId);
  }

  // Try to find an existing active project
  const query = customerId
    ? 'SELECT * FROM projects WHERE customer_id = $1 AND status = $2 ORDER BY updated_at DESC LIMIT 1'
    : 'SELECT * FROM projects WHERE client_id = $1 AND customer_id IS NULL AND status = $2 ORDER BY updated_at DESC LIMIT 1';
  
  const params = customerId ? [customerId, 'active'] : [clientId, 'active'];
  const result = await db.query(query, params);
  
  let project;
  if (result.rows.length > 0) {
    project = result.rows[0];
  } else {
    // Create a new active project
    project = await createProject(clientId, customerId, 'Untitled Project');
  }

  // Get hexagons for this project
  const hexagonsResult = await db.query(
    'SELECT * FROM project_hexagons WHERE project_id = $1 ORDER BY created_at ASC',
    [project.id]
  );

  return {
    project,
    hexagons: hexagonsResult.rows,
  };
}

/**
 * Add a hexagon to a project
 */
async function addHexagonToProject(projectId, hexagonData) {
  const { hexagonId, hexagon_data, reliefImageUrl, roadsImageUrl } = hexagonData;

  // Ensure hexagon_data is properly formatted for JSONB
  // PostgreSQL JSONB accepts both objects and JSON strings
  const hexDataForDb = typeof hexagon_data === 'string'
    ? hexagon_data
    : JSON.stringify(hexagon_data);

  // Parse hexagon_data to get resolution if available
  const parsedHexData = typeof hexagon_data === 'string'
    ? JSON.parse(hexagon_data)
    : hexagon_data;
  const hexResolution = parsedHexData.resolution;

  const query = `
    INSERT INTO project_hexagons (project_id, hexagon_id, hexagon_data, relief_image_url, roads_image_url)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (project_id, hexagon_id) DO UPDATE
    SET hexagon_data = EXCLUDED.hexagon_data,
        relief_image_url = EXCLUDED.relief_image_url,
        roads_image_url = EXCLUDED.roads_image_url
    RETURNING *
  `;

  const result = await db.query(query, [
    projectId,
    hexagonId,
    hexDataForDb,
    reliefImageUrl,
    roadsImageUrl,
  ]);

  // Check if this is the first hexagon for the project
  const hexCountResult = await db.query(
    'SELECT COUNT(*) as count FROM project_hexagons WHERE project_id = $1',
    [projectId]
  );

  // Extract elevation data from hexagon if available
  const hexElevationMin = parsedHexData.elevation?.statistics?.min;
  const hexElevationMax = parsedHexData.elevation?.statistics?.max;

  // Get current project elevation range
  const projectResult = await db.query(
    'SELECT elevation_min, elevation_max FROM projects WHERE id = $1',
    [projectId]
  );
  const currentProject = projectResult.rows[0];

  // Calculate new elevation range
  let newElevationMin = currentProject.elevation_min;
  let newElevationMax = currentProject.elevation_max;

  if (hexElevationMin !== undefined && hexElevationMin !== null) {
    // If project has no min yet, or hex min is lower, update it
    if (newElevationMin === null || hexElevationMin < newElevationMin) {
      newElevationMin = hexElevationMin;
    }
  }

  if (hexElevationMax !== undefined && hexElevationMax !== null) {
    // If project has no max yet, or hex max is higher, update it
    if (newElevationMax === null || hexElevationMax > newElevationMax) {
      newElevationMax = hexElevationMax;
    }
  }

  // If this is the first hexagon and it has a resolution, update the project's resolution
  if (hexCountResult.rows[0].count === '1' && hexResolution) {
    await db.query(
      `UPDATE projects
       SET resolution = $1,
           elevation_min = $2,
           elevation_max = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [hexResolution, newElevationMin, newElevationMax, projectId]
    );
  } else {
    // Otherwise update elevation range and timestamp
    await db.query(
      `UPDATE projects
       SET elevation_min = $1,
           elevation_max = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newElevationMin, newElevationMax, projectId]
    );
  }

  return result.rows[0];
}

/**
 * Remove a hexagon from a project
 */
async function removeHexagonFromProject(projectId, hexagonId, clientId, customerId = null) {
  // First verify project ownership
  const project = await getProjectById(projectId, clientId, customerId);
  if (!project) {
    throw new Error('Project not found or access denied');
  }

  const query = 'DELETE FROM project_hexagons WHERE project_id = $1 AND hexagon_id = $2';
  await db.query(query, [projectId, hexagonId]);

  // Recalculate elevation range from remaining hexagons
  const remainingHexagonsResult = await db.query(
    'SELECT hexagon_data FROM project_hexagons WHERE project_id = $1',
    [projectId]
  );

  let newElevationMin = null;
  let newElevationMax = null;

  // If there are remaining hexagons, calculate new min/max
  if (remainingHexagonsResult.rows.length > 0) {
    remainingHexagonsResult.rows.forEach((row) => {
      const hexData = typeof row.hexagon_data === 'string'
        ? JSON.parse(row.hexagon_data)
        : row.hexagon_data;

      const hexMin = hexData.elevation?.statistics?.min;
      const hexMax = hexData.elevation?.statistics?.max;

      if (hexMin !== undefined && hexMin !== null) {
        if (newElevationMin === null || hexMin < newElevationMin) {
          newElevationMin = hexMin;
        }
      }

      if (hexMax !== undefined && hexMax !== null) {
        if (newElevationMax === null || hexMax > newElevationMax) {
          newElevationMax = hexMax;
        }
      }
    });
  }

  // Update project's elevation range and timestamp
  await db.query(
    `UPDATE projects
     SET elevation_min = $1,
         elevation_max = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [newElevationMin, newElevationMax, projectId]
  );

  return true;
}

/**
 * Get hexagons for a project
 */
async function getProjectHexagons(projectId) {
  const result = await db.query(
    'SELECT * FROM project_hexagons WHERE project_id = $1 ORDER BY created_at ASC',
    [projectId]
  );
  return result.rows;
}

module.exports = {
  getUserProjects,
  getProjectById,
  getProjectWithHexagons,
  createProject,
  updateProject,
  deleteProject,
  getOrCreateActiveProject,
  addHexagonToProject,
  removeHexagonFromProject,
  getProjectHexagons,
  migrateAnonymousProjects,
};

