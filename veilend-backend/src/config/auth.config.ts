import { IsOptional, IsString } from 'class-validator';

export class AuthConfig {
  @IsOptional()
  @IsString()
  JWT_SECRET: string = 'dev_secret';
}
