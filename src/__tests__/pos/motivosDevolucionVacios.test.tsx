/**
 * @jest-environment jsdom
 *
 * El formulario de devolución no inventa motivos. Si el catálogo activo está
 * vacío, avisa, enlaza a la pantalla de motivos y no llama a procesar_devolucion.
 */
import fs from 'fs';
import path from 'path';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { ReturnReason, SaleForReturn } from '@/components/pos/devoluciones/types';

const mockGetActive = jest.fn();
const mockProcesar = jest.fn();

jest.mock('@/components/pos/devoluciones/motivos/returnReasonsService', () => ({
  ReturnReasonsService: { getActive: () => mockGetActive() },
}));
jest.mock('@/components/pos/devoluciones/devolucionesService', () => ({
  DevolucionesService: { procesarDevolucion: (...args: unknown[]) => mockProcesar(...args) },
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (n: number) => String(n) }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: () => '23 oct 2026' }),
}));
jest.mock('@/components/shared/RichTextEditor', () => ({
  RichTextEditor: () => null,
}));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('next/link', () => {
  const React = require('react') as typeof import('react');
  return {
    __esModule: true,
    default: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});

import { ReturnForm } from '@/components/pos/devoluciones/ReturnForm';

const REPO = path.resolve(__dirname, '..', '..', '..');
const AVISO = 'No hay motivos de devolución activos. Cree uno para poder procesar la devolución.';

const venta: SaleForReturn = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  organization_id: 140,
  branch_id: 1,
  user_id: '00000000-0000-0000-0000-000000000001',
  total: 10000,
  subtotal: 10000,
  tax_total: 0,
  status: 'completed',
  payment_status: 'paid',
  sale_date: '2026-10-23T15:00:00.000Z',
  payments: [],
  items: [{
    id: 'item-1',
    sale_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    product_id: 1,
    product: { id: 1, name: 'Producto de prueba', sku: 'P-1' },
    quantity: 1,
    unit_price: 10000,
    total: 10000,
  }],
};

const motivo = (code: string, name: string, id: number): ReturnReason => ({
  id,
  organization_id: 140,
  code,
  name,
  requires_photo: false,
  affects_inventory: true,
  is_active: true,
  display_order: id,
  created_at: '2026-10-23T15:00:00.000Z',
});

beforeEach(() => {
  mockGetActive.mockReset();
  mockProcesar.mockReset();
});

test('con el catálogo vacío avisa, enlaza a motivos y no llama la RPC', async () => {
  let resolver: (motivos: ReturnReason[]) => void = () => undefined;
  mockGetActive.mockReturnValue(new Promise<ReturnReason[]>((resolve) => {
    resolver = resolve;
  }));

  renderConIdioma(<ReturnForm sale={venta} onBack={jest.fn()} onSuccess={jest.fn()} />);

  expect(screen.queryByText(AVISO)).toBeNull();

  await act(async () => {
    resolver([]);
  });

  expect(await screen.findByText(AVISO)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ir a motivos' }).getAttribute('href')).toBe('/app/pos/devoluciones/motivos');
  expect(screen.queryByRole('option', { name: 'Producto defectuoso' })).toBeNull();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Producto de prueba: seleccionar para devolver' }));
  const procesar = screen.getByRole('button', { name: 'Procesar Devolución' }) as HTMLButtonElement;
  expect(procesar.disabled).toBe(true);
  fireEvent.click(procesar);
  expect(mockProcesar).not.toHaveBeenCalled();
});

test('con motivos del catálogo se puede procesar y no sale el aviso', async () => {
  mockGetActive.mockResolvedValue([
    motivo('DEFECTUOSO', 'Producto defectuoso', 1),
    motivo('INCORRECTO', 'Producto incorrecto', 2),
    motivo('DANADO', 'Producto dañado', 3),
    motivo('NO_CONFORME', 'No conforme', 4),
    motivo('GARANTIA', 'Garantía', 5),
    motivo('OTRO', 'Otro motivo', 6),
  ]);

  renderConIdioma(<ReturnForm sale={venta} onBack={jest.fn()} onSuccess={jest.fn()} />);

  expect(await screen.findByText('Producto de prueba')).toBeTruthy();
  expect(screen.queryByText(AVISO)).toBeNull();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Producto de prueba: seleccionar para devolver' }));
  const procesar = screen.getByRole('button', { name: 'Procesar Devolución' }) as HTMLButtonElement;
  expect(procesar.disabled).toBe(false);
});

describe('textos y migración de motivos', () => {
  test('es, en, fr y pt tienen el aviso y ya no el respaldo fijo', () => {
    for (const idioma of ['es', 'en', 'fr', 'pt']) {
      const mensajes = JSON.parse(fs.readFileSync(path.join(REPO, 'messages', `${idioma}.json`), 'utf8'));
      const formulario = mensajes.posDevoluciones.formulario;
      expect(typeof formulario.sinMotivos).toBe('string');
      expect(typeof formulario.irAMotivos).toBe('string');
      expect(formulario.motivosRespaldo).toBeUndefined();
    }
  });

  test('la pantalla no manda códigos fijos y corta antes de la RPC', () => {
    const form = fs.readFileSync(
      path.join(REPO, 'src/components/pos/devoluciones/ReturnForm.tsx'),
      'utf8',
    );
    expect(form).not.toContain('motivosRespaldo');
    expect(form).not.toContain('value="defectuoso"');
    expect(form).toContain('value={reasonOption.code}');
    expect(form).toContain('href="/app/pos/devoluciones/motivos"');
    expect(form).toContain('if (returnReasons.length === 0)');
    expect(form).toContain('procesarDevolucion(sale.id, refundData, claveIntento.current)');
  });

  test('la migración siembra los seis códigos sin borrar los existentes', () => {
    const dir = path.join(REPO, 'supabase/migrations');
    const archivos = fs.readdirSync(dir).filter((nombre) => nombre.endsWith('_motivos_devolucion_reales.sql'));
    expect(archivos).toHaveLength(1);
    const sql = fs.readFileSync(path.join(dir, archivos[0]), 'utf8').toLowerCase();
    for (const codigo of ['defectuoso', 'incorrecto', 'danado', 'no_conforme', 'garantia', 'otro']) {
      expect(sql).toContain(`'${codigo}'`);
    }
    expect(sql).toContain('on conflict (organization_id, code) do nothing');
    expect(sql).not.toContain('delete from');
    expect(sql).toContain('tr_zzz_motivos_devolucion');
    expect(sql).toContain('security definer');

    const reversiones = fs.readdirSync(path.join(REPO, 'supabase/rollbacks'))
      .filter((nombre) => nombre.includes('motivos_devolucion_reales') && nombre.endsWith('_rollback.sql'));
    expect(reversiones).toHaveLength(1);
    const rollback = fs.readFileSync(path.join(REPO, 'supabase/rollbacks', reversiones[0]), 'utf8');
    const borrado = rollback.slice(rollback.toLowerCase().indexOf('delete from'));
    expect(borrado).toContain('DEFECTUOSO');
    expect(borrado).not.toContain('PRUEBA-DEV');
    expect(borrado).not.toContain("'DEFECT'");
    expect(borrado).not.toContain("'OTHER'");
  });
});
