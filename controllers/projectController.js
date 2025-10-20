const projectService = require('../services/projectService');

/**
 * Get all projects for the current user
 */
async function listProjects(req, res, next) {
  try {
    const { clientId, customerId } = req.user;

    if (!clientId) {
      return res.status(400).json({
        error: 'Missing client ID',
      });
    }

    const projects = await projectService.getUserProjects(clientId, customerId);

    res.json({
      projects,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single project with all its hexagons
 */
async function getProject(req, res, next) {
  try {
    const { projectId } = req.params;
    const { clientId, customerId } = req.user;

    if (!clientId) {
      return res.status(400).json({
        error: 'Missing client ID',
      });
    }

    const result = await projectService.getProjectWithHexagons(
      projectId,
      clientId,
      customerId
    );

    if (!result) {
      return res.status(404).json({
        error: 'Project not found',
      });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new project
 */
async function createProject(req, res, next) {
  try {
    const { clientId, customerId } = req.user;
    const { name, resolution } = req.body;

    if (!clientId) {
      return res.status(400).json({
        error: 'Missing client ID',
      });
    }

    // Validate resolution if provided
    if (resolution !== undefined) {
      const resolutionNum = parseInt(resolution);
      if (isNaN(resolutionNum) || resolutionNum < 4 || resolutionNum > 10) {
        return res.status(400).json({
          error: 'Resolution must be an integer between 4 and 10',
        });
      }
    }

    const project = await projectService.createProject(
      clientId,
      customerId,
      name,
      resolution
    );

    res.status(201).json({
      project,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a project (e.g., rename, change resolution)
 */
async function updateProject(req, res, next) {
  try {
    const { projectId } = req.params;
    const { clientId, customerId } = req.user;
    const updates = req.body;

    if (!clientId) {
      return res.status(400).json({
        error: 'Missing client ID',
      });
    }

    // Validate resolution if provided
    if (updates.resolution !== undefined) {
      const resolutionNum = parseInt(updates.resolution);
      if (isNaN(resolutionNum) || resolutionNum < 4 || resolutionNum > 10) {
        return res.status(400).json({
          error: 'Resolution must be an integer between 4 and 10',
        });
      }
    }

    const project = await projectService.updateProject(
      projectId,
      clientId,
      customerId,
      updates
    );

    res.json({
      project,
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Delete a project
 */
async function deleteProject(req, res, next) {
  try {
    const { projectId } = req.params;
    const { clientId, customerId } = req.user;

    if (!clientId) {
      return res.status(400).json({
        error: 'Missing client ID',
      });
    }

    await projectService.deleteProject(projectId, clientId, customerId);

    res.json({
      success: true,
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Get or create active project
 */
async function getActiveProject(req, res, next) {
  try {
    const { clientId, customerId } = req.user;

    if (!clientId) {
      return res.status(400).json({
        error: 'Missing client ID',
      });
    }

    const result = await projectService.getOrCreateActiveProject(
      clientId,
      customerId
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Add a hexagon to a project
 */
async function addHexagon(req, res, next) {
  try {
    const { projectId } = req.params;
    const { clientId, customerId } = req.user;
    const hexagonData = req.body;

    if (!clientId) {
      return res.status(400).json({
        error: 'Missing client ID',
      });
    }

    // Handle special case: 'active' or 'current' as projectId
    let actualProjectId = projectId;
    if (projectId === 'active' || projectId === 'current') {
      const result = await projectService.getOrCreateActiveProject(
        clientId,
        customerId
      );
      actualProjectId = result.project.id;
    } else {
      // Verify project ownership
      const project = await projectService.getProjectById(
        projectId,
        clientId,
        customerId
      );
      if (!project) {
        return res.status(404).json({
          error: 'Project not found',
        });
      }
    }

    const hexagon = await projectService.addHexagonToProject(
      actualProjectId,
      hexagonData
    );

    res.json({
      hexagon,
      projectId: actualProjectId,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remove a hexagon from a project
 */
async function removeHexagon(req, res, next) {
  try {
    const { projectId, hexagonId } = req.params;
    const { clientId, customerId } = req.user;

    if (!clientId) {
      return res.status(400).json({
        error: 'Missing client ID',
      });
    }

    await projectService.removeHexagonFromProject(
      projectId,
      hexagonId,
      clientId,
      customerId
    );

    res.json({
      success: true,
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message,
      });
    }
    next(error);
  }
}

module.exports = {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getActiveProject,
  addHexagon,
  removeHexagon,
};

