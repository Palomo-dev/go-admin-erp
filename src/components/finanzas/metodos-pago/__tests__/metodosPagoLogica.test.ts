/**
 * Finanzas ronda 2, A11 y A12: Cobros QR como pestaña (con estado de error
 * propio) y «un método con pagos se desactiva, no se elimina».
 */
import * as fs from 'fs';
import * as path from 'path';
import { accionQuitarMetodo, estadoTablaQr, filtrarSesionesQr, nombreProveedorQr, type SesionQr } from '../metodosPagoLogica';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');

describe('quitar un método de pago', () => {
  test('con pagos se desactiva; sin pagos se elimina', () => {
    expect(accionQuitarMetodo({ esSistema: false, pagos: 12, activo: true })).toBe('desactivar');
    expect(accionQuitarMetodo({ esSistema: false, pagos: 0, activo: true })).toBe('eliminar');
    expect(accionQuitarMetodo({ esSistema: false, pagos: 0, activo: false })).toBe('eliminar');
  });

  test('sin conteo (error o cargando) se trata como «con pagos»', () => {
    expect(accionQuitarMetodo({ esSistema: false, pagos: null, activo: true })).toBe('desactivar');
  });

  test('ya inactivo con pagos, o del sistema: no hay nada que hacer', () => {
    expect(accionQuitarMetodo({ esSistema: false, pagos: 3, activo: false })).toBe('ninguna');
    expect(accionQuitarMetodo({ esSistema: true, pagos: 0, activo: true })).toBe('ninguna');
  });

  test('la lista cuenta payments.method antes de ofrecer eliminar', () => {
    const lista = leer('src/components/finanzas/metodos-pago/PaymentMethodsList.tsx');
    expect(lista).toMatch(/from\("payments"\)[\s\S]{0,200}\.eq\("method", method\.payment_method_code\)/);
    expect(lista).toMatch(/accionQuitarMetodo\(/);
    expect(lista).not.toMatch(/AlertDialog/);
  });

  test('el formulario es un diálogo con Desactivar y conserva la RPC y el nombre propio', () => {
    const form = leer('src/components/finanzas/metodos-pago/PaymentMethodForm.tsx');
    expect(form).toMatch(/<Dialogo/);
    expect(form).toMatch(/metodo\.desactivar/);
    expect(form).toMatch(/rpc\("fn_metodo_pago_personalizado_crear"/);
    expect(form).not.toMatch(/\.delete\(/);
    const pagina = leer('src/components/finanzas/metodos-pago/PaymentMethodsPage.tsx');
    expect(pagina).not.toMatch(/TabsContent value="editar"/);
  });

  test('migración propuesta con su reversión', () => {
    const base = '20261107220000_metodo_pago_con_pagos_no_se_borra';
    expect(leer(`supabase/migrations/${base}.sql`)).toMatch(/before delete on public\.organization_payment_methods/);
    expect(fs.existsSync(path.join(RAIZ, 'supabase', 'rollbacks', `${base}_rollback.sql`))).toBe(true);
  });
});

describe('Cobros QR', () => {
  const s = (p: Partial<SesionQr>): SesionQr => ({
    id: 'q',
    branch_id: null,
    provider_code: 'bancolombia',
    reference: 'QR-7F3A21',
    amount: '48500',
    currency: 'COP',
    source: 'pos',
    source_id: null,
    status: 'paid',
    paid_at: null,
    created_at: '2026-11-07T16:42:00Z',
    ...p,
  });

  test('un error de carga no se ve como «no hay sesiones»', () => {
    expect(estadoTablaQr({ cargando: false, error: 'permiso', total: 0, visibles: 0 })).toBe('error');
    expect(estadoTablaQr({ cargando: false, error: null, total: 0, visibles: 0 })).toBe('vacio');
    expect(estadoTablaQr({ cargando: false, error: null, total: 3, visibles: 0 })).toBe('sinResultados');
    expect(estadoTablaQr({ cargando: true, error: null, total: 0, visibles: 0 })).toBe('cargando');
    expect(estadoTablaQr({ cargando: false, error: null, total: 3, visibles: 2 })).toBe('listo');
  });

  test('filtra por estado y referencia', () => {
    const lista = [s({ id: '1' }), s({ id: '2', status: 'pending', reference: 'QR-7F3A0C' })];
    expect(filtrarSesionesQr(lista, { estado: 'pending', texto: '' }).map((x) => x.id)).toEqual(['2']);
    expect(filtrarSesionesQr(lista, { estado: null, texto: 'a21' }).map((x) => x.id)).toEqual(['1']);
  });

  test('nombre del proveedor', () => {
    expect(nombreProveedorQr('breb')).toBe('Bre-B');
    expect(nombreProveedorQr('otro')).toBe('otro');
    expect(nombreProveedorQr(null)).toBe('—');
  });

  test('la ruta vieja abre la pestaña Cobros QR de Métodos de pago', () => {
    expect(leer('src/app/app/finanzas/metodos-pago/qr-sessions/page.tsx')).toMatch(/PaymentMethodsPage pestanaInicial="qr"/);
    expect(leer('src/components/finanzas/metodos-pago/PaymentMethodsPage.tsx')).toMatch(/CobrosQrPestana/);
  });
});
