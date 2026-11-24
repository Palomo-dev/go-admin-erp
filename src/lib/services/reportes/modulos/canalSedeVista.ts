// ============================================================
// Reportes › Ventas por canal y por sede — armado puro
// ============================================================
// Figma «24 Ventas», sección 7 (aprobado por el dueño el 2026-11-24). Lo
// calcula `fn_reporte_ventas_canal_sede` con la regla única de ventas netas
// (`fn_ventas_netas_cifras`, la del Inicio y de Todas las ventas): sin IVA ni
// INC, menos devoluciones y sin propinas. La suma por canal y la suma por sede
// dan el total; lo que no tiene canal o sede va en «Sin asignar», sin repartir.
// ============================================================

import type { LecturaReporte, ReporteColumna, ReporteKPI, VistaReporte } from '../types';

export interface RespuestaCanalSede {
  ventas: number;
  devoluciones: number;
  efectivas: number;
  ticket_promedio: number;
  por_canal: { canal: string | null; ventas: number; efectivas: number }[];
  por_sede: { id: number | null; ventas: number; efectivas: number }[];
  sedes: { id: number; nombre: string }[];
}

export interface ArmadoCanalSede {
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

const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

export function aRespuestaCanalSede(data: unknown): RespuestaCanalSede {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ventas: num(d.ventas),
    devoluciones: num(d.devoluciones),
    efectivas: num(d.efectivas),
    ticket_promedio: num(d.ticket_promedio),
    por_canal: lista(d.por_canal).map((c) => ({
      canal: c.canal === null || c.canal === undefined || c.canal === '' ? null : String(c.canal),
      ventas: num(c.ventas),
      efectivas: num(c.efectivas),
    })),
    por_sede: lista(d.por_sede).map((s) => ({
      id: s.id === null || s.id === undefined ? null : num(s.id),
      ventas: num(s.ventas),
      efectivas: num(s.efectivas),
    })),
    sedes: lista(d.sedes).map((s) => ({ id: num(s.id), nombre: String(s.nombre ?? '—') })),
  };
}

/** Mismos nombres de canal que la insignia de Todas las ventas (`canalVenta.ts`). */
const NOMBRE_CANAL: Record<string, string> = {
  pos: 'POS',
  tienda_web: 'Tienda web',
  menu_qr: 'Menú QR',
  marketplace: 'Marketplace',
  manual: 'Manual',
};

export const SIN_ASIGNAR = 'Sin asignar';

export function nombreCanal(canal: string | null): string {
  if (!canal) return SIN_ASIGNAR;
  return NOMBRE_CANAL[canal] ?? canal;
}

/** Participación en %, con un decimal; 0 si el total es 0. */
export function participacion(parte: number, total: number): number {
  if (!total) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function armarCanalSede(d: RespuestaCanalSede): ArmadoCanalSede {
  const total = d.ventas;
  const nombreSede = new Map(d.sedes.map((s) => [s.id, s.nombre]));

  // Primero lo que tiene canal/sede, por ventas; «Sin asignar» siempre al final.
  const ordenar = <T extends { ventas: number }>(filas: T[], sinAsignar: (f: T) => boolean) =>
    [...filas].sort((a, b) => Number(sinAsignar(a)) - Number(sinAsignar(b)) || b.ventas - a.ventas);

  const filasCanal = ordenar(d.por_canal, (c) => !c.canal).map((c) => ({
    canal: nombreCanal(c.canal),
    cantidad: c.efectivas,
    ventas: c.ventas,
    participacion: participacion(c.ventas, total),
  }));
  const filasSede = ordenar(d.por_sede, (s) => s.id === null).map((s) => ({
    sede: s.id === null ? SIN_ASIGNAR : (nombreSede.get(s.id) ?? `Sede ${s.id}`),
    cantidad: s.efectivas,
    ventas: s.ventas,
    participacion: participacion(s.ventas, total),
  }));

  const sumaCanal = redondear(d.por_canal.reduce((s, c) => s + c.ventas, 0));
  const sumaSede = redondear(d.por_sede.reduce((s, c) => s + c.ventas, 0));

  const lectura: LecturaReporte[] = [
    {
      tono: 'info',
      texto:
        'Misma regla de «Ventas del periodo» del Inicio y de Todas las ventas: ventas sin IVA ni INC, menos devoluciones, sin propinas. ' +
        'La suma por canal y la suma por sede dan exactamente el total. Lo que no tiene canal o sede va en «Sin asignar»: no se reparte.',
      href: '/app/pos/ventas',
      etiquetaAccion: 'Ver en Todas las ventas',
    },
  ];
  // Red de seguridad: si algún día no cuadran, se dice en vez de esconderlo.
  if (Math.abs(sumaCanal - redondear(total)) > 1 || Math.abs(sumaSede - redondear(total)) > 1) {
    lectura.push({ tono: 'alerta', texto: 'La suma por canal o por sede no da el total del periodo. Avise a soporte: es un error de cálculo.' });
  }
  const sinCanal = d.por_canal.find((c) => !c.canal);
  if (sinCanal && sinCanal.efectivas) {
    lectura.push({ tono: 'aviso', texto: `${sinCanal.efectivas} ventas sin canal van en «Sin asignar». Se corrigen en cada venta, no aquí.` });
  }

  const columnasDe = (clave: 'canal' | 'sede', titulo: string): ReporteColumna[] => [
    { key: clave, titulo, tipo: 'texto' },
    { key: 'cantidad', titulo: 'Ventas', tipo: 'numero', alinear: 'right' },
    { key: 'ventas', titulo: 'Ventas netas', tipo: 'moneda', alinear: 'right' },
    { key: 'participacion', titulo: '%', tipo: 'porcentaje', alinear: 'right' },
  ];

  return {
    kpis: [
      { titulo: 'Ventas netas del periodo', valor: total, formato: 'moneda' },
      { titulo: 'N.º de ventas', valor: d.efectivas, formato: 'numero' },
      { titulo: 'Devoluciones restadas', valor: d.devoluciones ? -d.devoluciones : 0, formato: 'moneda' },
      { titulo: 'Ticket promedio', valor: d.ticket_promedio, formato: 'moneda' },
    ],
    columnas: columnasDe('canal', 'Canal'),
    filas: filasCanal,
    totales: { canal: 'Total', cantidad: d.efectivas, ventas: total, participacion: total ? 100 : 0 },
    vistaPrincipal: 'Por canal',
    vistas: [
      {
        id: 'por-sede',
        titulo: 'Por sede',
        columnas: columnasDe('sede', 'Sede'),
        filas: filasSede,
        totales: { sede: 'Total', cantidad: d.efectivas, ventas: total, participacion: total ? 100 : 0 },
      },
    ],
    lectura,
  };
}
