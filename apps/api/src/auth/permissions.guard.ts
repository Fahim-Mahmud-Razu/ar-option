import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PERMISSION_KEY } from './require-permission.decorator';
import { PermissionKey } from '@ar-option/shared-types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(PG_POOL) private readonly pool: Pool
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<PermissionKey>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()]
    );

    // Routes without permission requirements (e.g. GET /health) pass through
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required to access this resource.');
    }

    // Rule 5: admin is a superuser
    if (user.role === 'admin') {
      return true;
    }

    // Check role_permissions table
    const result = await this.pool.query(
      'SELECT 1 FROM role_permissions WHERE role = $1 AND permission = $2',
      [user.role, requiredPermission]
    );

    if (result.rows.length === 0) {
      throw new ForbiddenException(
        `Permission denied. Missing required permission: '${requiredPermission}' for role '${user.role}'`
      );
    }

    return true;
  }
}

