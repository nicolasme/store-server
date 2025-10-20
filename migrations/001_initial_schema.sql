-- Migration: Initial schema for project management
-- Created: 2025-10-17

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL,
  customer_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active'
);

-- Create indexes for projects table
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- Create project_hexagons table
CREATE TABLE IF NOT EXISTS project_hexagons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  hexagon_id VARCHAR(255) NOT NULL,
  hexagon_data JSONB NOT NULL,
  relief_image_url TEXT,
  roads_image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, hexagon_id)
);

-- Create index for project_hexagons table
CREATE INDEX IF NOT EXISTS idx_project_hexagons_project_id ON project_hexagons(project_id);

