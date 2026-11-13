/**
 * @jest-environment jsdom
 */
/**
 * Pestañas de Organización › Equipo (Figma sección 91, 2026-11-13): las cuatro
 * pantallas comparten Miembros · Invitaciones · Roles y permisos · Cargos, y
 * solo se ofrecen las que el servidor deja abrir (`/api/me/capacidades` para
 * Miembros e Invitaciones, `/api/organizacion/roles/resumen` para Roles y
 * Cargos). La activa siempre se ve.
 */
import type { ReactElement } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { ResumenEquipo } from '@/lib/roles/tipos';
import { PestanasEquipo } from '../PestanasEquipo';
import { olvidarResumenEquipo } from '../useResumenEquipo';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), prefetch: jest.fn() }),
}));

const acceso = { miembros: true };
jest.mock('../../acceso/useAccesoOrganizacion', () => ({
  useAccesoOrganizacion: () => ({
    organizationId: 7,
    cargando: false,
    error: false,
    recargar: () => undefined,
    puede: { organizacion: acceso.miembros, miembros: acceso.miembros, facturacion: false },
  }),
}));

jest.mock('@/components/shell/sesion/usePlanSesion', () => ({
  usePlanSesion: () => ({ datos: { uso: { usuarios: { actual: 8, maximo: 10, invitacionesVigentes: 3 } } } }),
}));

const resumen = jest.fn<Promise<ResumenEquipo>, []>();
jest.mock('@/lib/services/roles/clienteRoles', () => ({
  clienteRoles: { resumen: () => resumen() },
}));

const TODO: ResumenEquipo = { verRoles: true, verCargos: true, verPersonas: true, roles: 6, cargos: 5 };

async function pintar(ui: ReactElement) {
  renderConIdioma(ui);
  await act(async () => undefined);
}

const nombres = () => screen.getAllByRole('tab').map((t) => t.textContent);

beforeEach(() => {
  olvidarResumenEquipo();
  push.mockReset();
  resumen.mockReset();
  acceso.miembros = true;
});

describe('PestanasEquipo', () => {
  it('admin: las cuatro pestañas en el orden del diseño, con contadores', async () => {
    resumen.mockResolvedValue(TODO);
    await pintar(<PestanasEquipo activa="miembros" />);
    expect(nombres()).toEqual(['Miembros8', 'Invitaciones3', 'Roles y permisos6', 'Cargos5']);
  });

  it('Cargos navega a /app/roles?vista=cargos', async () => {
    resumen.mockResolvedValue(TODO);
    await pintar(<PestanasEquipo activa="miembros" />);
    fireEvent.click(screen.getByRole('tab', { name: /Cargos/ }));
    expect(push).toHaveBeenCalledWith('/app/roles?vista=cargos');
  });

  it('sin roles.view ni hr.positions.edit: Roles y Cargos no se ofrecen', async () => {
    resumen.mockResolvedValue({ verRoles: false, verCargos: false, verPersonas: false, roles: null, cargos: null });
    await pintar(<PestanasEquipo activa="invitaciones" />);
    expect(nombres()).toEqual(['Miembros8', 'Invitaciones3']);
  });

  it('si el resumen falla: fail-closed (solo lo que ya se sabe)', async () => {
    resumen.mockRejectedValue(new Error('red'));
    await pintar(<PestanasEquipo activa="miembros" />);
    expect(nombres()).toEqual(['Miembros8', 'Invitaciones3']);
  });

  it('en Roles, sin gestionar miembros: no ofrece Miembros ni Invitaciones; Roles y Cargos cambian de vista sin navegar', async () => {
    acceso.miembros = false;
    resumen.mockResolvedValue(TODO);
    const onCambiar = jest.fn(() => true);
    await pintar(<PestanasEquipo activa="roles" roles={4} onCambiar={onCambiar} />);
    expect(nombres()).toEqual(['Roles y permisos4', 'Cargos5']);
    fireEvent.click(screen.getByRole('tab', { name: /Cargos/ }));
    expect(onCambiar).toHaveBeenCalledWith('cargos');
    expect(push).not.toHaveBeenCalled();
  });
});
