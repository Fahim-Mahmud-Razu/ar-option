import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from '@ar-option/shared-types';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('contacts')
@UseGuards(AuthGuard, PermissionsGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @RequirePermission('contacts.view')
  async search(@Query('query') query?: string) {
    return this.contactsService.searchContacts(query);
  }

  @Post()
  @RequirePermission('contacts.manage')
  async create(@Body() dto: CreateContactDto) {
    return this.contactsService.createContact(dto);
  }
}

