import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { Public } from '../auth/public.decorator';
import { HealthResponse } from '@ar-option/shared-types';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  @Public()
  async getHealth(): Promise<HealthResponse> {
    const result = await this.pool.query(
      'SELECT MAX(version) AS latest_migration FROM schema_migrations;'
    );
    const latest = result.rows[0]?.latest_migration != null ? Number(result.rows[0].latest_migration) : 0;

    return {
      status: 'ok',
      migration: latest,
      latestMigration: latest,
    };
  }
}

