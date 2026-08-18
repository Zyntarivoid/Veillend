import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { parseOr422 } from './validation';
import * as telemetry from './telemetry';

describe('parseOr422', () => {
  const schema = z.object({ name: z.string() });

  it('returns { data } for valid input', async () => {
    const result = await parseOr422(schema, { name: 'ok' });
    expect(result.data).toEqual({ name: 'ok' });
  });

  it('throws a 422 Response and reports the ZodError via captureException', async () => {
    const captureSpy = vi.spyOn(telemetry, 'captureException');

    await expect(parseOr422(schema, { name: 42 })).rejects.toBeInstanceOf(Response);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy.mock.calls[0][0]).toBeInstanceOf(z.ZodError);

    captureSpy.mockRestore();
  });
});
