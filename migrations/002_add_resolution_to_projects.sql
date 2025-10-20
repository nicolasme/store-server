-- Migration: Add resolution column to projects table
-- Created: 2025-10-20
-- Description: Adds resolution field to track H3 hexagon resolution level for each project

-- Add resolution column to projects table
-- Resolution represents the H3 resolution level (4=Country, 6=State, 8=City, 10=Town)
-- Default to 8 (City level) for existing projects
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS resolution INTEGER DEFAULT 8;

-- Add check constraint to ensure resolution is within valid range
ALTER TABLE projects
ADD CONSTRAINT check_resolution_range
CHECK (resolution >= 4 AND resolution <= 10);

-- Create index for resolution column (for potential filtering/queries)
CREATE INDEX IF NOT EXISTS idx_projects_resolution ON projects(resolution);

-- Add comment to document the column
COMMENT ON COLUMN projects.resolution IS 'H3 hexagon resolution level: 4=Country, 6=State, 8=City, 10=Town';
