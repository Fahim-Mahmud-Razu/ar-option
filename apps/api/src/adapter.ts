import { FastifyAdapter } from '@nestjs/platform-fastify';

/** One place for server limits, so the app and the tests build the same adapter. */
export const createFastifyAdapter = (): FastifyAdapter => new FastifyAdapter({ bodyLimit: 10 * 1024 * 1024 });
