const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Optionally load .env.local or .env if DATABASE_URL is not set
if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  const envLocalPath = path.resolve(__dirname, '../.env.local');
  const envPath = path.resolve(__dirname, '../.env');
  const targetEnv = fs.existsSync(envLocalPath) ? envLocalPath : (fs.existsSync(envPath) ? envPath : null);
  if (targetEnv) {
    const lines = fs.readFileSync(targetEnv, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

// Rule: Migrator uses direct connection
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Error: DATABASE_URL or DATABASE_URL_UNPOOLED must be set to run migrations.');
  process.exit(1);
}

async function runMigrations() {
  let urlObj;
  try {
    urlObj = new URL(connectionString);
  } catch (err) {
    console.error('Error: Invalid database URL format.');
    process.exit(1);
  }

  const isLocal = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';
  
  // Safe logging: never print passwords, tokens, or full connection strings
  console.log(`Connecting to database at host: ${urlObj.hostname}:${urlObj.port || 5432}, db: ${urlObj.pathname.slice(1)} (SSL: ${!isLocal})`);

  const client = new Client({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Fetch applied migrations
    const res = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedVersions = new Set(res.rows.map(r => r.version));

    // Read migrations directory
    const migrationsDir = path.resolve(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort((a, b) => {
        const numA = parseInt(a.split('_')[0], 10);
        const numB = parseInt(b.split('_')[0], 10);
        return numA - numB;
      });

    let appliedCount = 0;

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        console.warn(`Skipping invalid migration filename: ${file}`);
        continue;
      }

      const version = parseInt(match[1], 10);
      if (appliedVersions.has(version)) {
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Rule 8: Migrations must not contain BEGIN or COMMIT, wrapped in transaction by migrator
      if (/\bBEGIN\b/i.test(sql) || /\bCOMMIT\b/i.test(sql)) {
        throw new Error(`Migration ${file} contains BEGIN or COMMIT, which violates Rule 8.`);
      }

      console.log(`Applying migration ${file} (version ${version})...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [version, file]
        );
        await client.query('COMMIT');
        appliedCount++;
        console.log(`Successfully applied migration ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Failed to apply migration ${file}. Transaction rolled back.`);
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log('Database is up to date. No new migrations applied.');
    } else {
      console.log(`Successfully applied ${appliedCount} migration(s).`);
    }
  } finally {
    await client.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

