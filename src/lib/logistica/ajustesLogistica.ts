/**
 * Ajustes de Logística (Configuración › Logística, sección `logistica.general`). Puro.
 *
 * Se guardan en `organization_settings` con la clave `logistica` (una fila por organización,
 * único `(organization_id, key)`); solo los escribe `PUT /api/logistica/ajustes`, que exige
 * `organization_settings` en el servidor (la RLS de esa tabla solo pide ser miembro).
 *
 * - `horasSinMovimientoPropio` / `horasSinMovimientoTransportadora`: desde cuántas horas sin un
 *   evento un envío en curso aparece como «sin movimiento» en Seguimiento (diseño: 2 h propio,
 *   24 h transportadora).
 * - `envioGratisPorDefecto`: con qué valor nace «Envío gratis aplica en» de una zona nueva.
 *
 * Lo que NO es ajuste y por eso solo se explica en la sección: el código de entrega (siempre en
 * contraentrega propia, lo emite la base) y quién puede cambiar el cargo de domicilio (el permiso
 * «Configurar la organización», que se asigna en Roles).
 */
import { APLICA_ENVIO_GRATIS, type AplicaEnvioGratis } from './zonas';

export const CLAVE_AJUSTES_LOGISTICA = 'logistica';

export interface AjustesLogistica {
  horasSinMovimientoPropio: number;
  horasSinMovimientoTransportadora: number;
  envioGratisPorDefecto: AplicaEnvioGratis;
}

export const AJUSTES_LOGISTICA_POR_DEFECTO: AjustesLogistica = {
  horasSinMovimientoPropio: 2,
  horasSinMovimientoTransportadora: 24,
  envioGratisPorDefecto: 'web',
};

/** Límites de las horas (1 h a 7 días). */
export const HORAS_MIN = 1;
export const HORAS_MAX = 168;

function horas(v: unknown, porDefecto: number): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= HORAS_MIN && n <= HORAS_MAX ? n : porDefecto;
}

/** Lo guardado (jsonb) → ajustes completos; lo desconocido o inválido toma el valor por defecto. */
export function normalizarAjustesLogistica(valor: unknown): AjustesLogistica {
  const f = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const gratis = f.envioGratisPorDefecto;
  return {
    horasSinMovimientoPropio: horas(f.horasSinMovimientoPropio, AJUSTES_LOGISTICA_POR_DEFECTO.horasSinMovimientoPropio),
    horasSinMovimientoTransportadora: horas(f.horasSinMovimientoTransportadora, AJUSTES_LOGISTICA_POR_DEFECTO.horasSinMovimientoTransportadora),
    envioGratisPorDefecto: (APLICA_ENVIO_GRATIS as readonly unknown[]).includes(gratis) ? (gratis as AplicaEnvioGratis) : AJUSTES_LOGISTICA_POR_DEFECTO.envioGratisPorDefecto,
  };
}

export type ErrorAjustesLogistica = 'horas_invalidas' | 'envio_gratis_invalido';

/** Validación estricta de lo que llega a la ruta (no se completa nada en silencio). */
export function validarAjustesLogistica(valor: unknown): { ok: true; ajustes: AjustesLogistica } | { ok: false; error: ErrorAjustesLogistica } {
  const f = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const validas = [f.horasSinMovimientoPropio, f.horasSinMovimientoTransportadora].every(
    (n) => typeof n === 'number' && Number.isInteger(n) && n >= HORAS_MIN && n <= HORAS_MAX,
  );
  if (!validas) return { ok: false, error: 'horas_invalidas' };
  if (!(APLICA_ENVIO_GRATIS as readonly unknown[]).includes(f.envioGratisPorDefecto)) return { ok: false, error: 'envio_gratis_invalido' };
  return { ok: true, ajustes: normalizarAjustesLogistica(f) };
}

/** Umbral de «sin movimiento» de un envío según quién lo lleva. */
export function horasSinMovimiento(a: AjustesLogistica, conTransportadora: boolean): number {
  return conTransportadora ? a.horasSinMovimientoTransportadora : a.horasSinMovimientoPropio;
}
