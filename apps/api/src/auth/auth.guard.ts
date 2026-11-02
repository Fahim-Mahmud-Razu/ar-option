import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers?.['authorization'];
    const userIdHeader = req.headers?.['x-user-id'];

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const user = await this.authService.verifyToken(token);
      if (user) {
        req.user = user;
      }
    } else if (userIdHeader) {
      const uid = parseInt(Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader, 10);
      if (!isNaN(uid)) {
        const user = await this.authService.getUserById(uid);
        if (user) {
          req.user = user;
        }
      }
    }

    return true;
  }
}

