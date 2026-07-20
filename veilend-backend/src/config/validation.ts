import { plainToClass } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ClassConstructor } from 'class-transformer/types/interfaces';
import { Logger } from '@nestjs/common';

const logger = new Logger('ConfigValidation');

export function validateConfig<T extends object>(
  config: Record<string, unknown>,
  configClass: ClassConstructor<T>,
): T {
  const validatedConfig = plainToClass(configClass, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map((err) => {
      const constraints = err.constraints
        ? Object.values(err.constraints).join(', ')
        : '';
      return `[${err.property}]: ${constraints}`;
    });
    const message = `Configuration validation failed:\n${errorMessages.join('\n')}`;
    logger.error(message);
    throw new Error(message);
  }
  return validatedConfig;
}

export function redactConfig<T extends Record<string, unknown>>(
  config: T,
  sensitiveKeys: string[] = ['SECRET', 'KEY', 'TOKEN', 'PRIVATE'],
): Partial<T> {
  const result: Partial<T> = {};
  for (const key in config) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      const isSensitive = sensitiveKeys.some((sensitiveKey) =>
        key.toUpperCase().includes(sensitiveKey),
      );
      result[key as keyof typeof result] = isSensitive
        ? ('[REDACTED]' as unknown as T[keyof T])
        : config[key];
    }
  }
  return result;
}
