/**
 * Lógica de `WinDialog` (Figma 761:23994): un solo camino para ganar desde
 * lista, tablero, drawer y detalle. Sin React.
 *
 * Paso 1 «Ficha de venta» (monto, moneda, fecha de cierre, motivo de
 * ganancia, comisión y notas) → paso 2 «Qué hacer al ganar» → resumen con los
 * documentos creados. Siempre guarda `win_data` y mueve a la etapa ganadora:
 * el cuerpo es el de `POST /api/crm/opportunities/[id]/win` (ola 1,
 * `won_data` no vacío). `win_data` es jsonb libre: se **fusiona** con el que
 * ya tenía la oportunidad (la ficha de onboarding de `ClosedWonDialog`), nunca
 * lo reemplaza. La comisión la registra el sistema al ganar: no es una casilla.
 */
import { parsearMonto } from './camposCrm';

export type PasoGanar = 'ficha' | 'acciones' | 'resumen';

/**
 * Pasos, en orden (Figma 1787:900392 «Ganar · qué hacer al ganar, derivado de
 * las líneas»): factura y su emisión, membresía, reserva, cupo de clase y cita
 * salen de las líneas; onboarding y renovación siguen como antes. Se retiró
 * «Registrar la venta en el POS»: la venta ligada la crea la factura.
 */
export const ACCIONES_GANAR = ['factura', 'emitir', 'membresia', 'reserva', 'cupo', 'cita', 'onboarding', 'renovacion', 'referido', 'agradecimiento'] as const;
export type AccionGanar = (typeof ACCIONES_GANAR)[number];

/** Sin líneas que derivar: factura, onboarding y renovación. */
export const ACCIONES_POR_DEFECTO: readonly AccionGanar[] = ['factura', 'onboarding', 'renovacion'];

/** Un paso que muestra el diálogo: qué hará y con qué RPC (texto técnico plegable). */
export interface PasoGanarVista {
  accion: AccionGanar;
  titulo: string;
  detalle: string;
  tecnico?: string;
  /** «Emitir la factura ahora»: interruptor sobre fondo suave. */
  interruptor?: boolean;
  /** Solo se puede elegir si `requiere` está elegido (emitir → factura). */
  requiere?: AccionGanar;
  /** Marcado al abrir. */
  marcado?: boolean;
}

/** Acciones marcadas al abrir con pasos derivados. */
export function accionesIniciales(pasos: readonly PasoGanarVista[] | null | undefined): AccionGanar[] {
  if (!pasos || pasos.length === 0) return [...ACCIONES_POR_DEFECTO];
  return ACCIONES_GANAR.filter((a) => pasos.some((p) => p.accion === a && p.marcado !== false));
}

/** Pasos elegidos que sí se ejecutan: un paso que requiere otro sin elegir no cuenta. */
export function accionesEfectivas(acciones: readonly AccionGanar[], pasos: readonly PasoGanarVista[] | null | undefined): AccionGanar[] {
  if (!pasos || pasos.length === 0) return [...acciones];
  // Transitivo: membresía requiere emitir, que requiere factura.
  let actuales = acciones.filter((a) => pasos.some((x) => x.accion === a));
  for (;;) {
    const siguientes = actuales.filter((a) => {
      const p = pasos.find((x) => x.accion === a);
      return !p?.requiere || actuales.includes(p.requiere);
    });
    if (siguientes.length === actuales.length) return siguientes;
    actuales = siguientes;
  }
}

export interface ValoresGanar {
  monto: string;
  moneda: string;
  /** `date` de cierre. */
  fechaCierre: string;
  motivoId: string;
  notas: string;
  acciones: AccionGanar[];
}

export function valoresInicialesGanar(op: { amount: number | string | null; currency: string | null }, monedaBase: string, hoy: string, acciones?: readonly AccionGanar[]): ValoresGanar {
  const monto = op.amount === null || op.amount === '' ? '' : String(op.amount);
  return { monto, moneda: op.currency || monedaBase, fechaCierre: hoy, motivoId: '', notas: '', acciones: [...(acciones ?? ACCIONES_POR_DEFECTO)] };
}

export function validarGanar(v: ValoresGanar, hoy: string): Partial<Record<'monto' | 'fechaCierre', 'obligatorio' | 'montoInvalido' | 'fechaFutura'>> {
  const e: Partial<Record<'monto' | 'fechaCierre', 'obligatorio' | 'montoInvalido' | 'fechaFutura'>> = {};
  const n = parsearMonto(v.monto);
  if (n === null) e.monto = 'obligatorio';
  else if (Number.isNaN(n) || n < 0) e.monto = 'montoInvalido';
  if (!v.fechaCierre) e.fechaCierre = 'obligatorio';
  else if (v.fechaCierre > hoy) e.fechaCierre = 'fechaFutura';
  return e;
}

export function alternarAccion(acciones: readonly AccionGanar[], accion: AccionGanar): AccionGanar[] {
  return acciones.includes(accion) ? acciones.filter((a) => a !== accion) : ACCIONES_GANAR.filter((a) => a === accion || acciones.includes(a));
}

/** Cuerpo de `…/win`: `won_data` fusionado con el anterior. */
export function cuerpoGanar(v: ValoresGanar, anterior: Record<string, unknown> | null | undefined, stageId?: string) {
  const n = parsearMonto(v.monto);
  return {
    won_data: {
      ...(anterior ?? {}),
      amount: n !== null && !Number.isNaN(n) ? n : null,
      currency: v.moneda.toUpperCase(),
      closed_on: v.fechaCierre,
      win_reason_id: v.motivoId || null,
      notes: v.notas.trim() || null,
      actions: v.acciones,
    },
    ...(stageId ? { stage_id: stageId } : {}),
  };
}

/** Documento creado al ganar (resumen). */
export interface DocumentoCreado {
  tipo: 'factura' | 'cotizacion' | 'onboarding' | 'renovacion' | 'otro';
  numero: string;
  href?: string | null;
  /** `creado` (por defecto), `omitido` (no hizo falta o ya existía) o `error` (el paso falló). */
  estado?: 'creado' | 'omitido' | 'error';
}

/** Cuántos documentos nuevos y cuántos pasos fallaron, para el resumen. */
export function conteoResumen(docs: readonly DocumentoCreado[]): { creados: number; fallidos: number } {
  return {
    creados: docs.filter((d) => (d.estado ?? 'creado') === 'creado').length,
    fallidos: docs.filter((d) => d.estado === 'error').length,
  };
}

/** La factura del resumen, si se creó («Ver factura»). */
export function facturaCreada(docs: readonly DocumentoCreado[]): DocumentoCreado | null {
  return docs.find((d) => d.tipo === 'factura') ?? null;
}
