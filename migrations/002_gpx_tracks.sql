-- Migration: Add GPX tracks table
-- Created: 2025-10-20

-- Create gpx_tracks table
CREATE TABLE IF NOT EXISTS gpx_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for gpx_tracks table
CREATE INDEX IF NOT EXISTS idx_gpx_tracks_project_id ON gpx_tracks(project_id);
CREATE INDEX IF NOT EXISTS idx_gpx_tracks_uploaded_at ON gpx_tracks(uploaded_at);
