import { Controller, Get, Put, Body, Req, ForbiddenException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AppSettings } from '@ar-option/shared-types';

/** Company-wide, so no shop guard. Anyone signed in can read; only an admin can change. */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(): Promise<AppSettings> {
    return this.settingsService.getSettings();
  }

  @Put()
  async updateSettings(@Req() req: any, @Body() body: Partial<AppSettings>): Promise<AppSettings> {
    if (!req.user || req.user.role !== 'admin') {
      throw new ForbiddenException('Only an admin can change settings.');
    }
    return this.settingsService.updateSettings(body || {});
  }
}
