// ============================================================
// Reportes › Impuestos (IVA, INC y retenciones) — armado puro
// ============================================================
// Figma «24 Ventas», sección 7 (aprobado por el dueño el 2026-11-24). Lo
// calcula `fn_reporte_impuestos` (migración 20261124120000); aquí solo se
// arman KPI, tabla, pestaña y lectura:
//   · IVA e INC por separado y NETOS (facturas − notas crédito y devoluciones).
//   · Las retenciones que nos practicaron van aparte: no se restan.
//   · Informativo: lo que se paga sale de la declaración (Centro tributario).
// ============================================================

import type { LecturaReporte, ReporteColumna, ReporteKPI, VistaReporte } from '../types';

export interface ImpuestoNeto {
  ventas: number;
  devoluciones: number;
  neto: number;
}

export interface FilaTarifa {
  clase: 'IVA' | 'INC' | 'EXENTO' | 'SIN_DETALLE' | string;
  tarifa: number | null;
  base: number;
  ventas: number;
  devoluciones: number;
  neto: number;
}

export interface RetencionesAFavor {
  retefuente: number;
  reteiva: number;
  reteica: number;
  otras: number;
  total: number;
  asientos: number;
}

export interface RespuestaImpuestos {
  iva: ImpuestoNeto;
  inc: ImpuestoNeto;
  sin_detalle: number;
  por_tarifa: FilaTarifa[];
  retenciones: RetencionesAFavor;
  iva_descontable: number;
  compras: number;
  saldo_iva_estimado: number;
}

export interface ArmadoImpuestos {
  kpis: ReporteKPI[];
  columnas: ReporteColumna[];
  filas: Record<string, unknown>[];
  totales: Record<string, unknown>;
  vistaPrincipal: string;
  vistas: VistaReporte[];
  lectura: LecturaReporte[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function neto(v: unknown): ImpuestoNeto {
  const o = (v ?? {}) as Record<string, unknown>;
  return { ventas: num(o.ventas), devoluciones: num(o.devoluciones), neto: num(o.neto) };
}

/** Normaliza la respuesta de la RPC (números que llegan como texto, claves ausentes). */
export function aRespuestaImpuestos(data: unknown): RespuestaImpuestos {
  const d = (data ?? {}) as Record<string, unknown>;
  const r = (d.retenciones ?? {}) as Record<string, unknown>;
  return {
    iva: neto(d.iva),
    inc: neto(d.inc),
    sin_detalle: num(d.sin_detalle),
    por_tarifa: (Array.isArray(d.por_tarifa) ? d.por_tarifa : []).map((f: Record<string, unknown>) => ({
      clase: String(f.clase ?? ''),
      tarifa: f.tarifa === null || f.tarifa === undefined ? null : num(f.tarifa),
      base: num(f.base),
      ventas: num(f.ventas),
      devoluciones: num(f.devoluciones),
      neto: num(f.neto),
    })),
    retenciones: {
      retefuente: num(r.retefuente),
      reteiva: num(r.reteiva),
      reteica: num(r.reteica),
      otras: num(r.otras),
      total: num(r.total),
      asientos: num(r.asientos),
    },
    iva_descontable: num(d.iva_descontable),
    compras: num(d.compras),
    saldo_iva_estimado: num(d.saldo_iva_estimado),
  };
}

/** «19 %», «0,5 %»: la tarifa con coma decimal y sin ceros sobrantes. */
export function textoTarifa(tarifa: number): string {
  return `${String(Math.round(tarifa * 100) / 100).replace('.', ',')} %`;
}

/** Nombre del renglón: «IVA 19 %», «INC 8 %», «Exento y excluido», «Sin detalle de tarifa». */
export function nombreRenglon(f: Pick<FilaTarifa, 'clase' | 'tarifa'>): string {
  if (f.clase === 'EXENTO') return 'Exento y excluido';
  if (f.clase === 'SIN_DETALLE') return 'Sin detalle de tarifa';
  return f.tarifa === null ? f.clase : `${f.clase} ${textoTarifa(f.tarifa)}`;
}

const CENTRO_TRIBUTARIO = '/app/finanzas/tributario';

export function armarReporteImpuestos(d: RespuestaImpuestos): ArmadoImpuestos {
  const r = d.retenciones;

  const kpis: ReporteKPI[] = [
    { titulo: 'IVA generado neto', valor: d.iva.neto, formato: 'moneda' },
    { titulo: 'INC generado neto', valor: d.inc.neto, formato: 'moneda' },
    { titulo: 'IVA de las compras', valor: d.iva_descontable, formato: 'moneda' },
    { titulo: 'Retenciones que nos practicaron', valor: r.total, formato: 'moneda' },
    { titulo: 'Saldo estimado del IVA', valor: d.saldo_iva_estimado, formato: 'moneda' },
  ];

  // Las devoluciones restan: se muestran en negativo, como en el Figma («− $ 180.500»).
  const filas = d.por_tarifa.map((f) => ({
    impuesto: nombreRenglon(f),
    base: f.base,
    ventas: f.ventas,
    devoluciones: f.devoluciones ? -f.devoluciones : 0,
    neto: f.neto,
  }));
  const suma = (k: 'base' | 'ventas' | 'devoluciones' | 'neto') => Math.round(d.por_tarifa.reduce((s, f) => s + f[k], 0) * 100) / 100;
  const totales = {
    impuesto: 'Total',
    base: suma('base'),
    ventas: suma('ventas'),
    devoluciones: suma('devoluciones') ? -suma('devoluciones') : 0,
    neto: suma('neto'),
  };

  const filasRetenciones = [
    { tipo: 'Retefuente', cuenta: '135515', retenido: r.retefuente },
    { tipo: 'ReteIVA', cuenta: '135517', retenido: r.reteiva },
    { tipo: 'ReteICA', cuenta: '135518', retenido: r.reteica },
    ...(r.otras ? [{ tipo: 'Otras retenciones', cuenta: '1355', retenido: r.otras }] : []),
  ];

  const lectura: LecturaReporte[] = [
    {
      tono: 'info',
      texto:
        'Informativo: no es lo que se paga. El valor a pagar sale de la declaración, después de restar el IVA de las compras. ' +
        'Generado = lo de las facturas del periodo menos lo de las devoluciones y notas crédito. Las propinas no llevan IVA ni INC y no se suman.',
      href: CENTRO_TRIBUTARIO,
      etiquetaAccion: 'Ir al Centro tributario',
    },
    {
      tono: 'info',
      texto: 'Saldo estimado del IVA = IVA generado neto − IVA de las compras. El INC no se descuenta con el IVA de las compras, y las retenciones que nos practicaron van aparte.',
    },
  ];
  if (d.sin_detalle) {
    lectura.push({
      tono: 'aviso',
      texto: 'Hay documentos con impuesto y sin líneas que digan su tarifa: ese impuesto va en «Sin detalle de tarifa» y no se reparte entre IVA e INC.',
    });
  }
  if (!r.asientos) {
    lectura.push({
      tono: 'info',
      texto: 'No hay retenciones que nos practicaran registradas en contabilidad en el periodo (cuentas 1355).',
    });
  }

  return {
    kpis,
    columnas: [
      { key: 'impuesto', titulo: 'Impuesto', tipo: 'texto' },
      { key: 'base', titulo: 'Base', tipo: 'moneda', alinear: 'right' },
      { key: 'ventas', titulo: 'En ventas', tipo: 'moneda', alinear: 'right' },
      { key: 'devoluciones', titulo: 'Devoluciones', tipo: 'moneda', alinear: 'right' },
      { key: 'neto', titulo: 'Neto', tipo: 'moneda', alinear: 'right' },
    ],
    filas,
    totales,
    vistaPrincipal: 'IVA e INC por tarifa',
    vistas: [
      {
        id: 'retenciones',
        titulo: 'Retenciones que nos practicaron',
        columnas: [
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
          { key: 'retenido', titulo: 'Retenido', tipo: 'moneda', alinear: 'right' },
        ],
        filas: filasRetenciones,
        totales: { tipo: 'Total', retenido: r.total },
      },
    ],
    lectura,
  };
}
