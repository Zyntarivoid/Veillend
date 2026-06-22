import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;
  let service: jest.Mocked<
    Pick<AdminService, 'getProtocolConfig' | 'getRiskConfig'>
  >;

  beforeEach(() => {
    service = {
      getProtocolConfig: jest.fn().mockReturnValue({ protocol: 'VeilLend' }),
      getRiskConfig: jest.fn().mockReturnValue({ risk: {} }),
    };

    controller = new AdminController(service as unknown as AdminService);
  });

  it('returns protocol configuration from the service', () => {
    expect(controller.getProtocolConfig()).toEqual({ protocol: 'VeilLend' });
    expect(service.getProtocolConfig).toHaveBeenCalledTimes(1);
  });

  it('returns risk configuration from the service', () => {
    expect(controller.getRiskConfig()).toEqual({ risk: {} });
    expect(service.getRiskConfig).toHaveBeenCalledTimes(1);
  });
});
