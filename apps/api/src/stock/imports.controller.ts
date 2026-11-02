import { Controller, Get, Post, Body, Req, Header, UseGuards } from '@nestjs/common';
import { ImportsService } from './imports.service';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ImportCommitResult, ImportPreview, ImportRequest } from '@ar-option/shared-types';

@Controller('imports/products')
@UseGuards(PermissionsGuard)
@RequirePermission('products.import')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('preview')
  async preview(@Body() body: ImportRequest, @Req() req: any): Promise<ImportPreview> {
    return this.importsService.preview(body, req.user);
  }

  @Post('commit')
  async commit(@Body() body: ImportRequest, @Req() req: any): Promise<ImportCommitResult> {
    return this.importsService.commit(body, req.user);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(): Promise<string> {
    return this.importsService.exportCsv();
  }
}
