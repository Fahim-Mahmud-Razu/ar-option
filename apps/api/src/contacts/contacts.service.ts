import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { Contact, CreateContactDto } from '@ar-option/shared-types';

@Injectable()
export class ContactsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async searchContacts(query?: string): Promise<Contact[]> {
    const q = (query || '').trim();
    if (!q) {
      const res = await this.pool.query(
        'SELECT id, name, phone, email, address, is_active, created_at FROM contacts WHERE is_active = true ORDER BY name ASC LIMIT 30'
      );
      return res.rows;
    }

    const like = `%${q}%`;
    const res = await this.pool.query(
      `SELECT id, name, phone, email, address, is_active, created_at
       FROM contacts
       WHERE is_active = true AND (phone ILIKE $1 OR name ILIKE $1)
       ORDER BY name ASC LIMIT 30`,
      [like]
    );
    return res.rows;
  }

  async getContactById(id: number): Promise<Contact> {
    const res = await this.pool.query(
      'SELECT id, name, phone, email, address, is_active, created_at FROM contacts WHERE id = $1',
      [id]
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Contact #${id} not found.`);
    }
    return res.rows[0];
  }

  async createContact(dto: CreateContactDto): Promise<Contact> {
    const name = (dto.name || '').trim();
    const phone = (dto.phone || '').trim();
    if (!name) throw new BadRequestException('Contact name is required.');
    if (!phone) throw new BadRequestException('Contact phone number is required.');

    const res = await this.pool.query(
      `INSERT INTO contacts (name, phone, email, address, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, phone, email, address, is_active, created_at`,
      [name, phone, dto.email?.trim() || null, dto.address?.trim() || null]
    );
    return res.rows[0];
  }
}

