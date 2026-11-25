/**
 * Lógica pura del asistente «Nueva campaña de llamadas IA» (Figma CRM fila 9,
 * 1680:859620 … 1683:861470). Sin React ni red: se prueba sola.
 *
 * Contrato con la API existente (`/api/crm/voice-agents/campaigns`, sin
 * cambios): `voice_agent_id`, `name`, `objective`, `target_source` +
 * `target_config` (literales del CHECK), `schedule` (`days`, `start_hour`,
 * `end_hour`; `start_at` para el inicio programado) y los tres topes. El tipo
 * de objetivo no tiene columna: viaja en `target_config.goal` (anotación
 * 1680:860111, jsonb sin migración).
 */

export const PASOS_ASISTENTE = ['objetivo', 'audiencia', 'agente', 'horario', 'cumplimiento', 'revision'] as const;
export type PasoAsistente = (typeof PASOS_ASISTENTE)[number];

export const OBJETIVOS_CAMPANA = ['reuniones', 'calificar', 'seguimiento', 'reactivar'] as const;
export type ObjetivoCampana = (typeof OBJETIVOS_CAMPANA)[number];

/** Orden de las tarjetas de «¿A quién llamamos?» (literales del CHECK). */
export const FUENTES_AUDIENCIA = ['pipeline_stage', 'manual_list', 'segment', 'followup_due', 'sequence_step'] as const;
export type FuenteAudiencia = (typeof FUENTES_AUDIENCIA)[number];

/**
 * `segment` existe en el CHECK, pero `buildCampaignTargets` lo resuelve con
 * `campaign_contacts` (listas materializadas de campañas), no con los
 * segmentos dinámicos: elegirlo hoy daría una audiencia vacía. Se muestra
 * deshabilitado hasta que la cola lo resuelva (pendiente de la zona D).
 *
 * Revisado 2026-11-24 («Usar en campaña» desde un segmento): el resto del
 * flujo de voz tampoco lo soporta — `configAudiencia` no arma `segment_id`,
 * la vista previa (`campanaVozAudiencia`) y la revisión RNE usan el mismo
 * `buildCampaignTargets`, y el filtro del segmento solo lo resuelve el
 * materializador de WhatsApp (`whatsapp/campaignMaterialize.ts`). Para
 * habilitarlo hay que sacar ese resolutor a un servicio común y usarlo en
 * `buildCampaignTargets`; mientras tanto el asistente recibe el segmento de
 * la URL solo para avisar que no se usa (`entradaDesdeUrl`).
 */
export const FUENTES_NO_DISPONIBLES: ReadonlySet<FuenteAudiencia> = new Set(['segment']);

/** Ventana legal de la Ley 2300 de 2023 (`voiceAgent/ley2300.ts`), en horas locales. */
export const VENTANA_LEGAL = {
  semana: { desde: 7, hasta: 19 },
  sabado: { desde: 8, hasta: 15 },
} as const;

/** Días (0 = domingo … 6 = sábado). El domingo nunca se llama. */
export const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

/** Tope de intentos por cliente y día del despachador (`MAX_ATTEMPTS_PER_CUSTOMER_PER_DAY`). */
export const INTENTOS_DIA_CLIENTE = 2;

export interface FormAsistente {
  id: string | null;
  name: string;
  goal: ObjetivoCampana | null;
  instruccion: string;
  fuente: FuenteAudiencia;
  pipelineId: string | null;
  stageId: string | null;
  customerIds: string[];
  sequenceId: string | null;
  stepId: string | null;
  agenteId: string | null;
  dias: number[];
  desde: number;
  hasta: number;
  porDia: number;
  porHora: number;
  simultaneas: number;
  inicio: 'ahora' | 'programar';
  /** `YYYY-MM-DD` en la zona de la organización. */
  inicioFecha: string;
  /** Hora local de inicio (0–23). */
  inicioHora: number;
}

export const FORM_INICIAL: FormAsistente = {
  id: null,
  name: '',
  goal: null,
  instruccion: '',
  fuente: 'pipeline_stage',
  pipelineId: null,
  stageId: null,
  customerIds: [],
  sequenceId: null,
  stepId: null,
  agenteId: null,
  dias: [1, 2, 3, 4, 5, 6],
  desde: 9,
  hasta: 18,
  porDia: 200,
  porHora: 30,
  simultaneas: 3,
  inicio: 'ahora',
  inicioFecha: '',
  inicioHora: 9,
};

/** Largo máximo del nombre (el `maxLength` del campo en «Objetivo»). */
export const NOMBRE_MAX = 120;

/**
 * Lo que llega del asistente «Nueva campaña» (`rutaAsistenteVoz`:
 * `?segment=&nombre=`) cuando no se reabre un borrador: el nombre se usa tal
 * cual (recortado a `NOMBRE_MAX`); el segmento, mientras
 * `FUENTES_NO_DISPONIBLES` tenga `segment`, solo enciende el aviso del paso
 * «Audiencia» para que se elija a quién llamar.
 */
export function entradaDesdeUrl(p: { nombre: string | null; segment: string | null }): { form: FormAsistente; segmentoSinUsar: boolean } {
  const name = (p.nombre ?? '').trim().slice(0, NOMBRE_MAX);
  const segmento = (p.segment ?? '').trim();
  return { form: { ...FORM_INICIAL, name }, segmentoSinUsar: segmento.length > 0 && FUENTES_NO_DISPONIBLES.has('segment') };
}

export const LIMITES_TOPES = {
  porDia: { min: 1, max: 5000 },
  porHora: { min: 1, max: 500 },
  simultaneas: { min: 1, max: 10 },
} as const;

/** Horas que se pueden elegir como inicio y fin de la franja (dentro de la ley). */
export function horasDesde(): number[] {
  const out: number[] = [];
  for (let h = VENTANA_LEGAL.semana.desde; h < VENTANA_LEGAL.semana.hasta; h += 1) out.push(h);
  return out;
}
export function horasHasta(desde: number): number[] {
  const out: number[] = [];
  for (let h = desde + 1; h <= VENTANA_LEGAL.semana.hasta; h += 1) out.push(h);
  return out;
}

/** Franja efectiva del sábado: la propia recortada a la ventana legal (8–15). `null` = ese día no queda hora. */
export function franjaSabado(desde: number, hasta: number): { desde: number; hasta: number } | null {
  const d = Math.max(desde, VENTANA_LEGAL.sabado.desde);
  const h = Math.min(hasta, VENTANA_LEGAL.sabado.hasta);
  return d < h ? { desde: d, hasta: h } : null;
}

export function configAudiencia(f: Pick<FormAsistente, 'fuente' | 'stageId' | 'customerIds' | 'stepId'>): Record<string, unknown> | null {
  switch (f.fuente) {
    case 'pipeline_stage':
      return f.stageId ? { stage_id: f.stageId } : null;
    case 'manual_list':
      return f.customerIds.length > 0 ? { customer_ids: [...f.customerIds] } : null;
    case 'sequence_step':
      return f.stepId ? { step_id: f.stepId } : null;
    case 'followup_due':
      return {};
    default:
      return null;
  }
}

function entero(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

export type ErrorPaso =
  | 'nombre'
  | 'objetivo'
  | 'audiencia'
  | 'agente'
  | 'dias'
  | 'franja'
  | 'porDia'
  | 'porHora'
  | 'simultaneas'
  | 'politica'
  | 'inicio';

export interface ContextoValidacion {
  /** La organización tiene una URL de política de datos válida (https). */
  politicaLista: boolean;
  /** Motivos de la organización que bloquean llamar (diagnóstico). */
  bloqueosOrganizacion: number;
}

/** Errores del paso; vacío = se puede seguir. */
export function erroresPaso(paso: PasoAsistente, f: FormAsistente, ctx: ContextoValidacion): ErrorPaso[] {
  const e: ErrorPaso[] = [];
  if (paso === 'objetivo') {
    if (!f.name.trim()) e.push('nombre');
    if (!f.goal) e.push('objetivo');
  } else if (paso === 'audiencia') {
    if (!configAudiencia(f)) e.push('audiencia');
  } else if (paso === 'agente') {
    if (!f.agenteId) e.push('agente');
  } else if (paso === 'horario') {
    if (f.dias.length === 0 || f.dias.includes(0)) e.push('dias');
    if (!(f.desde >= VENTANA_LEGAL.semana.desde && f.hasta <= VENTANA_LEGAL.semana.hasta && f.desde < f.hasta)) e.push('franja');
    if (!entero(f.porDia, LIMITES_TOPES.porDia.min, LIMITES_TOPES.porDia.max)) e.push('porDia');
    if (!entero(f.porHora, LIMITES_TOPES.porHora.min, LIMITES_TOPES.porHora.max) || f.porHora > f.porDia) e.push('porHora');
    if (!entero(f.simultaneas, LIMITES_TOPES.simultaneas.min, LIMITES_TOPES.simultaneas.max)) e.push('simultaneas');
  } else if (paso === 'cumplimiento') {
    if (!ctx.politicaLista) e.push('politica');
  } else if (paso === 'revision') {
    if (f.inicio === 'programar' && !/^\d{4}-\d{2}-\d{2}$/.test(f.inicioFecha)) e.push('inicio');
  }
  return e;
}

/** Primer paso con errores antes de `hasta` (incluido); `null` si todos están listos. */
export function primerPasoIncompleto(f: FormAsistente, ctx: ContextoValidacion, hasta: PasoAsistente = 'revision'): PasoAsistente | null {
  for (const p of PASOS_ASISTENTE) {
    if (erroresPaso(p, f, ctx).length > 0) return p;
    if (p === hasta) break;
  }
  return null;
}

/** Cuerpo para POST/PATCH de `/api/crm/voice-agents/campaigns`. `startAt` = instante ISO del inicio programado. */
export function cuerpoCampana(f: FormAsistente, startAt: string | null = null): Record<string, unknown> {
  const config = configAudiencia(f) ?? {};
  const schedule: Record<string, unknown> = {
    days: [...f.dias].filter((d) => d !== 0).sort((a, b) => a - b),
    start_hour: f.desde,
    end_hour: f.hasta,
  };
  if (startAt) schedule.start_at = startAt;
  return {
    voice_agent_id: f.agenteId,
    name: f.name.trim(),
    objective: f.instruccion.trim() || undefined,
    target_source: f.fuente,
    target_config: { ...config, ...(f.goal ? { goal: f.goal } : {}) },
    schedule,
    max_calls_per_day: f.porDia,
    max_calls_per_hour: f.porHora,
    max_concurrent: f.simultaneas,
  };
}

/** Campaña tal como la devuelve la API (lo que el asistente necesita para reabrir un borrador). */
export interface CampanaGuardada {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  voice_agent_id: string;
  target_source: string;
  target_config: Record<string, unknown> | null;
  schedule: Record<string, unknown> | null;
  max_calls_per_day: number;
  max_calls_per_hour: number;
  max_concurrent: number;
}

/** Reabre un borrador guardado en el formulario (lo que no se reconoce queda con el valor inicial). */
export function formDesdeCampana(c: CampanaGuardada): FormAsistente {
  const cfg = (c.target_config ?? {}) as Record<string, unknown>;
  const sch = (c.schedule ?? {}) as Record<string, unknown>;
  const fuente = (FUENTES_AUDIENCIA as readonly string[]).includes(c.target_source) ? (c.target_source as FuenteAudiencia) : FORM_INICIAL.fuente;
  const goal = typeof cfg.goal === 'string' && (OBJETIVOS_CAMPANA as readonly string[]).includes(cfg.goal) ? (cfg.goal as ObjetivoCampana) : null;
  const dias = Array.isArray(sch.days) ? (sch.days as unknown[]).filter((d): d is number => typeof d === 'number' && d >= 1 && d <= 6) : FORM_INICIAL.dias;
  const desde = typeof sch.start_hour === 'number' ? sch.start_hour : FORM_INICIAL.desde;
  const hasta = typeof sch.end_hour === 'number' ? sch.end_hour : FORM_INICIAL.hasta;
  return {
    ...FORM_INICIAL,
    id: c.id,
    name: c.name ?? '',
    goal,
    instruccion: c.objective ?? '',
    fuente,
    stageId: typeof cfg.stage_id === 'string' ? cfg.stage_id : null,
    customerIds: Array.isArray(cfg.customer_ids) ? (cfg.customer_ids as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    stepId: typeof cfg.step_id === 'string' ? cfg.step_id : null,
    agenteId: c.voice_agent_id ?? null,
    dias: dias.length > 0 ? dias : FORM_INICIAL.dias,
    desde,
    hasta,
    porDia: c.max_calls_per_day ?? FORM_INICIAL.porDia,
    porHora: c.max_calls_per_hour ?? FORM_INICIAL.porHora,
    simultaneas: c.max_concurrent ?? FORM_INICIAL.simultaneas,
  };
}

/**
 * Minutos estimados de la campaña: llamadas × duración media del agente
 * (30 días). `null` si falta alguno de los dos datos.
 */
export function minutosEstimados(aLlamar: number | null, duracionMediaSeg: number | null): number | null {
  if (aLlamar === null || duracionMediaSeg === null || !(duracionMediaSeg > 0)) return null;
  return Math.ceil((aLlamar * duracionMediaSeg) / 60);
}

/** Días hábiles para terminar con el tope diario elegido. */
export function diasParaTerminar(aLlamar: number | null, porDia: number): number | null {
  if (aLlamar === null || aLlamar <= 0 || !(porDia > 0)) return null;
  return Math.ceil(aLlamar / porDia);
}

/** «L–V 9–18 · Sáb 9–13» a partir de las abreviaturas que da la pantalla. */
export function textoHorario(
  f: Pick<FormAsistente, 'dias' | 'desde' | 'hasta'>,
  abrev: (dia: number) => string,
  sabadoTexto: (desde: number, hasta: number) => string,
): string {
  const semana = f.dias.filter((d) => d >= 1 && d <= 5).sort((a, b) => a - b);
  const partes: string[] = [];
  if (semana.length > 0) {
    const seguidos = semana.every((d, i) => i === 0 || d === semana[i - 1] + 1);
    const dias = seguidos && semana.length > 1 ? `${abrev(semana[0])}–${abrev(semana[semana.length - 1])}` : semana.map(abrev).join(', ');
    partes.push(`${dias} ${f.desde}–${f.hasta}`);
  }
  if (f.dias.includes(6)) {
    const sab = franjaSabado(f.desde, f.hasta);
    if (sab) partes.push(sabadoTexto(sab.desde, sab.hasta));
  }
  return partes.join(' · ');
}

const URL_HTTPS = /^https:\/\/\S+$/;
export function politicaValida(url: string | null | undefined): boolean {
  return !!url && URL_HTTPS.test(url.trim());
}
