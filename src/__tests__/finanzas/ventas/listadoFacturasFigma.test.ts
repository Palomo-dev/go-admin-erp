/**
 * Listado de facturas de venta alineado con el Figma aprobado (B.1, 421:167503):
 * reglas puras de las acciones en lote, la query con el periodo de los KPIs,
 * el subtítulo del periodo y la RPC que da los conteos de los KPIs.
 */
import fs from 'fs';
import path from 'path';
import { anularEnLote, elegibilidadPagoLote, filaCobrable, repartirAnulacion } from '@/lib/finanzas/ventas/loteFacturas';
import { consultaFacturasDesde, FILTROS_FACTURAS, FILTROS_PANTALLA_FACTURAS, type FilaFacturaListado } from '@/lib/finanzas/ventas/listadoFacturas';
import { etiquetaRangoLarga } from '@/components/kit/rangoFechas';

const fila = (p: Partial<FilaFacturaListado> & { id: string }): FilaFacturaListado => ({
  numero: `FV-${p.id}`,
  estado: 'issued',
  tipo: 'invoice',
  emision: '2026-09-10T15:00:00Z',
  vencimiento: '2026-10-10T15:00:00Z',
  moneda: 'COP',
  total: 1000,
  saldo: 1000,
  metodo: 'cash',
  branch_id: 1,
  sucursal: 'Principal',
  fe: null,
  sale_id: null,
  origen: null,
  pms: false,
  cliente_id: 'c1',
  cliente: 'Cliente uno',
  cliente_doc: 'NIT 900145221-7',
  dias_vencida: 0,
  ...p,
});

describe('registrar pago en lote: solo facturas cobrables de UN cliente', () => {
  it('mismo cliente y con saldo → reparto del cliente con esas facturas', () => {
    const r = elegibilidadPagoLote([fila({ id: 'a' }), fila({ id: 'b', estado: 'partial', saldo: 400 })], true);
    expect(r).toEqual({ ok: true, clienteId: 'c1', facturaIds: ['a', 'b'] });
  });

  it('clientes distintos → deshabilitado, no se inventa un pago múltiple', () => {
    expect(elegibilidadPagoLote([fila({ id: 'a' }), fila({ id: 'b', cliente_id: 'c2' })], true)).toEqual({ ok: false, motivo: 'varios_clientes' });
  });

  it('sin permiso, sin saldo, borrador, anulada o sin cliente → motivo', () => {
    expect(elegibilidadPagoLote([fila({ id: 'a' })], false)).toEqual({ ok: false, motivo: 'sin_permiso' });
    expect(elegibilidadPagoLote([fila({ id: 'a', saldo: 0 })], true)).toEqual({ ok: false, motivo: 'sin_saldo' });
    expect(elegibilidadPagoLote([fila({ id: 'a', estado: 'draft' })], true)).toEqual({ ok: false, motivo: 'sin_saldo' });
    expect(elegibilidadPagoLote([fila({ id: 'a', estado: 'void' })], true)).toEqual({ ok: false, motivo: 'sin_saldo' });
    expect(elegibilidadPagoLote([fila({ id: 'a', cliente_id: null })], true)).toEqual({ ok: false, motivo: 'sin_cliente' });
    expect(elegibilidadPagoLote([], true)).toEqual({ ok: false, motivo: 'vacio' });
  });

  it('una nota crédito no se cobra', () => {
    expect(filaCobrable(fila({ id: 'a', tipo: 'credit_note' }))).toBe(false);
  });
});

describe('anular en lote respeta L4 por factura', () => {
  it('separa las anulables de las que tienen pagos, FE aceptada o ya están anuladas', () => {
    const r = repartirAnulacion([
      fila({ id: 'borrador', estado: 'draft' }),
      fila({ id: 'emitida' }),
      fila({ id: 'conPagos', saldo: 300 }),
      fila({ id: 'dian', fe: 'accepted' }),
      fila({ id: 'anulada', estado: 'void' }),
    ]);
    expect(r.anulables.map((f) => f.id)).toEqual(['borrador', 'emitida']);
    expect(r.excluidas.map((e) => [e.fila.id, e.motivo])).toEqual([
      ['conPagos', 'con_pagos'],
      ['dian', 'fe_aceptada'],
      ['anulada', 'ya_anulada'],
    ]);
  });

  it('anula una a una por la ruta existente; una falla no detiene las demás', async () => {
    const anular = jest.fn(async (id: string) => {
      if (id === 'b') throw Object.assign(new Error('x'), { codigo: 'factura_con_pagos' });
      return { avisos: id === 'a' ? ['comision_ya_pagada'] : [] };
    });
    const r = await anularEnLote(
      [
        { id: 'a', numero: 'FV-1' },
        { id: 'b', numero: 'FV-2' },
        { id: 'c', numero: 'FV-3' },
      ],
      'Error en la factura',
      anular,
      (e) => (e as { codigo: string }).codigo,
    );
    expect(anular).toHaveBeenCalledTimes(3);
    expect(anular).toHaveBeenCalledWith('a', 'Error en la factura');
    expect(r.anuladas).toEqual(['a', 'c']);
    expect(r.fallidas).toEqual([{ id: 'b', numero: 'FV-2', codigo: 'factura_con_pagos' }]);
    expect(r.avisos).toEqual(['comision_ya_pagada']);
  });
});

describe('query del listado', () => {
  it('kpi_desde / kpi_hasta pasan la lista blanca y separan el periodo de los KPIs del filtro de emisión', () => {
    const c = consultaFacturasDesde(new URLSearchParams('estado_pago=vencida&kpi_desde=2026-09-01&kpi_hasta=2026-09-28&periodo=todo'));
    expect(c.filtros).toEqual({ estado_pago: 'vencida', kpi_desde: '2026-09-01', kpi_hasta: '2026-09-28' });
    // `periodo` es solo de la pantalla: nunca llega a la RPC.
    expect(c.filtros).not.toHaveProperty('periodo');
  });

  it('un kpi_desde mal formado se descarta', () => {
    expect(consultaFacturasDesde(new URLSearchParams("kpi_desde=2026-09-01';drop")).filtros).toEqual({});
  });

  it('la pantalla lee `periodo` de la URL además de los filtros de la RPC', () => {
    expect(FILTROS_PANTALLA_FACTURAS).toEqual([...FILTROS_FACTURAS, 'periodo']);
  });
});

describe('periodo del subtítulo («1 al 30 de septiembre de 2026»)', () => {
  it('en español, como el Figma', () => {
    expect(etiquetaRangoLarga({ desde: '2026-09-01', hasta: '2026-09-30' })).toBe('1 al 30 de septiembre de 2026');
    expect(etiquetaRangoLarga({ desde: '2026-08-28', hasta: '2026-09-03' })).toBe('28 de agosto al 3 de septiembre de 2026');
    expect(etiquetaRangoLarga({ desde: '2025-12-28', hasta: '2026-01-03' })).toBe('28 de diciembre de 2025 al 3 de enero de 2026');
    expect(etiquetaRangoLarga({ desde: '2026-09-22', hasta: '2026-09-22' })).toBe('22 de septiembre de 2026');
  });

  it('los días son puros: no se corren con la zona del proceso', () => {
    expect(etiquetaRangoLarga({ desde: '2026-09-01', hasta: '2026-09-01' }, 'en-US')).toBe('September 1, 2026');
  });
});

describe('la RPC da los conteos de los KPIs sin cambiar su contrato', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260928212308_facturas_venta_listado_figma_kpis.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(process.cwd(), 'supabase/rollbacks/20260928212308_facturas_venta_listado_figma_kpis_rollback.sql'), 'utf8');

  it('conteos, periodo de KPIs, método y NIT con DV', () => {
    for (const clave of ['facturas_emitidas', 'facturas_con_saldo', 'facturas_vence_15', 'facturas_vencidas', "'metodo_nombre'", "v_f->>'kpi_desde'"]) {
      expect(sql).toContain(clave);
    }
    expect(sql).toMatch(/upper\(coalesce\(c\.doc_type, ''\)\) = 'NIT' and c\.dv is not null/);
  });

  it('sigue con la guarda de organización, permiso, sucursal y el revoke a anon', () => {
    expect(sql).toContain('perform public.fn_assert_acceso_org(p_org);');
    expect(sql).toContain("fn_finanzas_exigir_permiso(p_org, array['finance.view'])");
    expect(sql).toContain('public.app_branch_access(x.branch_id)');
    expect(sql).toMatch(/revoke all on function public\.fn_facturas_venta_listado\(integer, jsonb, text, integer, integer\) from public, anon;/);
    expect(sql).toContain('(i.issue_date at time zone z.tz)::date as dia_emision');
  });

  it('el rollback restaura la versión anterior (sin conteos) con su revoke', () => {
    const cuerpo = rollback.slice(rollback.indexOf('create or replace function'));
    expect(cuerpo).not.toContain('facturas_emitidas');
    expect(cuerpo).not.toContain('kpi_desde');
    expect(rollback).toContain('create or replace function public.fn_facturas_venta_listado');
    expect(rollback).toMatch(/revoke all on function public\.fn_facturas_venta_listado\(integer, jsonb, text, integer, integer\) from public, anon;/);
  });
});
