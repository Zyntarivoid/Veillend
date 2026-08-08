import { of } from 'rxjs';
import {
  API_MAJOR_VERSION,
  API_VERSION_HEADER,
  ApiVersionInterceptor,
} from './api-version.interceptor';

describe('ApiVersionInterceptor', () => {
  it('sets X-API-Version on the response', (done) => {
    const headers: Record<string, string> = {};
    const context = {
      switchToHttp: () => ({
        getResponse: () => ({
          setHeader: (key: string, value: string) => {
            headers[key] = value;
          },
        }),
      }),
    };
    const next = { handle: () => of({ ok: true }) };

    new ApiVersionInterceptor()
      .intercept(context as never, next as never)
      .subscribe({
        next: (body) => {
          expect(body).toEqual({ ok: true });
          expect(headers[API_VERSION_HEADER]).toBe(API_MAJOR_VERSION);
          done();
        },
        error: done,
      });
  });
});
