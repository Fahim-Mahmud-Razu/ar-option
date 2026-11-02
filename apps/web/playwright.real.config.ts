import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Runs against the real API and the local Docker database, with nothing mocked.
dotenv.config({ path: path.resolve(here, '../../.env.test') });

const databaseUrl = process.env.DATABASE_URL || '';
const { hostname } = new URL(databaseUrl);
if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
  throw new Error(`ABORT: Tests run only against local Docker database. Detected host: ${hostname}`);
}

const API_PORT = '3001';
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e-real',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1366, height: 768 },
  },
  webServer: [
    {
      command: 'npx nest start',
      cwd: path.resolve(here, '../api'),
      port: Number(API_PORT),
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        PORT: API_PORT,
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { VITE_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
