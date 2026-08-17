import { IsOptional, IsInt, Min } from 'class-validator';

export class AdminConfig {
  @IsOptional()
  @IsInt()
  @Min(100)
  ADMIN_ACTION_WATCHER_POLL_INTERVAL_MS: number = 10000;
}
