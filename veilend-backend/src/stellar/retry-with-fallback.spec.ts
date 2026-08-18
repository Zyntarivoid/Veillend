import { CircuitBreakerManager } from './retry-with-fallback';

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager<{ call: jest.Mock<Promise<unknown>> }>;
  const url1 = 'http://primary.com';
  const url2 = 'http://secondary.com';

  beforeEach(() => {
    jest.useFakeTimers();
    manager = new CircuitBreakerManager('Test', [url1, url2], () => ({
      call: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should route traffic to primary on first read attempt', async () => {
    const primaryClient = manager.getProviders()[0].client;
    primaryClient.call.mockResolvedValue('success');

    const result = await manager.execute('testOp', (client) => client.call(), {
      mode: 'read',
    });
    expect(result).toBe('success');
    expect(primaryClient.call).toHaveBeenCalledTimes(1);
  });

  it('circuit opens after 10 consecutive read failures, traffic transparently fails over to secondary', async () => {
    const primaryClient = manager.getProviders()[0].client;
    const secondaryClient = manager.getProviders()[1].client;

    const err503 = new Error('Service Unavailable');
    Object.assign(err503, { status: 503 });

    primaryClient.call.mockRejectedValue(err503);
    secondaryClient.call.mockResolvedValue('success-on-secondary');

    // Trigger 10 failures with maxAttempts: 1 so we don't sleep
    for (let i = 0; i < 10; i++) {
      try {
        await manager.execute('testOp', (client) => client.call(), {
          mode: 'read',
          maxAttempts: 1,
        });
      } catch {
        // ignore
      }
    }

    expect(manager.getProviders()[0].provider.state).toBe('open');

    // Next call should fail over to secondary directly
    const result = await manager.execute('testOp2', (client) => client.call(), {
      mode: 'read',
    });
    expect(result).toBe('success-on-secondary');
    expect(secondaryClient.call).toHaveBeenCalled();
  });

  it('after cooldown, one half-open probe is sent to primary, success resets counters', async () => {
    const primaryClient = manager.getProviders()[0].client;
    const secondaryClient = manager.getProviders()[1].client;

    const err503 = new Error('Service Unavailable');
    Object.assign(err503, { status: 503 });

    primaryClient.call.mockRejectedValue(err503);
    secondaryClient.call.mockResolvedValue('success-on-secondary');

    // Fail it 10 times to open circuit
    for (let i = 0; i < 10; i++) {
      try {
        await manager.execute('testOp', (client) => client.call(), {
          mode: 'read',
          maxAttempts: 1,
        });
      } catch {
        // ignore
      }
    }
    expect(manager.getProviders()[0].provider.state).toBe('open');

    // Advance time by 30 seconds to trigger cooldown
    jest.advanceTimersByTime(30000);

    // Primary should now be healthy for the probe
    primaryClient.call.mockResolvedValue('success-on-primary-probe');

    const result = await manager.execute('probeOp', (client) => client.call(), {
      mode: 'read',
    });
    expect(result).toBe('success-on-primary-probe');
    expect(manager.getProviders()[0].provider.state).toBe('closed');
    expect(manager.getProviders()[0].provider.failureCount).toBe(0);
  });

  it('confirms no retries occur on the write path, enforcing 1 attempt max', async () => {
    const primaryClient = manager.getProviders()[0].client;

    const err503 = new Error('Service Unavailable');
    Object.assign(err503, { status: 503 });

    primaryClient.call.mockRejectedValue(err503);

    // TypeScript enforcement test (conceptual, as we can't test compile errors at runtime)
    // We enforce maxAttempts: 1 in execute if mode === 'write' regardless of options.
    let caughtErr: unknown;
    try {
      // Even if user tricks the type system, the logic forces maxAttempts = 1 for 'write'
      await manager.execute('writeOp', (client) => client.call(), {
        mode: 'write',
      } as unknown as import('./retry-with-fallback').RetryOptions);
    } catch (e) {
      caughtErr = e;
    }

    expect(caughtErr).toBeDefined();
    expect(primaryClient.call).toHaveBeenCalledTimes(1); // Crucial: only 1 attempt on write!
  });
});
