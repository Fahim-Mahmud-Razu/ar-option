import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { LoginDto, CreateUserDto, AuthResponse, SetupStatus, User } from '@ar-option/shared-types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('setup-status')
  @Public()
  async getSetupStatus(): Promise<SetupStatus> {
    return { needs_setup: await this.authService.needsSetup() };
  }

  @Post('login')
  @Public()
  async login(@Body() body: LoginDto): Promise<AuthResponse> {
    return this.authService.login(body);
  }

  @Post('register')
  @Public()
  async register(
    @Body() body: CreateUserDto,
    @Req() req: any
  ): Promise<User> {
    return this.authService.createUser(body, req.user);
  }

  @Get('me')
  async getMe(@Req() req: any): Promise<{ user: User; permissions: string[] }> {
    if (!req.user) {
      throw new UnauthorizedException('Not authenticated.');
    }
    const permissions = await this.authService.getUserPermissions(req.user.role);
    return {
      user: req.user,
      permissions,
    };
  }

  @Get('users')
  async listUsers(@Req() req: any): Promise<User[]> {
    if (!req.user || req.user.role !== 'admin') {
      throw new UnauthorizedException('Admin privileges required to list users.');
    }
    return this.authService.listUsers();
  }

  @Get('users/:id/shops')
  async getUserShops(
    @Req() req: any
  ): Promise<any> {
    const targetUserId = parseInt(req.params.id, 10);
    if (req.user.role !== 'admin' && req.user.id !== targetUserId) {
      throw new ForbiddenException('You can only view your own shops.');
    }
    return this.authService.getUserAssignedShops(targetUserId);
  }

  @Put('users/:id/shops')
  async updateUserShops(
    @Req() req: any,
    @Body() body: { shop_ids: number[] }
  ): Promise<any> {
    if (!req.user || req.user.role !== 'admin') {
      throw new UnauthorizedException('Admin privileges required to manage user shops.');
    }
    const targetUserId = parseInt(req.params.id, 10);
    return this.authService.updateUserShops(targetUserId, body.shop_ids || []);
  }

  @Put('users/:id/discount-limit')
  async updateDiscountLimit(
    @Req() req: any,
    @Body() body: { discount_limit_percent: number }
  ): Promise<User> {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Admin privileges required to change discount limits.');
    }
    return this.authService.updateDiscountLimit(
      parseInt(req.params.id, 10),
      body.discount_limit_percent
    );
  }
}

