import { NextResponse } from 'next/server';
import type { ZodType, z } from 'zod';
import { captureException } from './telemetry';

/**
 * Validates `json` against `schema` and returns the parsed data.
 * On failure, reports the ZodError via captureException and throws a
 * 422 Response with the flattened issues so callers can `return` it
 * directly from a route handler's catch block.
 */
export async function parseOr422<Schema extends ZodType>(
  schema: Schema,
  json: unknown
): Promise<{ data: z.infer<Schema> }> {
  const result = await schema.safeParseAsync(json);

  if (!result.success) {
    captureException(result.error);
    throw NextResponse.json(
      { error: 'Validation failed', issues: result.error.flatten() },
      { status: 422 }
    );
  }

  return { data: result.data };
}
