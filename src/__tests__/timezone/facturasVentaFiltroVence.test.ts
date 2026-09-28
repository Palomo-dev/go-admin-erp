/**
 * Filtro «Vence: …» del listado de facturas de venta (decisión del dueño
 * 2026-09-28). Corre en `npm run test:tz-all` (TZ=UTC, America/Bogota, …): el
 * resultado no puede depender de la zona del proceso, solo de la de la
 * organización.
 *
 * - En la base (`fn_facturas_venta_listado`, 20260928223601) los atajos se
 *   calculan con `fn_today_for` de la sucursal de cada factura; aquí se fija que
 *   la migración lo haga así y que no toque la firma.
 * - En la pantalla, `rangoVence` es el espejo para mostrar los días: se prueba
 *   con el «hoy» de la organización en los bordes de mes.
 */
import fs from 'fs';
import path from 'path';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { consultaFacturasDesde, finDeMes, rangoVence } from '@/lib/finanzas/ventas/listadoFacturas';

const RAIZ = process.cwd();
const sql = fs.readFileSync(path.join(RAIZ, 'supabase/migrations/20260928223601_facturas_venta_listado_filtro_vencimiento.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(RAIZ, 'supabase/rollbacks/20260928223601_facturas_venta_listado_filtro_vencimiento_rollback.sql'), 'utf8');

describe('«este mes» es el mes de la organización, no el del proceso ni el UTC', () => {
  // 1 oct 2026 a las 03:00 UTC: en Bogotá todavía es 30 de septiembre.
  const instante = new Date('2026-10-01T03:00:00Z');

  it('Bogotá: del 1 al 30 de septiembre', () => {
    const hoy = toPlainDate(instante, 'America/Bogota');
    expect(hoy).toBe('2026-09-30');
    expect(rangoVence('mes', hoy)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
  });

  it('una organización en UTC: del 1 al 31 de octubre', () => {
    const hoy = toPlainDate(instante, 'UTC');
    expect(hoy).toBe('2026-10-01');
    expect(rangoVence('mes', hoy)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
  });

  it('último día de cada mes, bisiestos y fin de año', () => {
    expect(finDeMes('2024-02-10')).toBe('2024-02-29');
    expect(finDeMes('2026-02-10')).toBe('2026-02-28');
    expect(finDeMes('2026-12-31')).toBe('2026-12-31');
    expect(rangoVence('mes', '2026-12-31')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
  });
});

describe('los demás atajos sobre el «hoy» de la organización', () => {
  const hoy = '2026-09-28'; // lunes

  it('vencidas: hasta ayer · hoy · próximos 15 días', () => {
    expect(rangoVence('vencidas', hoy)).toEqual({ desde: null, hasta: '2026-09-27' });
    expect(rangoVence('hoy', hoy)).toEqual({ desde: hoy, hasta: hoy });
    expect(rangoVence('proximos15', hoy)).toEqual({ desde: hoy, hasta: '2026-10-13' });
  });

  it('semana de lunes a domingo (igual que date_trunc(week) en la base)', () => {
    expect(rangoVence('semana', '2026-09-28')).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' });
    expect(rangoVence('semana', '2026-10-04')).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' });
    expect(rangoVence('semana', '2026-09-27')).toEqual({ desde: '2026-09-21', hasta: '2026-09-27' });
  });

  it('rango: los días elegidos, tal cual', () => {
    expect(rangoVence('rango', hoy, { desde: '2026-10-01', hasta: '2026-10-15' })).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' });
    expect(rangoVence('rango', hoy)).toEqual({ desde: null, hasta: null });
  });
});

describe('la query pasa por lista blanca', () => {
  it('atajos conocidos y días bien formados', () => {
    expect(consultaFacturasDesde(new URLSearchParams('vence=mes')).filtros).toEqual({ vence: 'mes' });
    expect(consultaFacturasDesde(new URLSearchParams('vence=rango&vence_desde=2026-10-01&vence_hasta=2026-10-15')).filtros).toEqual({
      vence: 'rango',
      vence_desde: '2026-10-01',
      vence_hasta: '2026-10-15',
    });
  });

  it('valores desconocidos o días mal formados se descartan', () => {
    expect(consultaFacturasDesde(new URLSearchParams("vence=manana&vence_desde=2026-10-01';drop&vence_hasta=15/10/2026")).filtros).toEqual({});
  });
});

describe('la RPC resuelve el vencimiento con el día de la sucursal', () => {
  it('misma firma, claves opcionales en p_filtros', () => {
    expect(sql).toMatch(/create or replace function public\.fn_facturas_venta_listado\(\s*p_org integer,\s*p_filtros jsonb default '\{\}'::jsonb,/);
    expect(sql).toContain("v_vence text := nullif(v_f->>'vence', '');");
    expect(sql).toContain("v_vence_desde date := nullif(v_f->>'vence_desde', '')::date;");
  });

  it('atajos sobre dia_vence y hoy de la zona de la sucursal, solo facturas con saldo', () => {
    expect(sql).toContain('public.fn_today_for(p_org, x.branch_id) as hoy');
    expect(sql).toMatch(/case when i\.due_date is not null then \(i\.due_date at time zone z\.tz\)::date end as dia_vence/);
    expect(sql).toMatch(/status in \('issued', 'paid', 'partial'\) and balance > 0 and dia_vence is not null/);
    expect(sql).toMatch(/when 'mes' then dia_vence between date_trunc\('month', hoy::timestamp\)::date\s+and \(date_trunc\('month', hoy::timestamp\) \+ interval '1 month'\)::date - 1/);
    expect(sql).toMatch(/when 'proximos15' then dia_vence between hoy and hoy \+ 15/);
    // Nada de `current_date` ni de now()::date: el día sale de la organización.
    expect(sql).not.toMatch(/current_date|now\(\)::date/);
  });

  it('sigue con guarda de organización, permiso y revoke; el rollback vuelve a la versión anterior', () => {
    expect(sql).toContain('perform public.fn_assert_acceso_org(p_org);');
    expect(sql).toContain("perform public.fn_finanzas_exigir_permiso(p_org, array['finance.view']);");
    expect(sql).toMatch(/revoke all on function public\.fn_facturas_venta_listado\(integer, jsonb, text, integer, integer\) from public, anon;/);
    expect(rollback).not.toContain('v_vence');
    expect(rollback).toContain('facturas_vence_15');
  });
});
