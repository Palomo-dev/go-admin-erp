/**
 * @jest-environment jsdom
 *
 * Preliquidación › Empleados (Figma 20.17.1). Reemplaza a la prueba de la pantalla
 * vieja «cálculo incompleto bloqueado»: una colilla con un bloqueo del motor se ve
 * «Bloqueada» y no muestra neto (no se toma como pagable), y los bloqueos de la
 * base que impiden enviar a revisión se dicen con su cantidad. Datos inventados.
 */
import { screen, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { SeccionEmpleados } from '../SeccionEmpleados';
import type { DetallePeriodo, RevisionPeriodo, VersionPeriodo } from '../apiNomina';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/hrm/nomina/periodos/p1',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }),
}));

const vigente: VersionPeriodo = { id: 'r1', numero: 3, tipo: 'calculo', estado: 'completed', motor: 'hrm-nomina-4', reemplazada_por: null, motivo: null, ejecutada: null, alertas: [] };

const periodo: DetallePeriodo = {
  periodo: {
    id: 'p1', name: null, kind: 'ordinaria', frequency: 'biweekly', period_start: '2026-11-01', period_end: '2026-11-15', payment_date: '2026-11-15',
    status: 'calculated', total_employees: 2, total_gross: 0, total_deductions: 0, total_net: 0, total_employer_cost: 0, approved_at: null, updated_at: null,
  },
  nomina_habilitada: false,
  versiones: [vigente],
  novedades: [],
  colillas: [
    {
      id: 's1', vinculo_id: 'v1', nombre: 'María de prueba', sede_id: null, estado: 'draft', devengado: 6000000, deducciones: 480000, neto: 5520000,
      costo_empleador: 7000000, bases: { dias_trabajados: 15 }, items: [],
      alertas: [{ codigo: 'retencion_porcentaje_fijo_faltante', severidad: 'bloqueo' }],
    },
    {
      id: 's2', vinculo_id: 'v2', nombre: 'Andrés de prueba', sede_id: null, estado: 'draft', devengado: 2500000, deducciones: 200000, neto: 2300000,
      costo_empleador: 3000000, bases: { dias_trabajados: 15 }, items: [],
      alertas: [{ codigo: 'variacion_contra_anterior', severidad: 'aviso', detalle: { neto_anterior: 2000000, neto: 2300000 } }],
    },
  ],
};

const revision: RevisionPeriodo = {
  usuario_id: 'u1',
  permisos: { ver: true, procesar: true, cerrar: false, pagar: false, salario: false },
  habilitada: false,
  bloqueos: [{ codigo: 'novedades_nomina_pendientes', cantidad: 2 }, { codigo: 'retencion_porcentaje_fijo_faltante', severidad: 'bloqueo' }],
  preliquidado_por: 'u1',
  enviado_por: null,
  es_preparador: true,
  aprobacion: null,
  ajustes: [],
};

beforeEach(() => simularAncho(1440));

test('una colilla bloqueada no muestra neto y se marca «Bloqueada»', () => {
  renderConIdioma(<SeccionEmpleados periodo={periodo} personas={new Map()} revision={revision} vigente={vigente} />);
  const fila = screen.getAllByText('María de prueba').map((e) => e.closest('tr')).find(Boolean) as HTMLElement;
  expect(within(fila).getByText('Bloqueada')).toBeTruthy();
  expect(within(fila).queryByText('$ 5520000')).toBeNull();
  // La que no tiene bloqueo sí muestra su neto y la variación frente al anterior.
  const otra = screen.getAllByText('Andrés de prueba').map((e) => e.closest('tr')).find(Boolean) as HTMLElement;
  expect(within(otra).getByText('$ 2300000')).toBeTruthy();
  expect(within(otra).getByText('+15 %')).toBeTruthy();
});

test('los bloqueos de la base que impiden enviar a revisión se dicen con su cantidad', () => {
  renderConIdioma(<SeccionEmpleados periodo={periodo} personas={new Map()} revision={revision} vigente={vigente} />);
  expect(screen.getByText('2 bloqueos impiden enviar a revisión')).toBeTruthy();
  expect(screen.getByText(/2 novedades de nómina por aprobar/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ir a Novedades' }).getAttribute('href')).toBe('/app/hrm/novedades');
});

test('sin cálculo vigente invita a preliquidar en el servidor', () => {
  const onPreliquidar = jest.fn();
  renderConIdioma(<SeccionEmpleados periodo={{ ...periodo, colillas: [] }} personas={new Map()} revision={null} vigente={null} onPreliquidar={onPreliquidar} />);
  screen.getByRole('button', { name: 'Preliquidar' }).click();
  expect(onPreliquidar).toHaveBeenCalled();
});
