/**
 * @jest-environment jsdom
 */
/**
 * Configuración › Plan y facturación (Figma 93-config-plan-y-facturacion-
 * resumen): resumen de solo lectura dentro del diálogo, con los datos que lee
 * el servidor (`GET /api/me/plan` y `GET /api/modules`). Los enlaces cierran el
 * diálogo; si los módulos no llegan, esa fila se omite en vez de inventarla.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { PlanSesion } from '@/components/shell/sesion/usePlanSesion';

let mockPlan: { datos: PlanSesion | null; cargando: boolean; error: boolean; recargar: jest.Mock };
jest.mock('@/components/shell/sesion/usePlanSesion', () => ({ usePlanSesion: () => mockPlan }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));

import { PlanResumenPanel } from '../panels/general/PlanResumenPanel';

const DATOS: PlanSesion = {
  plan: {
    nombre: 'Ultimate',
    codigo: 'ultimate',
    estado: 'activo',
    diasPruebaRestantes: null,
    diasPruebaTotales: null,
    precio: 99,
    moneda: 'USD',
    periodo: 'mensual',
    // Mediodía UTC: el 1 de diciembre también en Bogotá.
    proximoCobro: '2026-12-01T17:00:00Z',
    cancelaAlFinal: false,
    conStripe: true,
    clienteStripe: true,
  },
  uso: {
    usuarios: { actual: 8, maximo: 15 },
    sucursales: { actual: 3, maximo: 5 },
    creditosIa: { restantesPlan: 400, comprados: 100, cupoMensual: 1000, seRenuevan: null },
  },
};

function modulos(respuesta: unknown, ok = true) {
  global.fetch = jest.fn(async () => ({ ok, json: async () => respuesta })) as unknown as typeof fetch;
}

beforeEach(() => {
  mockPlan = { datos: DATOS, cargando: false, error: false, recargar: jest.fn() };
  modulos({ success: true, data: { active_modules_count: 12, available_modules: [...Array(7)].map(() => ({ is_active: true })).concat([{ is_active: false }]) } });
});

test('tarjeta del plan, uso del plan y enlaces que cierran el diálogo', async () => {
  const abrir = jest.fn();
  renderConIdioma(<PlanResumenPanel onAbrirEnlace={abrir} />, { idioma: 'es' });

  expect(await screen.findByRole('heading', { name: 'Plan Ultimate' })).toBeTruthy();
  expect(screen.getByText('Mensual')).toBeTruthy();
  expect(screen.getByText(/Se renueva el 1 de diciembre de 2026\./)).toBeTruthy();

  // Módulos: activos de los que se pueden encender (el inactivo del catálogo no cuenta).
  expect(screen.getByText('12 de 19')).toBeTruthy();
  expect(screen.getByText('3 de 5 incluidas')).toBeTruthy();
  expect(screen.getByText('8 de 15')).toBeTruthy();
  expect(screen.getByText('500 disponibles')).toBeTruthy();

  fireEvent.click(screen.getByRole('link', { name: 'Gestionar plan y facturación' }));
  expect(abrir).toHaveBeenLastCalledWith('/app/organizacion/plan');
  fireEvent.click(screen.getByRole('link', { name: 'Ver facturas' }));
  expect(abrir).toHaveBeenLastCalledWith('/app/plan/billing');
  fireEvent.click(screen.getByRole('link', { name: 'Recargar' }));
  expect(abrir).toHaveBeenLastCalledWith('/app/organizacion/plan');

  // Solo lectura: nada que guardar.
  expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();
});

test('si los módulos no se pueden leer, esa fila se omite', async () => {
  modulos({ error: 'x' }, false);
  renderConIdioma(<PlanResumenPanel />, { idioma: 'es' });
  expect(await screen.findByText('Sucursales')).toBeTruthy();
  expect(screen.queryByText('Módulos activos')).toBeNull();
});

test('sin plan: lo dice y sin «Ver facturas»; cupos sin límite', async () => {
  mockPlan.datos = { ...DATOS, plan: null, uso: { ...DATOS.uso, usuarios: { actual: 4, maximo: null } } };
  renderConIdioma(<PlanResumenPanel />, { idioma: 'es' });
  expect(await screen.findByRole('heading', { name: 'Sin plan activo' })).toBeTruthy();
  expect(screen.getByText(/Tu organización no tiene un plan activo\./)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Ver facturas' })).toBeNull();
  expect(screen.getByText('4 · sin límite')).toBeTruthy();
});

test('error al leer el plan: aviso con reintentar', async () => {
  mockPlan = { datos: null, cargando: false, error: true, recargar: jest.fn() };
  renderConIdioma(<PlanResumenPanel />, { idioma: 'en' });
  expect(await screen.findByText('The plan couldn’t be loaded')).toBeTruthy();
});
