/**
 * @jest-environment jsdom
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { Miembro } from '@/lib/organizacion/miembros';
import { DialogoCargo } from '../DialogosMiembro';
import { DialogoInvitar } from '../DialogoInvitar';

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { email_confirmed_at: '2026-01-01T00:00:00.000Z' } } })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}));

const CARGOS = [
  { id: '1', nombre: 'Director de Tecnología' },
  { id: '2', nombre: 'Tesorero' },
  { id: '3', nombre: 'Coordinador de Gimnasio' },
];

function comboboxCargo(texto: string): HTMLElement {
  const encontrado = screen.getAllByRole('combobox').find((el) => el.textContent?.includes(texto));
  if (!encontrado) throw new Error(`No hay combobox con «${texto}»`);
  return encontrado;
}

describe('selector de cargo', () => {
  it('en invitar filtra, hace scroll propio y elige con clic', async () => {
    renderConIdioma(
      <DialogoInvitar
        abierto
        onAbiertoChange={() => undefined}
        organizationId={1}
        roles={[{ id: '4', nombre: 'Empleado' }]}
        sedes={[{ id: '10', nombre: 'Sede principal', principal: true }]}
        cargos={CARGOS}
        cupo={null}
        onInvitada={() => undefined}
      />,
    );

    fireEvent.click(comboboxCargo('Sin cargo'));
    const buscador = await screen.findByPlaceholderText('Buscar cargo…');
    fireEvent.change(buscador, { target: { value: 'tecnolog' } });

    expect(screen.getByRole('option', { name: 'Director de Tecnología' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Tesorero' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Sin cargo' })).toBeNull();

    const lista = screen.getByRole('listbox');
    expect(lista.className).toContain('max-h-60');
    expect(lista.className).toContain('overflow-y-auto');

    fireEvent.click(screen.getByRole('option', { name: 'Director de Tecnología' }));
    expect(comboboxCargo('Director de Tecnología')).toBeTruthy();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('en invitar Enter elige la fila resaltada', async () => {
    renderConIdioma(
      <DialogoInvitar
        abierto
        onAbiertoChange={() => undefined}
        organizationId={1}
        roles={[{ id: '4', nombre: 'Empleado' }]}
        sedes={[{ id: '10', nombre: 'Sede principal', principal: true }]}
        cargos={CARGOS}
        cupo={null}
        onInvitada={() => undefined}
      />,
    );

    fireEvent.click(comboboxCargo('Sin cargo'));
    const buscador = await screen.findByPlaceholderText('Buscar cargo…');
    fireEvent.change(buscador, { target: { value: 'gimnasio' } });
    fireEvent.keyDown(buscador, { key: 'Enter' });
    expect(comboboxCargo('Coordinador de Gimnasio')).toBeTruthy();
  });

  it('al editar un miembro dice que no hay coincidencias y guarda el cargo elegido', async () => {
    const onConfirmar = jest.fn(async () => undefined);
    const miembro: Miembro = {
      id: 'm1',
      userId: 'u1',
      nombre: 'Persona de prueba',
      email: 'persona@example.com',
      avatarUrl: null,
      rolId: 4,
      rolNombre: 'Empleado',
      esSuperAdmin: false,
      activo: true,
      sedes: [],
      cargoId: null,
      cargoNombre: null,
      creadoEn: null,
    };
    renderConIdioma(<DialogoCargo miembro={miembro} cargos={CARGOS} onCerrar={() => undefined} onConfirmar={onConfirmar} />);

    fireEvent.click(comboboxCargo('Sin cargo'));
    const buscador = await screen.findByPlaceholderText('Buscar cargo…');
    fireEvent.change(buscador, { target: { value: 'zzzz' } });
    expect(screen.getByText('No hay cargos con ese nombre')).toBeTruthy();

    fireEvent.change(buscador, { target: { value: 'tesor' } });
    fireEvent.click(screen.getByRole('option', { name: 'Tesorero' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cargo' }));
    expect(onConfirmar).toHaveBeenCalledWith('2');
  });
});
