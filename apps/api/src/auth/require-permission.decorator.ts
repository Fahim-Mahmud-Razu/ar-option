import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '@ar-option/shared-types';

export const PERMISSION_KEY = 'PERMISSION_KEY';
export const RequirePermission = (permission: PermissionKey) =>
  SetMetadata(PERMISSION_KEY, permission);

