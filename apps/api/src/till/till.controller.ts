import { Controller, Get, Post, Body, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';
import { Inject } from '@nestjs/common';
import { TillService } from './till.service';
import { ShopGuard } from '../shops/shop.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { PG_POOL } from '../database/database.module';
import { CloseTillDto, OpenTillDto, TillMovementDto, TillOverview, TillStatus } from '@ar-option/shared-types';

@Controller('till')
@UseGuards(ShopGuard, PermissionsGuard)
export class TillController {
  constructor(
    private readonly till: TillService,
    @Inject(PG_POOL) private readonly pool: Pool
  ) {}

  private shopOf(req: any): number {
    if (!req.shopId) throw new BadRequestException('An active shop is required (X-Shop-Id header).');
    return req.shopId;
  }

  @Get('status')
  @RequirePermission('till.view')
  status(@Req() req: any): Promise<TillStatus> {
    return this.till.getStatus(this.shopOf(req));
  }

  /** One shop when shop_id is given, otherwise every shop the user may see. */
  @Get('overview')
  @RequirePermission('till.view')
  async overview(@Req() req: any): Promise<TillOverview> {
    if (req.shopId) return this.till.getOverview([req.shopId]);
    const res =
      req.user.role === 'admin'
        ? await this.pool.query('SELECT id FROM locations WHERE is_system = false AND is_active = true ORDER BY name')
        : await this.pool.query(
            `SELECT l.id FROM user_locations ul JOIN locations l ON l.id = ul.location_id
             WHERE ul.user_id = $1 AND l.is_system = false AND l.is_active = true ORDER BY l.name`,
            [req.user.id]
          );
    return this.till.getOverview(res.rows.map((r) => r.id));
  }

  @Post('open')
  @RequirePermission('till.open')
  open(@Body() dto: OpenTillDto, @Req() req: any): Promise<TillStatus> {
    return this.till.open(this.shopOf(req), dto, req.user);
  }

  @Post('movements')
  @RequirePermission('till.view')
  movement(@Body() dto: TillMovementDto, @Req() req: any): Promise<TillStatus> {
    return this.till.addMovement(this.shopOf(req), dto, req.user);
  }

  @Post('close')
  @RequirePermission('till.close')
  close(@Body() dto: CloseTillDto, @Req() req: any): Promise<TillStatus> {
    return this.till.close(this.shopOf(req), dto, req.user);
  }
}
