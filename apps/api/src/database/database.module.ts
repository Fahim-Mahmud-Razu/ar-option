import { Module, Global } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error('DATABASE_URL is not set.');
        }

        let isLocal = false;
        try {
          const urlObj = new URL(connectionString);
          isLocal = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';
        } catch {
          // fallback
        }

        return new Pool({
          connectionString,
          ssl: isLocal ? false : { rejectUnauthorized: false },
          max: 10,
        });
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}

