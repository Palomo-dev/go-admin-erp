/**
 * @jest-environment jsdom
 *
 * Invitación — acceso v3 (R11; docs/design/AUTH-ACCESO-V2.md §13). Lo que se
 * conserva de 39999d0f: la cuenta existente solo acepta con su propia sesión
 * y la nueva la crea el SERVIDOR (ya no `updateUser` desde el navegador).
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const updateUser = jest.fn();
const rpc = jest.fn(async () => ({ data: null, error: null }));
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    auth: {
      updateUser: (...a: unknown[]) => updateUser(...a),
      getUser: async () => ({ data: { user: null } }),
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }),
    },
    rpc: (...a: unknown[]) => rpc(...(a as [])),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
  signInWithEmail: jest.fn(async () => ({ data: { session: null, user: null }, error: { message: 'Invalid login credentials' } })),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ guardarOrganizacionActiva: jest.fn() }));

import InvitationWizard from '../InvitationWizard';

const invitacion = {
  id: 1,
  email: 'ana@ejemplo.com',
  code: 'c'.repeat(64),
  role_id: 3,
  organization_id: 7,
  organization_name: 'Distribuidora del Norte',
  role_name: 'Vendedor',
};

beforeEach(() => {
  updateUser.mockClear();
  rpc.mockClear();
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).includes('pwnedpasswords')) return new Response('ABCDEF:1\n');
    return new Response(JSON.stringify({ success: true, organizationId: 7 }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
});

test('cuenta nueva: dos pasos dentro de un formulario; la cuenta la crea el servidor con la política única', async () => {
  renderConIdioma(<InvitationWizard inviteData={invitacion} accountState="nueva" sessionEmail={null} onComplete={() => undefined} />);
  expect(screen.getByText(/Te invitaron a Distribuidora del Norte como Vendedor/)).toBeTruthy();
  // Enter en el formulario sin datos: valida (antes los botones estaban fuera de un <form>).
  fireEvent.submit(screen.getByLabelText(/^Nombre/).closest('form')!);
  expect((await screen.findAllByText('Este campo es obligatorio.')).length).toBeGreaterThan(0);

  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText(/^Apellido/), { target: { value: 'Gómez' } });
  fireEvent.change(screen.getByRole('textbox', { name: /Teléfono/ }), { target: { value: '3001234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

  const pass = await screen.findByLabelText(/^Contraseña/);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
  fireEvent.change(pass, { target: { value: 'corta' } });
  fireEvent.change(screen.getByLabelText(/^Confirmar contraseña/), { target: { value: 'corta' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
  expect(await screen.findByText('La contraseña debe tener al menos 10 caracteres.')).toBeTruthy();

  fireEvent.change(pass, { target: { value: 'una frase bastante larga' } });
  fireEvent.change(screen.getByLabelText(/^Confirmar contraseña/), { target: { value: 'una frase bastante larga' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
  await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some((c) => String(c[0]) === '/api/auth/accept-invitation')).toBe(true));
  expect(updateUser).not.toHaveBeenCalled();
});

test('cuenta existente sin su sesión: no se pinta el formulario, se pide iniciar sesión', () => {
  renderConIdioma(<InvitationWizard inviteData={invitacion} accountState="existente" sessionEmail="otra@ejemplo.com" onComplete={() => undefined} />);
  expect(screen.getByText('Ya tienes cuenta en GO Admin')).toBeTruthy();
  expect(screen.queryByLabelText(/^Contraseña/)).toBeNull();
  expect(screen.getByRole('button', { name: /Cerrar sesión y entrar como ana@ejemplo.com/ })).toBeTruthy();
});

test('en inglés', () => {
  renderConIdioma(<InvitationWizard inviteData={invitacion} accountState="nueva" sessionEmail={null} onComplete={() => undefined} />, { idioma: 'en' });
  expect(screen.getByText(/You were invited to Distribuidora del Norte as Vendedor/)).toBeTruthy();
});
