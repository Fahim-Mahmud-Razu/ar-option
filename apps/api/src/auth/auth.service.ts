import {
  Injectable,
  Inject,
  OnModuleInit,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  LoginDto,
  CreateUserDto,
  AuthResponse,
  User,
  Shop,
  PermissionKey,
} from '@ar-option/shared-types';
import * as crypto from 'crypto';

const ALL_PERMISSIONS: PermissionKey[] = [
  'shops.manage',
  'transfers.send',
  'transfers.receive',
  'returns.create',
  'returns.manual',
  'returns.approve',
  'courier.view',
  'courier.manage',
  'courier.settle',
  'pos.edit_price',
  'pos.sell',
  'cash.reconcile',
  'expenses.create',
  'products.manage',
  'products.import',
  'ledger.post',
  'till.view',
  'till.open',
  'till.setup',
  'till.cash_in',
  'till.cash_out',
  'till.close',
];

function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production.');
  }
  return 'ar-option-local-development-only';
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  onModuleInit(): void {
    getJwtSecret();
  }

  /**
   * Secure password hashing with salt using crypto.pbkdf2
   */
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, 10000, 64, 'sha512')
      .toString('hex');
    return `${salt}:${hash}`;
  }

  verifyPassword(password: string, combinedHash: string): boolean {
    const [salt, storedHash] = combinedHash.split(':');
    if (!salt || !storedHash) return false;
    const computedHash = crypto
      .pbkdf2Sync(password, salt, 10000, 64, 'sha512')
      .toString('hex');
    return crypto.timingSafeEqual(
      Buffer.from(storedHash, 'hex'),
      Buffer.from(computedHash, 'hex')
    );
  }

  /**
   * Generates a tamper-proof HMAC signed token
   */
  generateToken(payload: { id: number; email: string; role: string }): string {
    const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    const data = JSON.stringify({ ...payload, exp });
    const b64Data = Buffer.from(data).toString('base64url');
    const signature = crypto
      .createHmac('sha256', getJwtSecret())
      .update(b64Data)
      .digest('base64url');
    return `${b64Data}.${signature}`;
  }

  /**
   * Verifies an HMAC signed token
   */
  async verifyToken(token: string): Promise<User | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const [b64Data, signature] = parts;
      const expectedSignature = crypto
        .createHmac('sha256', getJwtSecret())
        .update(b64Data)
        .digest('base64url');

      const given = Buffer.from(signature);
      const expected = Buffer.from(expectedSignature);
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        return null;
      }

      const payload = JSON.parse(
        Buffer.from(b64Data, 'base64url').toString('utf8')
      );
      if (payload.exp && Date.now() > payload.exp) {
        return null;
      }

      const user = await this.getUserById(payload.id);
      return user && user.is_active ? user : null;
    } catch {
      return null;
    }
  }

  async getUserById(id: number): Promise<User | null> {
    const userRes = await this.pool.query(
      'SELECT id, name, email, role, is_active, discount_limit_percent FROM users WHERE id = $1',
      [id]
    );
    if (userRes.rows.length === 0) return null;

    const row = userRes.rows[0];
    const shops = await this.getUserAssignedShops(row.id);

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      is_active: row.is_active,
      discount_limit_percent: Number(row.discount_limit_percent),
      assigned_shops: shops,
    };
  }

  async getUserAssignedShops(userId: number): Promise<Shop[]> {
    const res = await this.pool.query(
      `SELECT l.id, l.name, l.code, l.is_active, l.is_system
       FROM user_locations ul
       JOIN locations l ON ul.location_id = l.id
       WHERE ul.user_id = $1 AND l.is_active = true
       ORDER BY l.id ASC`,
      [userId]
    );
    return res.rows;
  }

  async getUserPermissions(role: string): Promise<string[]> {
    if (role === 'admin') {
      return [...ALL_PERMISSIONS];
    }
    const res = await this.pool.query(
      'SELECT permission FROM role_permissions WHERE role = $1',
      [role]
    );
    return res.rows.map((r) => r.permission);
  }

  /**
   * Authenticate user with email and password
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const res = await this.pool.query(
      'SELECT id, name, email, password_hash, role, is_active, discount_limit_percent FROM users WHERE email = $1',
      [dto.email.trim().toLowerCase()]
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const row = res.rows[0];
    if (!row.is_active) {
      throw new UnauthorizedException('User account is inactive.');
    }

    const valid = this.verifyPassword(dto.password, row.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const shops = await this.getUserAssignedShops(row.id);
    const permissions = await this.getUserPermissions(row.role);

    const user: User = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      is_active: row.is_active,
      discount_limit_percent: Number(row.discount_limit_percent),
      assigned_shops: shops,
    };

    const token = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user,
      permissions,
    };
  }

  /**
   * Register a new user.
   * If database has 0 users, allows bootstrapping the initial 'admin' user!
   * Otherwise requires caller to be an admin.
   */
  async createUser(dto: CreateUserDto, callingUser?: User): Promise<User> {
    const countRes = await this.pool.query('SELECT COUNT(*) AS total FROM users');
    const totalUsers = parseInt(countRes.rows[0].total, 10);

    if (totalUsers > 0) {
      if (!callingUser || callingUser.role !== 'admin') {
        throw new ForbiddenException(
          'Only an administrator can create new users.'
        );
      }
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      throw new BadRequestException(`Email '${email}' is already registered.`);
    }

    const passwordHash = this.hashPassword(dto.password);
    const role = totalUsers === 0 ? 'admin' : dto.role || 'staff';

    const insertRes = await this.pool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active, discount_limit_percent)
       VALUES ($1, $2, $3, $4, true, $5)
       RETURNING id, name, email, role, is_active, discount_limit_percent`,
      [dto.name.trim(), email, passwordHash, role, this.checkDiscountLimit(dto.discount_limit_percent ?? 0)]
    );

    const newUser = insertRes.rows[0];

    // Assign shops if provided
    if (dto.shop_ids && dto.shop_ids.length > 0) {
      for (const shopId of dto.shop_ids) {
        await this.pool.query(
          `INSERT INTO user_locations (user_id, location_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [newUser.id, shopId]
        );
      }
    }

    const shops = await this.getUserAssignedShops(newUser.id);
    return {
      ...newUser,
      discount_limit_percent: Number(newUser.discount_limit_percent),
      assigned_shops: shops,
    };
  }

  /**
   * True only until the first user exists, so a fresh deployment can create its admin.
   */
  async needsSetup(): Promise<boolean> {
    const res = await this.pool.query('SELECT 1 FROM users LIMIT 1');
    return res.rows.length === 0;
  }

  async updateDiscountLimit(userId: number, percent: number): Promise<User> {
    const res = await this.pool.query(
      'UPDATE users SET discount_limit_percent = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
      [this.checkDiscountLimit(percent), userId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`User #${userId} not found.`);
    }
    return (await this.getUserById(userId)) as User;
  }

  private checkDiscountLimit(percent: number): number {
    const value = Number(percent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new BadRequestException('Discount limit must be between 0 and 100 percent.');
    }
    return value;
  }

  async listUsers(): Promise<User[]> {
    const res = await this.pool.query(
      'SELECT id, name, email, role, is_active, discount_limit_percent FROM users ORDER BY id ASC'
    );
    const users: User[] = [];
    for (const row of res.rows) {
      const shops = await this.getUserAssignedShops(row.id);
      users.push({
        ...row,
        discount_limit_percent: Number(row.discount_limit_percent),
        assigned_shops: shops,
      });
    }
    return users;
  }

  /**
   * User-to-Shop Mapping administration (Rule 1)
   */
  async updateUserShops(userId: number, shopIds: number[]): Promise<Shop[]> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_locations WHERE user_id = $1', [userId]);

      for (const shopId of shopIds) {
        // Ensure shop exists and is not a system location
        const locRes = await client.query(
          'SELECT id, is_system FROM locations WHERE id = $1',
          [shopId]
        );
        if (locRes.rows.length > 0 && !locRes.rows[0].is_system) {
          await client.query(
            `INSERT INTO user_locations (user_id, location_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [userId, shopId]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.getUserAssignedShops(userId);
  }
}

