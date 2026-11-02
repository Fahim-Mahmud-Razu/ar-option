import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PermissionsGuard } from './permissions.guard';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PermissionsGuard,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [AuthService, PermissionsGuard],
})
export class AuthModule {}
