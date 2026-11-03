import { Controller, Get, Post, Body, Req, Res, ForbiddenException } from '@nestjs/common';
import { SystemService } from './system.service';
import { BackupFile, ResetDto, SystemResult } from '@ar-option/shared-types';

/** Company-wide and admin only, so no shop guard. */
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('backup')
  async backup(@Req() req: any, @Res({ passthrough: true }) reply: any): Promise<BackupFile> {
    this.requireAdmin(req);
    const file = await this.systemService.backup();
    const stamp = file.created_at.slice(0, 16).replace('T', '-').replace(':', '');
    reply.header('Content-Disposition', `attachment; filename="ar-option-backup-${stamp}.json"`);
    return file;
  }

  @Post('restore')
  async restore(@Req() req: any, @Body() body: BackupFile): Promise<SystemResult> {
    this.requireAdmin(req);
    return this.systemService.restore(body);
  }

  @Post('reset')
  async reset(@Req() req: any, @Body() body: ResetDto): Promise<SystemResult> {
    this.requireAdmin(req);
    return this.systemService.reset(body, req.user.id);
  }

  private requireAdmin(req: any): void {
    if (!req.user || req.user.role !== 'admin') {
      throw new ForbiddenException('Only an admin can back up, restore or reset data.');
    }
  }
}
