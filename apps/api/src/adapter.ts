import { FastifyAdapter } from '@nestjs/platform-fastify';

/** A full backup can be much larger than any other request, so only the restore route takes one. */
export const RESTORE_BODY_LIMIT = 100 * 1024 * 1024;

/** One place for server limits, so the app and the tests build the same adapter. */
export const createFastifyAdapter = (): FastifyAdapter => {
  const adapter = new FastifyAdapter({ bodyLimit: 10 * 1024 * 1024 });
  adapter.getInstance().addHook('onRoute', (route) => {
    if (route.url === '/system/restore') route.bodyLimit = RESTORE_BODY_LIMIT;
  });
  return adapter;
};
