import { NextRequest } from 'next/server';

// La ruta lee el token al cargar el módulo; sin él responde 503 antes de la guarda.
process.env.VERCEL_API_TOKEN = 'vercel_token_de_prueba';

const retrieveSetupIntent = jest.fn();
const createPaymentIntent = jest.fn();

jest.mock('@/lib/stripe/server', () => ({
  stripe: {
    setupIntents: { retrieve: retrieveSetupIntent },
    paymentIntents: { create: createPaymentIntent },
    refunds: { create: jest.fn() },
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

const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: jest.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle }) }) }),
    }),
  })),
}));

import { POST } from '../route';

const contactoValido = {
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@example.com',
  phone: '+57 300 300 3030',
  address1: 'Calle 1',
  city: 'Bogotá',
  state: 'Bogotá D.C.',
  zip: '110111',
  country: 'CO',
};

describe('POST /api/domains/purchase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  test('no cobra si el dominio ya está registrado (un reenvío reembolsaría la compra legítima)', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: 'dom_existente' }, error: null });
    const request = new NextRequest('http://localhost/api/domains/purchase', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'ejemplo.store', setupIntentId: 'seti_test', contactInfo: contactoValido }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ success: false, code: 'DOMAIN_ALREADY_REGISTERED' });
    expect(retrieveSetupIntent).not.toHaveBeenCalled();
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });

  test('rechaza el teléfono local antes de crear un cobro', async () => {
    const request = new NextRequest('http://localhost/api/domains/purchase', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        domain: 'ejemplo.store',
        setupIntentId: 'seti_test',
        contactInfo: {
          firstName: 'Ana',
          lastName: 'Pérez',
          email: 'ana@example.com',
          phone: '3003003030',
          address1: 'Calle 1',
          city: 'Bogotá',
          state: 'Bogotá D.C.',
          zip: '110111',
          country: 'CO',
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: 'INVALID_PHONE' });
    expect(retrieveSetupIntent).not.toHaveBeenCalled();
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });
});
