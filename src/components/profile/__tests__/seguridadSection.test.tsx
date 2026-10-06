/**
 * @jest-environment jsdom
 */
/**
 * «Mi perfil › Seguridad» (Figma 346:19975 y diálogos 347:12179 / 347:12238).
 * La autenticación en dos pasos usa el MFA TOTP de Supabase Auth con un
 * cliente falso; el QR y la clave salen de `enroll`, no se dibujan a mano.
 * Usuario ficticio.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { auth: { mfa: {}, resend: jest.fn(async () => ({ error: null })) } } }));
jest.mock('@/hooks/useEmailConfirmed', () => ({ useEmailConfirmed: () => ({ confirmed: true, loading: false }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import type { User } from '@supabase/supabase-js';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import SeguridadSection from '../SeguridadSection';
import type { ClienteMfa, FactorTotp } from '@/lib/auth/dosPasos';

const usuario = { id: 'u-1', email: 'ana@ejemplo.co', email_confirmed_at: '2026-01-01T00:00:00Z' } as unknown as User;

function clienteFalso(factores: FactorTotp[] = []) {
  const cliente: ClienteMfa = {
    listFactors: jest.fn(async () => ({ data: { totp: factores }, error: null })),
    enroll: jest.fn(async () => ({ data: { id: 'f-nuevo', totp: { qr_code: '<svg/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://x' } }, error: null })),
    challenge: jest.fn(async () => ({ data: { id: 'reto' }, error: null })),
    verify: jest.fn(async () => ({ data: {}, error: null })),
    unenroll: jest.fn(async () => ({ data: {}, error: null })),
  };
  return cliente;
}

describe('SeguridadSection', () => {
  it('sin la bandera ni factores no ofrece dos pasos (el login aún no pide el segundo código)', async () => {
    const cliente = clienteFalso();
    renderConIdioma(<SeguridadSection user={usuario} clienteMfa={() => cliente} banderaMfa={undefined} />);
    await waitFor(() => expect(cliente.listFactors).toHaveBeenCalled());
    expect(screen.queryByText('Autenticación en dos pasos')).toBeNull();
    expect(screen.getByText('Contraseña')).toBeTruthy();
    // Códigos de respaldo: Auth no los expone, no se pinta una fila sin función.
    expect(screen.queryByText(/Códigos de respaldo/)).toBeNull();
  });

  it('con un factor verificado la fila aparece, «Activa», para poder quitarlo', async () => {
    const cliente = clienteFalso([{ id: 'f-ok', status: 'verified' }]);
    renderConIdioma(<SeguridadSection user={usuario} clienteMfa={() => cliente} banderaMfa={undefined} />);
    expect(await screen.findByText('Autenticación en dos pasos')).toBeTruthy();
    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeTruthy();
  });

  it('activar: QR y clave de Auth, código de 6 dígitos y challenge + verify', async () => {
    const cliente = clienteFalso();
    renderConIdioma(<SeguridadSection user={usuario} clienteMfa={() => cliente} banderaMfa="1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activar' }));
    await waitFor(() => expect(cliente.enroll).toHaveBeenCalledTimes(1));
    const qr = await screen.findByRole('img');
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeTruthy();

    const campo = screen.getByPlaceholderText('123456');
    fireEvent.change(campo, { target: { value: '12 34 56' } });
    expect((campo as HTMLInputElement).value).toBe('123456');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verificar y activar' }));
    });
    expect(cliente.verify).toHaveBeenCalledWith({ factorId: 'f-nuevo', challengeId: 'reto', code: '123456' });
    // Activado: no se descarta el factor recién verificado.
    expect(cliente.unenroll).not.toHaveBeenCalledWith({ factorId: 'f-nuevo' });
  });
});
