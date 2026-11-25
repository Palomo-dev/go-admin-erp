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
 * - `codigoEntregaContraentrega`: si la contraentrega propia pide el código de 4 dígitos (Figma
 *   22 › 10, 2933:9477). Lo lee la base (`fn_logistica_pide_codigo_entrega`, migración
 *   20261123213000) al crear o cambiar el envío; encendido por defecto.
 *
 * - `bloqueoDocumentosAsignacion` (Logística 1b, decisión 6 del dueño): si SOAT, tecnomecánica o
 *   licencia vencidos BLOQUEAN la asignación de un domicilio propio (con excepción del supervisor y
 *   su PIN de Recursos humanos). Apagado por defecto = solo avisa. Lo lee la base
 *   (`fn_logistica_bloqueo_documentos`, migración 20261125044314); aunque esté encendido, mientras
 *   ningún autorizador tenga PIN, la base solo avisa.
 *
 * Lo que NO es ajuste y por eso solo se explica en la sección: quién puede cambiar el cargo de
 * domicilio (el permiso «Configurar la organización», que se asigna en Roles).
 */
import { APLICA_ENVIO_GRATIS, type AplicaEnvioGratis } from './zonas';

export const CLAVE_AJUSTES_LOGISTICA = 'logistica';

export interface AjustesLogistica {
  horasSinMovimientoPropio: number;
  horasSinMovimientoTransportadora: number;
  envioGratisPorDefecto: AplicaEnvioGratis;
  codigoEntregaContraentrega: boolean;
  bloqueoDocumentosAsignacion: boolean;
}

export const AJUSTES_LOGISTICA_POR_DEFECTO: AjustesLogistica = {
  horasSinMovimientoPropio: 2,
  horasSinMovimientoTransportadora: 24,
  envioGratisPorDefecto: 'web',
  codigoEntregaContraentrega: true,
  bloqueoDocumentosAsignacion: false,
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
    // Solo un `false` explícito lo apaga (la base usa el mismo criterio).
    codigoEntregaContraentrega: f.codigoEntregaContraentrega !== false,
    // Solo un `true` explícito lo enciende (la base usa el mismo criterio).
    bloqueoDocumentosAsignacion: f.bloqueoDocumentosAsignacion === true,
  };
}

export type ErrorAjustesLogistica = 'horas_invalidas' | 'envio_gratis_invalido' | 'codigo_entrega_invalido' | 'bloqueo_documentos_invalido';

/** Validación estricta de lo que llega a la ruta (no se completa nada en silencio). */
export function validarAjustesLogistica(valor: unknown): { ok: true; ajustes: AjustesLogistica } | { ok: false; error: ErrorAjustesLogistica } {
  const f = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const validas = [f.horasSinMovimientoPropio, f.horasSinMovimientoTransportadora].every(
    (n) => typeof n === 'number' && Number.isInteger(n) && n >= HORAS_MIN && n <= HORAS_MAX,
  );
  if (!validas) return { ok: false, error: 'horas_invalidas' };
  if (!(APLICA_ENVIO_GRATIS as readonly unknown[]).includes(f.envioGratisPorDefecto)) return { ok: false, error: 'envio_gratis_invalido' };
  // Opcional por compatibilidad (pantallas abiertas antes del ajuste); si viene, booleano.
  if (f.codigoEntregaContraentrega !== undefined && typeof f.codigoEntregaContraentrega !== 'boolean') return { ok: false, error: 'codigo_entrega_invalido' };
  if (f.bloqueoDocumentosAsignacion !== undefined && typeof f.bloqueoDocumentosAsignacion !== 'boolean') return { ok: false, error: 'bloqueo_documentos_invalido' };
  return { ok: true, ajustes: normalizarAjustesLogistica(f) };
}

/** Umbral de «sin movimiento» de un envío según quién lo lleva. */
export function horasSinMovimiento(a: AjustesLogistica, conTransportadora: boolean): number {
  return conTransportadora ? a.horasSinMovimientoTransportadora : a.horasSinMovimientoPropio;
}
