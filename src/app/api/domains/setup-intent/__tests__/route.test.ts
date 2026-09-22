import { NextRequest } from 'next/server';

const listCustomers = jest.fn().mockResolvedValue({ data: [] });
const createCustomer = jest.fn().mockResolvedValue({ id: 'cus_domain', metadata: {} });
const createSetupIntent = jest.fn().mockResolvedValue({
  id: 'seti_domain',
  client_secret: 'seti_domain_secret',
});

jest.mock('@/lib/stripe/server', () => ({
  stripe: {
    customers: { list: listCustomers, create: createCustomer },
    setupIntents: { create: createSetupIntent },
  },
}));

jest.mock('@/lib/utils/orgContext', () => {
  const actual = jest.requireActual('@/lib/utils/orgContextError');
  return {
    OrgContextError: actual.OrgContextError,
    getServerOrgContext: jest.fn().mockResolvedValue({
      organizationId: 120,
      userId: 'user-test',
    }),
    requireOrgAdminOrPermission: jest.fn().mockResolvedValue(undefined),
  };
});

import { POST } from '../route';

describe('POST /api/domains/setup-intent', () => {
  beforeEach(() => jest.clearAllMocks());

  test('vincula el cliente y el SetupIntent a la organización y al usuario', async () => {
    const request = new NextRequest('http://localhost/api/domains/setup-intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.com', name: 'Ana Pérez' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ organization_id: '120', user_id: 'user-test' }),
    }));
    expect(createSetupIntent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        purpose: 'domain_purchase',
        organization_id: '120',
        user_id: 'user-test',
      },
    }));
  });
});
