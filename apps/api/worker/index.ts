import { Container } from '@cloudflare/containers';

export class ApiContainer extends Container {
  defaultPort = 3000;
  sleepAfter = '2h';
  enableInternet = true;
  pingEndpoint = '/health';
}

interface Env {
  API_CONTAINER: any;
  DATABASE_URL?: string;
  CORS_ORIGIN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = env.API_CONTAINER.getByName('ar-option-api-singleton');

    if (env.DATABASE_URL) {
      container.envVars = {
        ...container.envVars,
        DATABASE_URL: env.DATABASE_URL,
        PORT: '3000',
        CORS_ORIGIN: env.CORS_ORIGIN || '',
      };
    }

    await container.startAndWaitForPorts();
    return container.fetch(request);
  },
};

