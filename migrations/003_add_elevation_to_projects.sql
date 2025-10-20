-- Migration: Add elevation min/max columns to projects table
-- Created: 2025-10-20
-- Description: Adds elevation_min and elevation_max fields to track the overall elevation range across all hexagons in a project

-- Add elevation_min column to projects table
-- Stores the minimum elevation across all hexagons in the project (in meters)
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS elevation_min NUMERIC(10, 2);

-- Add elevation_max column to projects table
-- Stores the maximum elevation across all hexagons in the project (in meters)
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS elevation_max NUMERIC(10, 2);

-- Create indexes for elevation columns (for potential filtering/queries)
CREATE INDEX IF NOT EXISTS idx_projects_elevation_min ON projects(elevation_min);
CREATE INDEX IF NOT EXISTS idx_projects_elevation_max ON projects(elevation_max);

-- Add comments to document the columns
COMMENT ON COLUMN projects.elevation_min IS 'Minimum elevation across all hexagons in the project (meters)';
COMMENT ON COLUMN projects.elevation_max IS 'Maximum elevation across all hexagons in the project (meters)';
