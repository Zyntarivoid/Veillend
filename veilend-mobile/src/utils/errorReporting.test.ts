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
    expect(result).not.toContain('SBTOK2MKM3QZ3X5NEHPQM6BQFLJ4Q3YBX5EGF6SP5BFHHQ2PSNQ4Y5YB');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact Stellar public keys (G...)', () => {
    const input = 'Address: GD4JQ2W5MMAGJB2HPW2FDIBBGIKZQ2XFB4FG5BMKAOLFMCOJMKBSOAHB';
    const result = scrubPII(input);
    expect(result).not.toContain('GD4JQ2W5MMAGJB2HPW2FDIBBGIKZQ2XFB4FG5BMKAOLFMCOJMKBSOAHB');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact Bearer tokens', () => {
    const input = 'Authorization: Bearer my-secret-jwt-token-12345';
    const result = scrubPII(input);
    expect(result).not.toContain('my-secret-jwt-token-12345');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact authToken in JSON', () => {
    const input = '{"authToken": "super-secret-token"}';
    const result = scrubPII(input);
    expect(result).not.toContain('super-secret-token');
    expect(result).toContain('[REDACTED]');
  });

  it('should preserve non-sensitive data', () => {
    const input = 'User clicked deposit button at 12:00';
    const result = scrubPII(input);
    expect(result).toBe(input);
  });
});

describe('Error Severity Classification', () => {
  it('should classify 401 errors as critical', () => {
    const error = new Error('Unauthorized: 401 token expired');
    expect(classifySeverity(error)).toBe('critical');
  });

  it('should classify network errors as high', () => {
    const error = new Error('Network request failed');
    expect(classifySeverity(error)).toBe('high');
  });

  it('should classify TypeError as high', () => {
    const error = new TypeError('Cannot read properties of undefined');
    expect(classifySeverity(error)).toBe('high');
  });

  it('should classify unknown errors as medium', () => {
    const error = new Error('Something went wrong');
    expect(classifySeverity(error)).toBe('medium');
  });

  it('should classify string errors as medium', () => {
    expect(classifySeverity('random string')).toBe('medium');
  });
});

describe('Error Report Creation', () => {
  it('should create a structured error report', () => {
    const error = new Error('Test error message');
    const report = createErrorReport(error, {
      component: 'DashboardScreen',
      severity: 'high',
    });

    expect(report.id).toMatch(/^err_/);
    expect(report.message).toBe('Test error message');
    expect(report.severity).toBe('high');
    expect(report.component).toBe('DashboardScreen');
    expect(report.type).toBe('Error');
    expect(report.platform).toBeDefined();
    expect(report.appVersion).toBeDefined();
    expect(report.timestamp).toBeDefined();
  });

  it('should auto-classify severity when not provided', () => {
    const error = new Error('Network timeout');
    const report = createErrorReport(error);
    expect(report.severity).toBe('high');
  });

  it('should scrub PII from error messages', () => {
    const error = new Error('Auth failed for wallet SBTOK2MKM3QZ3X5NEHPQM6BQFLJ4Q3YBX5EGF6SP5BFHHQ2PSNQ4Y5YB');
    const report = createErrorReport(error);
    expect(report.message).not.toContain('SBTOK2MKM3QZ3X5NEHPQM6BQFLJ4Q3YBX5EGF6SP5BFHHQ2PSNQ4Y5YB');
    expect(report.message).toContain('[REDACTED]');
  });
});
