import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class AuthConfig {
  @IsOptional()
  @IsString()
  JWT_SECRET: string = 'dev_secret';

  // Accepts legacy long-lived JWTs (issued before refresh-token rotation,
  // carrying no `jti`/`sid` claims) via the pre-existing session-token
  // lookup path, logging a deprecation warning per use. Flip to 'false' once
  // every client has upgraded to the refresh-token flow.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() !== 'false' : value,
  )
  @IsBoolean()
  LEGACY_AUTH_ALLOW: boolean = true;
}
