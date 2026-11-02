import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.test explicitly
const envTestPath = path.resolve(__dirname, '../../../.env.test');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
}

// Rule 10 check: Test scripts abort unless DATABASE_URL host is localhost or 127.0.0.1
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('ABORT: DATABASE_URL is not set for test.');
}
const urlObj = new URL(dbUrl);
if (urlObj.hostname !== 'localhost' && urlObj.hostname !== '127.0.0.1') {
  throw new Error(`ABORT: Tests run only against local Docker database. Detected host: ${urlObj.hostname}`);
}

import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { Pool } from 'pg';

describe('HealthController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) {
      try {
        const pool = app.get<Pool>(PG_POOL);
        if (pool) {
          await pool.end();
        }
      } catch {
        // ignore
      }
      await app.close();
    }
  });

  it('GET /health returns status ok and latest migration number without permission key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: 'health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('ok');
    expect(typeof body.migration).toBe('number');
    expect(typeof body.latestMigration).toBe('number');
    expect(body.migration).toBeGreaterThanOrEqual(1);
  });
});

