import { IsOptional, IsInt, Min } from 'class-validator';

export class AppConfig {
  @IsOptional()
  @IsInt()
  @Min(1)
  PORT: number = 3000;
}
