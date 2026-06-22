import assert from 'node:assert/strict';
import test from 'node:test';
import { buildErrorReport } from './errorReporting';

test('builds sanitized error reports without secrets or user identifiers', () => {
  const error = new Error(
    'Request failed for email user@example.com with token=supersecretvalue12345678901234567890',
  );
  error.stack = 'Error: boom\n    at login (app.ts:1:1) Bearer abcdefghijklmnopqrstuvwxyz1234567890';

  const report = buildErrorReport(
    error,
    {
      severity: 'fatal',
      area: 'mobile-app',
      screen: 'Dashboard',
      action: 'syncPositions',
      tags: {
        network: 'testnet',
        token: 'do-not-include',
        address: '0x1234567890abcdef1234567890abcdef12345678',
      },
      extra: {
        safeStatus: 'sync_failed',
        nested: {
          password: 'never-include',
          detail: 'authorization=secretvalue12345678901234567890',
        },
      },
    },
    new Date('2026-06-22T21:45:00.000Z'),
  );

  assert.equal(report.severity, 'fatal');
  assert.equal(report.context.area, 'mobile-app');
  assert.equal(report.context.screen, 'Dashboard');
  assert.equal(report.context.action, 'syncPositions');
  assert.equal(report.timestamp, '2026-06-22T21:45:00.000Z');
  assert.equal(report.context.tags?.network, 'testnet');
  assert.equal(report.context.tags?.token, '[redacted]');
  assert.equal(report.context.tags?.address, '[redacted]');
  assert.equal((report.context.extra?.nested as { password: string }).password, '[redacted]');

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('user@example.com'), false);
  assert.equal(serialized.includes('supersecretvalue'), false);
  assert.equal(serialized.includes('do-not-include'), false);
  assert.equal(serialized.includes('never-include'), false);
  assert.equal(serialized.includes('0x1234567890abcdef1234567890abcdef12345678'), false);
});

test('normalizes non-error throws into report payloads', () => {
  const report = buildErrorReport('plain failure', { area: 'wallet' }, new Date('2026-06-22T21:46:00.000Z'));

  assert.equal(report.name, 'Error');
  assert.equal(report.message, 'plain failure');
  assert.equal(report.severity, 'error');
  assert.equal(report.context.area, 'wallet');
});
