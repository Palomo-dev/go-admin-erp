/**
 * Transporte › Boletos › Pasajes (Fase 2, Figma «23 Transporte» › 8 y 16; componente
 * PlanoPuestos 2896:10785). Puro: plantillas de planos, la cuadrícula del plano, plazos de
 * cambio y anulación y la lectura de lo que devuelven las RPC (migración 20261124001000).
 *
 * Las reglas de verdad están en la base (retención por canal, plazos y reembolso con los ajustes
 * de Configuración › Transporte); aquí se calculan solo para anticiparlas en pantalla.
 */

export type TipoCelda = 'puesto' | 'conductor' | 'puerta' | 'bano' | 'pasillo' | 'vacio';

export interface CeldaPlano {
  fila: number;
  col: number;
  tipo: TipoCelda;
  etiqueta?: string;
  ventana?: boolean;
}

export interface PlanoDibujo {
  kind: 'bus' | 'minibus' | 'boat' | 'yacht' | 'other';
  rows: number;
  cols: number;
  layout: CeldaPlano[];
}

export const PLANTILLAS = ['bus40', 'buseta19', 'lancha24', 'yate12'] as const;
export type Plantilla = (typeof PLANTILLAS)[number];

/**
 * Dibuja un plano de puestos numerados por filas, de izquierda a derecha.
 * `lados` son los puestos a cada lado del pasillo ([2, 2] = bus 2+2). La fila 1 lleva el conductor
 * (o el timón) a la izquierda y la puerta a la derecha.
 */
export function dibujarPlano(kind: PlanoDibujo['kind'], filas: number, lados: readonly [number, number], extra = 0): PlanoDibujo {
  const [izq, der] = lados;
  const cols = izq + 1 + der;
  const layout: CeldaPlano[] = [
    { fila: 1, col: 1, tipo: 'conductor' },
    { fila: 1, col: cols, tipo: 'puerta' },
  ];
  let n = 1;
  for (let f = 2; f <= filas + 1; f += 1) {
    for (let c = 1; c <= cols; c += 1) {
      if (c === izq + 1) {
        layout.push({ fila: f, col: c, tipo: 'pasillo' });
        continue;
      }
      layout.push({ fila: f, col: c, tipo: 'puesto', etiqueta: String(n), ventana: c === 1 || c === cols });
      n += 1;
    }
  }
  // Puestos de la última fila (p. ej. la fila trasera de 5 de una buseta).
  for (let i = 0; i < extra; i += 1) {
    layout.push({ fila: filas + 2, col: i + 1, tipo: 'puesto', etiqueta: String(n), ventana: i === 0 || i === extra - 1 });
    n += 1;
  }
  return { kind, rows: filas + 1 + (extra > 0 ? 1 : 0), cols, layout };
}

export function plantilla(p: Plantilla): PlanoDibujo {
  switch (p) {
    case 'bus40':
      return dibujarPlano('bus', 10, [2, 2]);
    case 'buseta19':
      return dibujarPlano('minibus', 5, [2, 1], 4);
    case 'lancha24':
      return dibujarPlano('boat', 6, [2, 2]);
    case 'yate12':
      return dibujarPlano('yacht', 4, [2, 1]);
  }
}

export function puestosDe(p: PlanoDibujo): number {
  return p.layout.filter((c) => c.tipo === 'puesto').length;
}

export type EstadoPuesto = 'available' | 'reserved' | 'sold' | 'blocked' | 'vencido';

/** Fila de `fn_transporte_puestos_viaje`. */
export interface PuestoViaje {
  etiqueta: string;
  fila: number;
  col: number;
  estado: EstadoPuesto;
  retenidoHasta: string | null;
  mio: boolean;
  canal: string | null;
  ventana: boolean;
  boleto: string | null;
}

const ESTADOS: readonly string[] = ['available', 'reserved', 'sold', 'blocked', 'vencido'];

export function leerPuestos(valor: unknown): PuestoViaje[] {
  return (Array.isArray(valor) ? valor : [])
    .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
    .filter((x) => typeof x.etiqueta === 'string')
    .map((x) => ({
      etiqueta: x.etiqueta as string,
      fila: Number(x.fila) || 1,
      col: Number(x.col) || 1,
      estado: (ESTADOS.includes(x.estado as string) ? x.estado : 'blocked') as EstadoPuesto,
      retenidoHasta: typeof x.retenido_hasta === 'string' ? x.retenido_hasta : null,
      mio: x.mio === true,
      canal: typeof x.canal === 'string' ? x.canal : null,
      ventana: x.ventana === true,
      boleto: typeof x.boleto === 'string' ? x.boleto : null,
    }));
}

/** Cómo se pinta un puesto: el elegido por quien vende manda sobre su estado. */
export type VistaPuesto = 'libre' | 'seleccionado' | 'vendido' | 'retenido' | 'bloqueado';

export function vistaPuesto(p: PuestoViaje, seleccionado: string | null): VistaPuesto {
  if (seleccionado === p.etiqueta) return 'seleccionado';
  if (p.estado === 'available' || p.estado === 'vencido') return 'libre';
  if (p.estado === 'sold') return 'vendido';
  if (p.estado === 'reserved') return p.mio ? 'seleccionado' : 'retenido';
  return 'bloqueado';
}

export function resumenPuestos(puestos: readonly PuestoViaje[]): { total: number; vendidos: number; retenidos: number; libres: number } {
  const vendidos = puestos.filter((p) => p.estado === 'sold').length;
  const retenidos = puestos.filter((p) => p.estado === 'reserved').length;
  const libres = puestos.filter((p) => p.estado === 'available' || p.estado === 'vencido').length;
  return { total: puestos.length, vendidos, retenidos, libres };
}

/** Columnas del plano con pasillo: las que no tienen ningún puesto en todo el viaje. */
export function columnasPlano(puestos: readonly Pick<PuestoViaje, 'col'>[]): { cols: number; pasillos: number[] } {
  const cols = puestos.reduce((m, p) => Math.max(m, p.col), 0);
  const usadas = new Set(puestos.map((p) => p.col));
  const pasillos: number[] = [];
  for (let c = 1; c <= cols; c += 1) if (!usadas.has(c)) pasillos.push(c);
  return { cols, pasillos };
}

/** Segundos que le quedan a una retención (0 si ya venció). */
export function segundosRestantes(hasta: string | null, ahora: Date): number {
  if (!hasta) return 0;
  return Math.max(0, Math.floor((new Date(hasta).getTime() - ahora.getTime()) / 1000));
}

export function formatoCuenta(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** ¿El cambio es sin costo? (hasta `minutos` antes de la salida, como la base). */
export function cambioSinCosto(salida: string, ahora: Date, minutos: number): boolean {
  return ahora.getTime() <= new Date(salida).getTime() - minutos * 60_000;
}

/** Reembolso al anular: % del total si es a tiempo y estaba pagado (redondeo a centavos, como la base). */
export function reembolsoAlAnular(opciones: { salida: string; ahora: Date; horas: number; porcentaje: number; total: number; pagado: boolean }): { aTiempo: boolean; reembolso: number } {
  const aTiempo = opciones.ahora.getTime() <= new Date(opciones.salida).getTime() - opciones.horas * 3_600_000;
  const reembolso = aTiempo && opciones.pagado ? Math.round(opciones.total * Math.min(Math.max(opciones.porcentaje, 0), 100)) / 100 : 0;
  return { aTiempo, reembolso };
}

export type EstadoRespuesta =
  | 'retenido'
  | 'ocupado'
  | 'viaje_cerrado'
  | 'emitido'
  | 'datos_invalidos'
  | 'cambiado'
  | 'no_cambiable'
  | 'fuera_de_plazo'
  | 'anulado'
  | 'no_anulable'
  | 'motivo_invalido';

export interface RespuestaPasaje {
  estado: EstadoRespuesta | 'error';
  hasta?: string;
  minutos?: number;
  boleto?: string;
  numero?: string;
  sinCosto?: boolean;
  reembolso?: number;
  aTiempo?: boolean;
}

export function leerRespuesta(valor: unknown): RespuestaPasaje {
  const f = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const estados: readonly string[] = ['retenido', 'ocupado', 'viaje_cerrado', 'emitido', 'datos_invalidos', 'cambiado', 'no_cambiable', 'fuera_de_plazo', 'anulado', 'no_anulable', 'motivo_invalido'];
  return {
    estado: estados.includes(f.estado as string) ? (f.estado as EstadoRespuesta) : 'error',
    hasta: typeof f.hasta === 'string' ? f.hasta : undefined,
    minutos: typeof f.minutos === 'number' ? f.minutos : undefined,
    boleto: typeof f.boleto === 'string' ? f.boleto : undefined,
    numero: typeof f.numero === 'string' ? f.numero : undefined,
    sinCosto: typeof f.sin_costo === 'boolean' ? f.sin_costo : undefined,
    reembolso: f.reembolso !== undefined ? Number(f.reembolso) || 0 : undefined,
    aTiempo: typeof f.a_tiempo === 'boolean' ? f.a_tiempo : undefined,
  };
}
