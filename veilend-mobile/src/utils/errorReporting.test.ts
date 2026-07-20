import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  scrubPII,
  classifySeverity,
  createErrorReport,
  clearStoredReports,
} from '../utils/errorReporting';

// Clean up stored reports before each test
beforeEach(async () => {
  await clearStoredReports();
});

describe('PII Scrubber', () => {
  it('should redact Stellar secret keys (S...)', () => {
    const input = 'Wallet key: SBTOK2MKM3QZ3X5NEHPQM6BQFLJ4Q3YBX5EGF6SP5BFHHQ2PSNQ4Y5YB';
    const result = scrubPII(input);
    assert.equal(result.includes('SBTOK2MKM3QZ3X5NEHPQM6BQFLJ4Q3YBX5EGF6SP5BFHHQ2PSNQ4Y5YB'), false);
    assert.equal(result.includes('[REDACTED]'), true);
  });

  it('should redact Stellar public keys (G...)', () => {
    const input = 'Address: GD4JQ2W5MMAGJB2HPW2FDIBBGIKZQ2XFB4FG5BMKAOLFMCOJMKBSOAHB';
    const result = scrubPII(input);
    assert.equal(result.includes('GD4JQ2W5MMAGJB2HPW2FDIBBGIKZQ2XFB4FG5BMKAOLFMCOJMKBSOAHB'), false);
    assert.equal(result.includes('[REDACTED]'), true);
  });

  it('should redact Bearer tokens', () => {
    const input = 'Authorization: Bearer my-secret-jwt-token-12345';
    const result = scrubPII(input);
    assert.equal(result.includes('my-secret-jwt-token-12345'), false);
    assert.equal(result.includes('[REDACTED]'), true);
  });

  it('should redact authToken in JSON', () => {
    const input = '{"authToken": "super-secret-token"}';
    const result = scrubPII(input);
    assert.equal(result.includes('super-secret-token'), false);
    assert.equal(result.includes('[REDACTED]'), true);
  });

  it('should preserve non-sensitive data', () => {
    const input = 'User clicked deposit button at 12:00';
    const result = scrubPII(input);
    assert.equal(result, input);
  });
});

describe('Error Severity Classification', () => {
  it('should classify 401 errors as critical', () => {
    const error = new Error('Unauthorized: 401 token expired');
    assert.equal(classifySeverity(error), 'critical');
  });

  it('should classify network errors as high', () => {
    const error = new Error('Network request failed');
    assert.equal(classifySeverity(error), 'high');
  });

  it('should classify TypeError as high', () => {
    const error = new TypeError('Cannot read properties of undefined');
    assert.equal(classifySeverity(error), 'high');
  });

  it('should classify unknown errors as medium', () => {
    const error = new Error('Something went wrong');
    assert.equal(classifySeverity(error), 'medium');
  });

  it('should classify string errors as medium', () => {
    assert.equal(classifySeverity('random string'), 'medium');
  });
});

describe('Error Report Creation', () => {
  it('should create a structured error report', () => {
    const error = new Error('Test error message');
    const report = createErrorReport(error, {
      component: 'DashboardScreen',
      severity: 'high',
    });

    assert.match(report.id, /^err_/);
    assert.equal(report.message, 'Test error message');
    assert.equal(report.severity, 'high');
    assert.equal(report.component, 'DashboardScreen');
    assert.equal(report.type, 'Error');
    assert.ok(report.platform);
    assert.ok(report.appVersion);
    assert.ok(report.timestamp);
  });

  it('should auto-classify severity when not provided', () => {
    const error = new Error('Network timeout');
    const report = createErrorReport(error);
    assert.equal(report.severity, 'high');
  });

  it('should scrub PII from error messages', () => {
    const error = new Error('Auth failed for wallet SBTOK2MKM3QZ3X5NEHPQM6BQFLJ4Q3YBX5EGF6SP5BFHHQ2PSNQ4Y5YB');
    const report = createErrorReport(error);
    assert.equal(
      report.message.includes('SBTOK2MKM3QZ3X5NEHPQM6BQFLJ4Q3YBX5EGF6SP5BFHHQ2PSNQ4Y5YB'),
      false,
    );
    assert.equal(report.message.includes('[REDACTED]'), true);
  });
});
