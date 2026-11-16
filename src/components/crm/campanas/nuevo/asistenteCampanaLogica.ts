/**
 * Lógica pura del asistente «Nueva campaña» (Figma CRM 1395:1065, 1402:17,
 * 1402:821). Sin React.
 *
 * Cuatro pasos: Audiencia y canal → Agente o plantilla → Horario y
 * cumplimiento → Revisar y activar. Un solo canal por campaña (la anotación:
 * «multicanal se hace con secuencias»).
 *
 * El canal «Llamada con agente IA» no sigue aquí: su asistente propio (agente,
 * voz, topes, Ley 2300, RNE) vive en `/app/crm/campanas/voz/nueva`, y este le
 * pasa el segmento y el nombre ya elegidos.
 */

export const PASOS_ASISTENTE = ['audiencia', 'contenido', 'horario', 'revision'] as const;
export type PasoAsistente = (typeof PASOS_ASISTENTE)[number];

export type CanalAsistente = 'voice' | 'whatsapp' | 'email';
export const CANALES_ASISTENTE: readonly CanalAsistente[] = ['voice', 'whatsapp', 'email'];

/** Por qué un canal no se puede elegir (clave de `crm.campanasAsistente.canales.motivos`). */
export type MotivoCanal = 'sinAgenteVoz' | 'sinWhatsapp' | 'correoSinMotor' | 'cargando';

export interface DisponibilidadCanal {
  habilitado: boolean;
  motivo: MotivoCanal | null;
  /** El arreglo está en Configuración › CRM (la anotación 1404:830282). */
  configurable: boolean;
}

/**
 * Qué canales se pueden usar:
 *  - voz: hace falta al menos un agente de voz (y con él, la telefonía);
 *  - WhatsApp: un número conectado y activo;
 *  - correo: el motor de campañas (`campaignBatch`) todavía envía solo por
 *    WhatsApp; hasta que mande correo, el canal se muestra pero no se elige.
 */
export function disponibilidadCanales(d: {
  agentesVoz: number | null;
  canalesWhatsappActivos: number | null;
}): Record<CanalAsistente, DisponibilidadCanal> {
  const cargando: DisponibilidadCanal = { habilitado: false, motivo: 'cargando', configurable: false };
  return {
    voice:
      d.agentesVoz === null
        ? cargando
        : d.agentesVoz > 0
          ? { habilitado: true, motivo: null, configurable: false }
          : { habilitado: false, motivo: 'sinAgenteVoz', configurable: true },
    whatsapp:
      d.canalesWhatsappActivos === null
        ? cargando
        : d.canalesWhatsappActivos > 0
          ? { habilitado: true, motivo: null, configurable: false }
          : { habilitado: false, motivo: 'sinWhatsapp', configurable: true },
    email: { habilitado: false, motivo: 'correoSinMotor', configurable: false },
  };
}

/** Ruta del asistente de voz con lo ya elegido en el paso 1. */
export function rutaAsistenteVoz(p: { segmentId: string | null; nombre: string }): string {
  const q = new URLSearchParams();
  if (p.segmentId) q.set('segment', p.segmentId);
  if (p.nombre.trim()) q.set('nombre', p.nombre.trim());
  const s = q.toString();
  return `/app/crm/campanas/voz/nueva${s ? `?${s}` : ''}`;
}

export interface EstadoPasoAudiencia {
  nombre: string;
  segmentId: string | null;
  canal: CanalAsistente | null;
}

export function audienciaCompleta(e: EstadoPasoAudiencia, disp: Record<CanalAsistente, DisponibilidadCanal>): boolean {
  return e.nombre.trim().length > 0 && !!e.segmentId && !!e.canal && disp[e.canal].habilitado;
}

export interface EstadoPlantilla {
  canalId: string | null;
  plantillaId: string | null;
  /** Estado en Meta que devolvió la vista previa (`APPROVED`…). */
  estadoMeta: string | null;
  variablesFaltantes: readonly string[];
}

export function plantillaCompleta(e: EstadoPlantilla): boolean {
  return !!e.canalId && !!e.plantillaId && e.estadoMeta === 'APPROVED';
}

/** Requisitos para ACTIVAR (paso 3, columna derecha). Se puede guardar sin cumplirlos. */
export type ClaveRequisito = 'plantillaAprobada' | 'variables' | 'consentimiento' | 'audiencia';
export interface Requisito {
  clave: ClaveRequisito;
  ok: boolean;
}

export function requisitosActivar(p: {
  plantillaAprobada: boolean;
  variablesFaltantes: number;
  marketing: boolean;
  consentimiento: boolean;
  /** `null` = aún sin calcular. */
  pendientes: number | null;
}): Requisito[] {
  const lista: Requisito[] = [
    { clave: 'plantillaAprobada', ok: p.plantillaAprobada },
    { clave: 'variables', ok: p.variablesFaltantes === 0 },
  ];
  if (p.marketing) lista.push({ clave: 'consentimiento', ok: p.consentimiento });
  lista.push({ clave: 'audiencia', ok: (p.pendientes ?? 0) > 0 });
  return lista;
}

export function requisitosEnRojo(r: readonly Requisito[]): number {
  return r.filter((x) => !x.ok).length;
}

/**
 * «AAAA-MM-DDTHH:mm» de un `<input type="datetime-local">` → fecha y hora de
 * pared por separado, para convertirlas con la zona de la ORGANIZACIÓN
 * (`toInstant`), no con la del navegador.
 */
export function partirFechaHoraLocal(v: string): { fecha: string; hora: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(v);
  return m ? { fecha: m[1], hora: m[2] } : null;
}
