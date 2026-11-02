import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'public_route';

/**
 * Login is optional on this route. A valid token still sets req.user.
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
