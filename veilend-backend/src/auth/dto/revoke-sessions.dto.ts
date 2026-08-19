import { IsOptional, IsBoolean } from 'class-validator';

// Body for DELETE /auth/sessions. Defaults to keeping the caller's own
// session active so "logout everywhere" can't accidentally log the caller
// out of the request they're making it from; pass `keepCurrent: false` to
// revoke every session including the current one.
export class RevokeSessionsDto {
  @IsOptional()
  @IsBoolean()
  keepCurrent?: boolean;
}
