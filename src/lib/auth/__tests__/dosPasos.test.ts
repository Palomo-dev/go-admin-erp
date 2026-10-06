/**
 * Autenticación en dos pasos con el MFA TOTP de Supabase Auth
 * (`lib/auth/dosPasos.ts`): alta, verificación, cancelación y baja contra un
 * cliente falso que imita `supabase.auth.mfa`.
 */
import {
  confirmarAlta,
  desactivar,
  descartarAlta,
  FalloDosPasos,
  factoresVerificados,
  iniciarAlta,
  qrComoDataUri,
  type ClienteMfa,
  type FactorTotp,
} from '../dosPasos';

function clienteFalso(opciones: { factores?: FactorTotp[]; errorVerify?: unknown; errorEnroll?: unknown; errorUnenroll?: unknown } = {}) {
  const llamadas: string[] = [];
  const cliente: ClienteMfa = {
    listFactors: jest.fn(async () => ({ data: { totp: opciones.factores ?? [] }, error: null })),
    enroll: jest.fn(async () => {
      llamadas.push('enroll');
      return opciones.errorEnroll
        ? { data: null, error: opciones.errorEnroll }
        : { data: { id: 'f-nuevo', totp: { qr_code: '<svg></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } }, error: null };
    }),
    challenge: jest.fn(async () => {
      llamadas.push('challenge');
      return { data: { id: 'reto-1' }, error: null };
    }),
    verify: jest.fn(async () => {
      llamadas.push('verify');
      return { data: opciones.errorVerify ? null : {}, error: opciones.errorVerify ?? null };
    }),
    unenroll: jest.fn(async ({ factorId }: { factorId: string }) => {
      llamadas.push(`unenroll:${factorId}`);
      return { data: opciones.errorUnenroll ? null : {}, error: opciones.errorUnenroll ?? null };
    }),
  };
  return { cliente, llamadas };
}

describe('alta', () => {
  it('borra altas a medias, pide el factor y entrega QR (data URI) y clave', async () => {
    const { cliente, llamadas } = clienteFalso({
      factores: [
        { id: 'f-viejo', status: 'unverified' },
        { id: 'f-ok', status: 'verified' },
      ],
    });
    const alta = await iniciarAlta(cliente);
    expect(llamadas).toEqual(['unenroll:f-viejo', 'enroll']);
    expect(alta).toEqual({ factorId: 'f-nuevo', qr: 'data:image/svg+xml;utf-8,%3Csvg%3E%3C%2Fsvg%3E', secreto: 'JBSWY3DPEHPK3PXP' });
    expect(cliente.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: 'totp', issuer: 'GO Admin' }));
  });

  it('si Auth no deja enrolar, falla como error de red (no como código)', async () => {
    const { cliente } = clienteFalso({ errorEnroll: { message: 'boom', status: 500 } });
    await expect(iniciarAlta(cliente)).rejects.toMatchObject({ codigo: 'red' });
  });

  it('confirmar = challenge + verify con el código sin espacios', async () => {
    const { cliente, llamadas } = clienteFalso();
    await confirmarAlta(cliente, 'f-nuevo', ' 123456 ');
    expect(llamadas).toEqual(['challenge', 'verify']);
    expect(cliente.verify).toHaveBeenCalledWith({ factorId: 'f-nuevo', challengeId: 'reto-1', code: '123456' });
  });

  it('un código equivocado se distingue de un fallo de red', async () => {
    const malo = clienteFalso({ errorVerify: { code: 'mfa_verification_failed', status: 422, message: 'Invalid TOTP code entered' } });
    await expect(confirmarAlta(malo.cliente, 'f', '000000')).rejects.toMatchObject({ codigo: 'codigo' });
    const red = clienteFalso({ errorVerify: { status: 503, message: 'Service Unavailable' } });
    await expect(confirmarAlta(red.cliente, 'f', '000000')).rejects.toBeInstanceOf(FalloDosPasos);
    await expect(confirmarAlta(red.cliente, 'f', '000000')).rejects.toMatchObject({ codigo: 'red' });
  });

  it('cancelar descarta el factor sin verificar y nunca lanza', async () => {
    const { cliente, llamadas } = clienteFalso();
    await descartarAlta(cliente, 'f-nuevo');
    expect(llamadas).toEqual(['unenroll:f-nuevo']);
    const roto: ClienteMfa = { ...cliente, unenroll: jest.fn(async () => Promise.reject(new Error('sin red'))) };
    await expect(descartarAlta(roto, 'f')).resolves.toBeUndefined();
  });
});

describe('baja', () => {
  it('verifica un código (sesión aal2) antes de quitar el factor', async () => {
    const { cliente, llamadas } = clienteFalso();
    await desactivar(cliente, 'f-ok', '123456');
    expect(llamadas).toEqual(['challenge', 'verify', 'unenroll:f-ok']);
  });

  it('con un código equivocado no se quita nada', async () => {
    const { cliente, llamadas } = clienteFalso({ errorVerify: { code: 'mfa_verification_failed' } });
    await expect(desactivar(cliente, 'f-ok', '000000')).rejects.toMatchObject({ codigo: 'codigo' });
    expect(llamadas).not.toContain('unenroll:f-ok');
  });
});

describe('utilidades', () => {
  it('solo cuentan los factores verificados', () => {
    expect(factoresVerificados([{ id: 'a', status: 'verified' }, { id: 'b', status: 'unverified' }]).map((f) => f.id)).toEqual(['a']);
  });

  it('el QR que ya viene como data URI no se recodifica', () => {
    expect(qrComoDataUri('data:image/svg+xml;utf-8,abc')).toBe('data:image/svg+xml;utf-8,abc');
  });
});
