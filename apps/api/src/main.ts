import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env.local explicitly in development
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  let curr = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.resolve(curr, '.env.local');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      break;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
}

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  // CORS uses an allowlist from an env var. Never use *.
  const corsOriginEnv = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const allowedOrigins = corsOriginEnv
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(
        new Error(`Origin ${origin} not allowed by CORS allowlist`),
        false
      );
    },
    credentials: true,
  });

  // Bind to 0.0.0.0 and read the port from PORT
  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`API server listening on 0.0.0.0:${port}`);
}

bootstrap();

