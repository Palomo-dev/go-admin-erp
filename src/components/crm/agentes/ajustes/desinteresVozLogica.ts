/**
 * Estado del formulario «Cuando el cliente no tiene interés» (Agentes IA ›
 * Ajustes). Sin React. Figma: `VozDesinteres/Configuración` (vacío ·
 * excepción activa · error de validación · solo lectura · móvil).
 *
 * Las reglas de validación son las mismas del servidor
 * (`configDesinteresSchema`): el cliente avisa antes, el servidor decide.
 */
import type { ConfigDesinteres, ModoDesinteres } from '@/lib/services/crm/voiceAgent/desinteresConfig';

export interface EtapaOpcion {
  id: string;
  nombre: string;
  pipelineId: string;
  pipelineNombre: string;
  orden: number;
  total: number;
}

export interface VistaDesinteres {
  config: ConfigDesinteres;
  puedeEditar: boolean;
  monedaBase: string;
  monedas: string[];
  etapas: EtapaOpcion[];
}

export interface BorradorDesinteres {
  modo: ModoDesinteres;
  valorActiva: boolean;
  monto: number | null;
  moneda: string | null;
  etapaActiva: boolean;
  etapaId: string | null;
}

export type ErrorCampo = 'monto_requerido' | 'monto_negativo' | 'moneda_requerida' | 'moneda_invalida' | 'etapa_requerida' | 'etapa_invalida';

export interface ErroresBorrador {
  monto?: ErrorCampo;
  moneda?: ErrorCampo;
  etapa?: ErrorCampo;
}

export function borradorDesde(config: ConfigDesinteres, monedaBase: string): BorradorDesinteres {
  return {
    modo: config.modo,
    valorActiva: config.excepcionValor.activa,
    monto: config.excepcionValor.monto,
    moneda: config.excepcionValor.moneda ?? monedaBase,
    etapaActiva: config.excepcionEtapa.activa,
    etapaId: config.excepcionEtapa.etapaId,
  };
}

export function validarBorrador(b: BorradorDesinteres, monedas: readonly string[]): ErroresBorrador {
  const e: ErroresBorrador = {};
  if (b.valorActiva) {
    if (b.monto === null || !Number.isFinite(b.monto)) e.monto = 'monto_requerido';
    else if (b.monto < 0) e.monto = 'monto_negativo';
    if (!b.moneda) e.moneda = 'moneda_requerida';
    else if (!/^[A-Z]{3}$/.test(b.moneda) || (monedas.length > 0 && !monedas.includes(b.moneda))) e.moneda = 'moneda_invalida';
  }
  if (b.etapaActiva && !b.etapaId) e.etapa = 'etapa_requerida';
  return e;
}

export function hayErrores(e: ErroresBorrador): boolean {
  return Boolean(e.monto || e.moneda || e.etapa);
}

/** Cuerpo de `PUT /api/crm/voice-agents/desinteres` (sin organización: sale de la sesión). */
export function cuerpoDesde(b: BorradorDesinteres) {
  return {
    modo: b.modo,
    excepcionValor: { activa: b.valorActiva, monto: b.monto, moneda: b.moneda },
    excepcionEtapa: { activa: b.etapaActiva, etapaId: b.etapaId },
  };
}

export function mismoBorrador(a: BorradorDesinteres, b: BorradorDesinteres): boolean {
  return JSON.stringify(cuerpoDesde(a)) === JSON.stringify(cuerpoDesde(b));
}

/** Errores de campo que devuelve el servidor (400 con `details` de zod o `campo`). */
export function erroresDesdeServidor(json: unknown): ErroresBorrador {
  const e: ErroresBorrador = {};
  const j = (json ?? {}) as { code?: string; campo?: string; details?: { fieldErrors?: Record<string, string[] | undefined> } };
  const codigos = Object.values(j.details?.fieldErrors ?? {}).flat().filter((c): c is string => typeof c === 'string');
  if (j.code) codigos.push(j.code);
  for (const c of codigos) {
    if (c === 'monto_requerido' || c === 'monto_negativo') e.monto = c;
    else if (c === 'moneda_requerida' || c === 'moneda_invalida') e.moneda = c;
    else if (c === 'etapa_requerida' || c === 'etapa_invalida') e.etapa = c;
  }
  return e;
}

