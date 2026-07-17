import { of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps plain values in a success envelope', (done) => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const context = {
      getType: () => 'http',
    } as any;

    interceptor.intercept(context, { handle: () => of({ hello: 'world' }) }).subscribe((value) => {
      expect(value).toEqual({ success: true, data: { hello: 'world' } });
      done();
    });
  });
});
