const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Create a connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'hexagonal_tiles',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test the connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

/**
 * Execute a query
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Get a client from the pool
 * @returns {Promise} Pool client
 */
async function getClient() {
  return await pool.connect();
}

/**
 * Initialize database tables
 */
async function initializeTables() {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Create projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id VARCHAR(255) NOT NULL,
        customer_id VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        resolution INTEGER DEFAULT 8,
        elevation_min NUMERIC(10, 2),
        elevation_max NUMERIC(10, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'active',
        CONSTRAINT check_resolution_range CHECK (resolution >= 4 AND resolution <= 10)
      )
    `);

    // Create indexes for projects table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)
    `);

    // Create project_hexagons table
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_hexagons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        hexagon_id VARCHAR(255) NOT NULL,
        hexagon_data JSONB NOT NULL,
        relief_image_url TEXT,
        roads_image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, hexagon_id)
      )
    `);

    // Create index for project_hexagons table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_project_hexagons_project_id ON project_hexagons(project_id)
    `);

    // Add resolution column if it doesn't exist (migration for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'projects' AND column_name = 'resolution'
        ) THEN
          ALTER TABLE projects ADD COLUMN resolution INTEGER DEFAULT 8;
          ALTER TABLE projects ADD CONSTRAINT check_resolution_range
            CHECK (resolution >= 4 AND resolution <= 10);
          CREATE INDEX IF NOT EXISTS idx_projects_resolution ON projects(resolution);
        END IF;
      END $$;
    `);

    // Add elevation columns if they don't exist (migration for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'projects' AND column_name = 'elevation_min'
        ) THEN
          ALTER TABLE projects ADD COLUMN elevation_min NUMERIC(10, 2);
          CREATE INDEX IF NOT EXISTS idx_projects_elevation_min ON projects(elevation_min);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'projects' AND column_name = 'elevation_max'
        ) THEN
          ALTER TABLE projects ADD COLUMN elevation_max NUMERIC(10, 2);
          CREATE INDEX IF NOT EXISTS idx_projects_elevation_max ON projects(elevation_max);
        END IF;
      END $$;
    `);

    // Create gpx_tracks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS gpx_tracks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        file_type VARCHAR(10),
        geojson_filename VARCHAR(255),
        geojson_path TEXT,
        conversion_status VARCHAR(50) DEFAULT 'pending',
        conversion_error TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns to existing gpx_tracks table (migration) - MUST happen before creating indexes
    await client.query(`
      DO $$
      BEGIN
        -- Add file_type column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'gpx_tracks' AND column_name = 'file_type'
        ) THEN
          ALTER TABLE gpx_tracks ADD COLUMN file_type VARCHAR(10);
        END IF;

        -- Add geojson_filename column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'gpx_tracks' AND column_name = 'geojson_filename'
        ) THEN
          ALTER TABLE gpx_tracks ADD COLUMN geojson_filename VARCHAR(255);
        END IF;

        -- Add geojson_path column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'gpx_tracks' AND column_name = 'geojson_path'
        ) THEN
          ALTER TABLE gpx_tracks ADD COLUMN geojson_path TEXT;
        END IF;

        -- Add conversion_status column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'gpx_tracks' AND column_name = 'conversion_status'
        ) THEN
          ALTER TABLE gpx_tracks ADD COLUMN conversion_status VARCHAR(50) DEFAULT 'pending';
        END IF;

        -- Add conversion_error column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'gpx_tracks' AND column_name = 'conversion_error'
        ) THEN
          ALTER TABLE gpx_tracks ADD COLUMN conversion_error TEXT;
        END IF;
      END $$;
    `);

    // Create indexes for gpx_tracks table (after columns exist)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gpx_tracks_project_id ON gpx_tracks(project_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gpx_tracks_uploaded_at ON gpx_tracks(uploaded_at)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gpx_tracks_conversion_status ON gpx_tracks(conversion_status)
    `);

    await client.query('COMMIT');
    console.log('Database tables initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing database tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  query,
  getClient,
  pool,
  initializeTables,
};

