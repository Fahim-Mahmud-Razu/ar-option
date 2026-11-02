import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class ShopGuard implements CanActivate {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);

    const shopHeader = request.headers['x-shop-id'] || request.query?.shop_id || request.body?.shop_id;
    const shopId = shopHeader != null && shopHeader !== '' ? parseInt(shopHeader, 10) : null;

    // Rule 1: Writes require a shop. If the shop is missing, reject with 400. Never default to shop 1.
    if (isWrite && (shopId === null || isNaN(shopId))) {
      throw new BadRequestException(
        'Every write request requires an active shop (X-Shop-Id header). Defaulting to shop 1 is strictly prohibited by Rule 1.'
      );
    }

    if (shopId !== null && !isNaN(shopId)) {
      // Validate that shop exists and is active
      const locationRes = await this.pool.query(
        'SELECT id, name, is_active, is_system FROM locations WHERE id = $1',
        [shopId]
      );

      if (locationRes.rows.length === 0) {
        throw new BadRequestException(`Shop with ID ${shopId} does not exist.`);
      }

      const shop = locationRes.rows[0];

      if (!shop.is_active) {
        throw new BadRequestException(`Shop '${shop.name}' is inactive.`);
      }

      // Rule 1: System locations can never sell stock or be selected as active selling shop
      if (shop.is_system && isWrite) {
        throw new BadRequestException(
          `System location '${shop.name}' cannot be used as an active shop for write operations.`
        );
      }

      // Rule 1: A shop outside the user's assigned shops returns 403, whatever client sends
      if (request.user && request.user.role !== 'admin') {
        const assignedRes = await this.pool.query(
          'SELECT 1 FROM user_locations WHERE user_id = $1 AND location_id = $2',
          [request.user.id, shopId]
        );
        if (assignedRes.rows.length === 0) {
          throw new ForbiddenException(
            `Access denied. Shop with ID ${shopId} is outside your assigned shops.`
          );
        }
      }

      request.shopId = shopId;
      request.shop = shop;
    }

    return true;
  }
}

