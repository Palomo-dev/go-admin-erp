/**
 * Reglas puras del análisis de llamadas (sin SDKs ni Supabase; testeables):
 *  - validación de `suggested_stage_id` contra el pipeline real de la oportunidad,
 *  - mapeo de objeciones al catálogo `objections` de la org (id o similitud simple),
 *  - normalización de prioridades/estado de `tasks` a los CHECK reales,
 *  - construcción de filas de `tasks` y de `opportunity_objections`,
 *  - enmascarado de datos sensibles antes de enviar la transcripción al LLM.
 *
 * REGLA (ronda 2, hallazgo 1 del tester; ampliada en la ronda 3 tras el nº 5):
 * ningún literal de columna con CHECK se escribe suelto EN NINGÚN archivo de F4.
 * Los valores válidos viven en `@/lib/crm/enums` cuando existen allí y, si no, en
 * las constantes `*_VALUES` de este archivo, que llevan al lado el CHECK real
 * verificado con `pg_constraint`. `assertDbEnum` falla en desarrollo si alguien
 * introduce un valor fuera del CHECK, en vez de dejar que Postgres lo rechace y
 * que el error se trague como "acción omitida".
 *
 * Cobertura real de la regla (ronda 3; todos los CHECK reconfirmados con
 * `pg_constraint` el 2026-09-09, y cada punto verificado en el código, que era
 * justo lo que fallaba en la ronda 2: la regla se enunciaba y no se cumplía):
 *   opportunity_objections.detected_by  → `buildObjectionRow`         (aquí)
 *   tasks.status/priority               → `buildTaskRow`              (aquí)
 *   call_tag_relations.source           → `applyAutoTags`             (callAnalysisService)
 *                                       → `POST /api/crm/calls/[id]/tags`
 *   activities.activity_type            → `CALL_ACTIVITY_TYPE`        (callActivityService,
 *                                          reutilizada por callActivitySync)
 *   notifications.channel               → `CALL_NOTIFICATION_CHANNEL` (callActivityService)
 *   calls.mode/status/duration_source   → `MANUAL_CALL_*`             (manualCallService)
 *   call_recordings.status              → `MANUAL_RECORDING_STATUS`   (manualCallService)
 *   call_transcripts.status             → `transcriptStatus`          (transcriptionService)
 *   call_analyses.sentiment             → esquema zod del prompt (`SENTIMENTS`,
 *                                          positive|neutral|negative|mixed): el
 *                                          valor viene del LLM y se valida antes
 *                                          del INSERT, no con `assertDbEnum`.
 *
 * Las constantes `*_VALUES`/`MANUAL_*`/`CALL_*` se evalúan al cargar el módulo:
 * si alguien cambia un literal por uno inválido, el import falla en el primer
 * test en vez de romper en producción con un CHECK.
 */

import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/lib/crm/enums';
import type { CallAnalysisLlm } from './prompts/callAnalysisPrompt';

// ─── Enums con CHECK real que aún NO están en src/lib/crm/enums.ts ───────────
// (pedidos a DB/REG en el informe de la ronda 2 para que entren en enums.ts +
//  db-checks.json y los cubra el guardarraíl #9).

/** `opportunity_objections_detected_by_check`: CHECK (detected_by = ANY (ARRAY['manual','ia'])). */
export const OBJECTION_DETECTED_BY_VALUES = ['manual', 'ia'] as const;
export type ObjectionDetectedBy = (typeof OBJECTION_DETECTED_BY_VALUES)[number];

/** `call_tag_relations_source_check`: CHECK (source = ANY (ARRAY['manual','ia'])). */
export const CALL_TAG_SOURCE_VALUES = ['manual', 'ia'] as const;
export type CallTagSource = (typeof CALL_TAG_SOURCE_VALUES)[number];

/**
 * `notifications_channel_check`: CHECK (channel = ANY (ARRAY['email','push',
 * 'whatsapp','sms','webhook','app'])) — verificado con `pg_constraint` el
 * 2026-09-09. Lo usa `notifyCallAnalyzed` al llamar a `fn_create_org_notification`.
 */
export const NOTIFICATION_CHANNEL_VALUES = ['email', 'push', 'whatsapp', 'sms', 'webhook', 'app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL_VALUES)[number];

/**
 * Valor que usa TODO F4 para marcar autoría de la IA en columnas con CHECK.
 * En esta base de datos es `'ia'` (español), NO `'ai'`: `detected_by='ai'` violaba
 * el CHECK y hacía que la acción `objections` nunca se aplicara (tester r1 nº 1).
 */
export const AI_AUTHOR_VALUE = 'ia';

/** Valida un literal contra el CHECK real. Lanza si no pertenece (bug del código, no del dato). */
export function assertDbEnum<T extends string>(value: string, allowed: readonly T[], column: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`Valor "${value}" fuera del CHECK de ${column} (permitidos: ${allowed.join('|')})`);
  }
  return value as T;
}

export interface StageRef {
  id: string;
  name: string;
  position?: number;
}

export interface StageValidation {
  stageId: string | null;
  confidence: number;
  rejectedStageId: string | null;
}

/** `suggested_stage_id` debe pertenecer al pipeline de la oportunidad y ser distinta de la actual. */
export function validateSuggestedStage(
  suggested: string | null | undefined,
  confidence: number | null | undefined,
  stages: StageRef[],
  currentStageId?: string | null,
): StageValidation {
  const conf = typeof confidence === 'number' && Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0;
  if (!suggested) return { stageId: null, confidence: conf, rejectedStageId: null };
  const s = String(suggested).trim();
  const byId = stages.find((st) => st.id === s);
  // Tolerancia: el LLM a veces devuelve el nombre en vez del id.
  const byName = byId ?? stages.find((st) => st.name.trim().toLowerCase() === s.toLowerCase());
  if (!byName) return { stageId: null, confidence: 0, rejectedStageId: s };
  if (currentStageId && byName.id === currentStageId) return { stageId: null, confidence: 0, rejectedStageId: null };
  return { stageId: byName.id, confidence: conf, rejectedStageId: null };
}

export interface ObjectionRef {
  id: string;
  title: string;
  category?: string | null;
  detection_signals?: unknown;
}

export interface MappedObjection {
  objection_id: string | null;
  label: string;
  quote: string;
  confidence: number;
  /** 'id' (el LLM devolvió un id válido) | 'title' (similitud) | null (sin coincidencia). */
  match: 'id' | 'title' | null;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'del', 'y', 'o', 'un', 'una', 'en', 'por', 'para', 'con', 'que', 'es', 'al', 'no', 'muy', 'mas', 'a']);

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter((t) => t.length > 2 && !STOPWORDS.has(t)));
}

/** Similitud Jaccard sobre tokens (0..1). */
export function tokenSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function signalsText(sig: unknown): string {
  if (!sig) return '';
  if (Array.isArray(sig)) return sig.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  if (typeof sig === 'object') return Object.values(sig as Record<string, unknown>).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  return String(sig);
}

/**
 * Mapea objeciones detectadas al catálogo: id exacto → similitud del label con
 * título/categoría/señales (umbral 0.34 o inclusión de substring).
 */
export function mapObjectionsToCatalog(detected: CallAnalysisLlm['objections'], catalog: ObjectionRef[], threshold = 0.34): MappedObjection[] {
  const byId = new Map(catalog.map((o) => [o.id, o]));
  return detected.map((d) => {
    const label = (d.label ?? '').trim();
    if (d.objection_id && byId.has(d.objection_id)) {
      return { objection_id: d.objection_id, label: label || byId.get(d.objection_id)!.title, quote: d.quote ?? '', confidence: d.confidence ?? 0.5, match: 'id' };
    }
    let best: { id: string; score: number } | null = null;
    const nl = normalize(label);
    for (const o of catalog) {
      const nt = normalize(o.title);
      const contains = nl && nt && (nl.includes(nt) || nt.includes(nl)) ? 0.6 : 0;
      const score = Math.max(
        contains,
        tokenSimilarity(label, o.title),
        tokenSimilarity(label, `${o.category ?? ''} ${signalsText(o.detection_signals)}`) * 0.8,
      );
      if (score >= threshold && (!best || score > best.score)) best = { id: o.id, score };
    }
    return {
      objection_id: best?.id ?? null,
      label,
      quote: d.quote ?? '',
      confidence: best ? Math.min(1, (d.confidence ?? 0.5) * (0.6 + best.score * 0.4)) : (d.confidence ?? 0.5),
      match: best ? 'title' : null,
    };
  });
}

/** Prioridades libres del LLM/legacy → CHECK `tasks.priority`. */
export function mapTaskPriority(value: unknown): TaskPriority {
  const v = String(value ?? '').toLowerCase().trim();
  if ((TASK_PRIORITIES as readonly string[]).includes(v)) return v as TaskPriority;
  if (v === 'medium' || v === 'media' || v === 'normal') return 'med';
  if (v === 'urgent' || v === 'urgente') return 'critical';
  if (v === 'alta') return 'high';
  if (v === 'baja') return 'low';
  return 'med';
}

export function mapTaskStatus(value: unknown): TaskStatus {
  const v = String(value ?? '').toLowerCase().trim();
  if ((TASK_STATUSES as readonly string[]).includes(v)) return v as TaskStatus;
  if (v === 'pending' || v === 'todo') return 'open';
  if (v === 'completed') return 'done';
  return 'open';
}

/** Fecha ISO YYYY-MM-DD válida o null (evita que el LLM devuelva "mañana"). */
export function normalizeDueDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

export interface SuggestedTaskLike {
  title: string;
  type?: string | null;
  priority?: string | null;
  due_date?: string | null;
  description?: string | null;
}

export interface TaskRowInput {
  orgId: number;
  callId: string;
  opportunityId: string | null;
  customerId: string | null;
  assignedTo: string | null;
  createdBy: string | null;
  analysisId: string;
}

/** Fila de `tasks` con enums válidos (`status='open'`, priority ∈ CHECK, related_to_*). */
export function buildTaskRow(task: SuggestedTaskLike, index: number, input: TaskRowInput) {
  const type = ['call', 'email', 'whatsapp', 'meeting', 'task'].includes(String(task.type)) ? String(task.type) : 'task';
  return {
    organization_id: input.orgId,
    title: task.title.slice(0, 200),
    description: task.description ?? `Sugerida por el análisis IA de la llamada (${type}).`,
    priority: mapTaskPriority(task.priority),
    // `tasks_status_check` = open|in_progress|done|canceled: comprobado, no casteado.
    status: assertDbEnum('open', TASK_STATUSES, 'tasks.status'),
    due_date: normalizeDueDate(task.due_date),
    assigned_to: input.assignedTo,
    created_by: input.createdBy,
    related_to_id: input.opportunityId ?? input.callId,
    related_to_type: input.opportunityId ? 'opportunity' : 'call',
    customer_id: input.customerId,
    type,
    tags: ['ia', 'llamada', `analysis:${input.analysisId}`, `idx:${index}`],
  };
}

export interface ObjectionRowInput {
  orgId: number;
  opportunityId: string;
  objectionId: string;
  notes?: string | null;
  detectedBy?: ObjectionDetectedBy;
}

/**
 * Fila de `opportunity_objections` con `detected_by` dentro del CHECK real
 * (`manual|ia`). Antes se escribía `'ai'` y el INSERT fallaba SIEMPRE.
 */
export function buildObjectionRow(input: ObjectionRowInput) {
  return {
    organization_id: input.orgId,
    opportunity_id: input.opportunityId,
    objection_id: input.objectionId,
    detected_by: assertDbEnum(input.detectedBy ?? AI_AUTHOR_VALUE, OBJECTION_DETECTED_BY_VALUES, 'opportunity_objections.detected_by'),
    resolved: false,
    notes: input.notes ?? null,
  };
}

// ─── Enmascarado de datos sensibles antes del LLM (§7 / PII) ────────────────

/** Prefijo que `renderTranscriptForLlm` pone al inicio de CADA segmento: `[mm:ss] [ROL]: `. */
const SEGMENT_PREFIX_SRC = String.raw`\r?\n\[\d{1,3}:\d{2}\]\s\[[^\]\n]{1,24}\]:[ \t]*`;
const SEGMENT_PREFIX_RE = new RegExp(SEGMENT_PREFIX_SRC, 'g');

/**
 * Separadores admitidos DENTRO de un número de tarjeta dictado: espacios,
 * guiones, PUNTOS (`4111.1111…`, falso negativo r2 nº 8) y el salto de línea
 * con el prefijo de segmento, porque la transcripción se envía con una línea
 * por segmento y una tarjeta dictada despacio queda partida en dos.
 */
const CARD_SEP_SRC = String.raw`(?:[ .\-]{1,2}|${SEGMENT_PREFIX_SRC})`;
const CARD_RE = new RegExp(String.raw`(?<!\d)\d(?:${CARD_SEP_SRC}?\d){12,18}(?!\d)`, 'g');

/** Palabras que anuncian un secreto. El valor sólo se oculta si además "parece" un secreto. */
const SECRET_KEYWORD_RE = /(?:\bcvv\b|\bcvc\b|c[oó]digos? de seguridad|c[oó]digo de verificaci[oó]n|\bclaves?\b|\bcontrase[nñ]as?\b|\bpassword\b|\bpin\b|\bnip\b|\botp\b)/gi;

/**
 * Dos niveles de palabra clave, porque no todas valen lo mismo en español
 * comercial:
 *
 *  - FUERTE (`cvv`, `cvc`, `código de seguridad/verificación`, `contraseña`,
 *    `password`, `pin`, `nip`, `otp`): sólo anuncian secretos. Un número corto
 *    detrás es un secreto.
 *  - DÉBIL (`clave`, `claves`): en ventas significa casi siempre «importante»
 *    («el dato clave», «la clave del negocio»). Un número detrás es una cifra,
 *    nunca una credencial (ronda 5: la vía de sólo dígitos queda cerrada para
 *    esta palabra, ver `findSecretValue`).
 */
const WEAK_SECRET_KEYWORD_RE = /^claves?$/i;

/** Unidades que delatan una CIFRA de negocio, no una credencial: «20000000 al mes». */
const AMOUNT_MARKER_RE = /^[\s,.]*(?:%|(?:al|a la|por|cada|de)\s+)?(?:mes(?:es)?|a[nñ]os?|semanas?|d[ií]as?|pesos?|d[oó]lares?|euros?|usd|cop|mxn|eur|millones?|mil(?:lones)?|por\s+ciento|mensual(?:es)?|anual(?:es)?)\b/i;

/**
 * Palabras que pueden aparecer ENTRE la palabra clave y el valor sin romper la
 * relación («la clave DE ACCESO ES Secreta99», «el pin DE MI TARJETA ES 4321»,
 * «mi clave PERSONAL ES Sol2024», «la contraseña QUE USAMOS SIEMPRE ES …»).
 * Si aparece cualquier otra palabra, se corta.
 *
 * Ronda 5 (tester r4 P1): el corte por conector vuelve a aplicarse TAMBIÉN a la
 * vía alfanumérica. La ronda 4 lo saltaba y por eso destruía nombres de producto
 * («la clave del NEGOCIO es el iPhone16», «el código de seguridad INTERNO es
 * ISO9001»). Para no perder los aciertos de la ronda 4 la lista incorpora las
 * palabras que sí aparecen en el dictado de una credencial (`personal`, `que`,
 * `usamos`, `siempre`, `bien`, `nueva`…), que son adjetivos/verbos del propio
 * secreto, no un cambio de tema.
 */
/**
 * Sustantivos que, detrás de «clave de/del», MANTIENEN la lectura de credencial
 * («la clave de acceso», «la clave del wifi»). Cualquier otro sustantivo hace
 * que «clave» signifique «lo esencial de X» («la clave DEL NEGOCIO», «la clave
 * DEL PROYECTO», «la clave DEL ÉXITO») y entonces no se busca ningún secreto.
 *
 * `wi` y `fi` están porque el tokenizador parte por el guion y la grafía normal
 * de la palabra es «Wi-Fi» (tester r5 N2/V4: era el ejemplo del propio doc y no
 * se ocultaba escrito como lo escribe todo el mundo).
 *
 * Ronda 7 (tester r6 F3): el PLURAL se deriva, no se escribe a mano. Sólo había
 * formas singulares, así que `la clave de LOS SISTEMAS es Sol2024` viajaba
 * entera mientras el singular se ocultaba — y `WEAK_ADJECTIVE_HEADS`, doce
 * líneas más abajo y en el mismo archivo, sí llevaba los plurales. La flexión de
 * número es una clase cerrada: se cierra por construcción (igual que
 * `SECRET_CONNECTORS` en la r6), no palabra por palabra.
 */

/**
 * Plural castellano regular: `+s` tras vocal, `+es` tras consonante. A los
 * terminados en consonante se les añade TAMBIÉN la forma llana porque los
 * préstamos se pluralizan así en el habla real (`routers`, `logins`, `modems`).
 * Alguna forma derivada no existe (`reds`, `seguridads`): son tokens inertes,
 * nunca aparecen en una transcripción, y el coste de dejarlas es cero frente al
 * de mantener otra lista a mano.
 */
function pluralForms(noun: string): string[] {
  if (/[aeiouáéíóú]$/.test(noun)) return [`${noun}s`];
  return [`${noun}es`, `${noun}s`];
}

const CREDENTIAL_CONTEXT_SINGULARS = [
  'acceso', 'seguridad', 'entrada', 'tarjeta', 'cuenta', 'banco', 'wifi', 'wi', 'fi', 'correo', 'usuario',
  'red', 'portal', 'sistema', 'ingreso', 'login', 'router', 'modem', 'plataforma',
];

const CREDENTIAL_CONTEXT_NOUNS = new Set(CREDENTIAL_CONTEXT_SINGULARS.flatMap((n) => [n, ...pluralForms(n)]));

const SECRET_CONNECTORS = new Set([
  // Ronda 6 (tester r5 N2): los sustantivos de credencial son conectores POR
  // CONSTRUCCIÓN. Antes eran dos listas escritas a mano y ocho de los diecisiete
  // sustantivos no estaban aquí: la frase pasaba el filtro del modismo («aquí sí
  // hay credencial») y acto seguido el sustantivo cortaba la búsqueda del valor,
  // de modo que `la clave del router es Admin2024` viajaba ENTERA al proveedor de
  // análisis. `wifi` se salvaba sólo por estar, por casualidad, en las dos listas.
  ...CREDENTIAL_CONTEXT_NOUNS,
  'de', 'del', 'la', 'el', 'los', 'las', 'lo', 'un', 'una', 'mi', 'mis', 'tu', 'tus', 'su', 'sus',
  'es', 'son', 'era', 'sera', 'seria', 'fue', 'va', 'ser', 'esta', 'este', 'ese', 'esa', 'aqui', 'ahi',
  'y', 'o', 'a', 'al', 'en', 'con', 'para', 'por', 'me', 'te', 'le', 'se', 'que',
  'anota', 'apunta', 'apuntalo', 'apuntala', 'apunte', 'digo', 'dice',
  'personal', 'secreta', 'secreto', 'nueva', 'nuevo', 'actual', 'provisional', 'temporal',
  'usamos', 'uso', 'usas', 'usan', 'siempre', 'bien', 'nuestra', 'nuestro',
]);

/** Determinantes que se saltan al buscar el sustantivo de «clave de …». */
const DETERMINERS = new Set(['mi', 'mis', 'tu', 'tus', 'su', 'sus', 'la', 'el', 'los', 'las', 'un', 'una', 'nuestro', 'nuestra', 'nuestros', 'nuestras']);

/**
 * Palabras que DELANTE de «clave» la convierten en adjetivo («el FACTOR clave»,
 * «el NÚMERO clave es 150000», «el DATO clave es 2026»): ahí no hay credencial.
 *
 * Ronda 7 (pasada de gemelos de F3): esta lista es la HERMANA de
 * `CREDENTIAL_CONTEXT_NOUNS` y tenía el defecto simétrico —los plurales escritos
 * a mano y uno olvidado: `momentos`, con lo que «los MOMENTOS clave son Pro2026»
 * borraba el nombre del producto mientras «el MOMENTO clave…» no—. Se deriva con
 * la misma función, así que las dos listas vuelven a tratarse con el mismo
 * criterio y no hay que acordarse de nada.
 */
const WEAK_ADJECTIVE_HEAD_SINGULARS = [
  'factor', 'dato', 'punto', 'cifra', 'numero', 'aspecto', 'tema', 'elemento',
  'momento', 'parte', 'palabra', 'indicador', 'pregunta', 'idea',
];

const WEAK_ADJECTIVE_HEADS = new Set(WEAK_ADJECTIVE_HEAD_SINGULARS.flatMap((n) => [n, ...pluralForms(n)]));

/** Verbos que DETRÁS de «clave» abren el modismo «la clave ESTÁ EN el Modelo3». */
const WEAK_IDIOM_VERBS = new Set(['esta', 'estaba', 'estara', 'estuvo', 'radica', 'reside', 'consiste']);

const SECRET_WORD_RE = /[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]+/g;

function plainWord(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Palabras normalizadas que siguen a `from`, en orden (máx. `count`). */
function wordsAfter(text: string, from: number, count: number): string[] {
  const re = new RegExp(SECRET_WORD_RE.source, 'g');
  const slice = text.slice(from, from + 60);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null && out.length < count) out.push(plainWord(m[0]));
  return out;
}

/** Última palabra normalizada antes de `before` ('' si no hay). */
function wordBefore(text: string, before: number): string {
  const re = new RegExp(SECRET_WORD_RE.source, 'g');
  const slice = text.slice(Math.max(0, before - 40), before);
  let last = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) last = m[0];
  return plainWord(last);
}

/**
 * ¿«clave» está usada con el sentido comercial de «lo esencial», y no como
 * credencial? (ronda 5, tester r4 P1). Tres marcas, todas de la gramática de la
 * frase y no del valor:
 *
 *  1. la precede un sustantivo que la usa de adjetivo: «el FACTOR clave», «el
 *     NÚMERO clave es 150000», «la CIFRA clave es 4500». Ojo: esta marca se mira
 *     DESPUÉS del genitivo, así que no protege si detrás hay un genitivo de
 *     credencial («el tema clave DE LA CUENTA es Premium2024» sí se oculta);
 *  2. la sigue el modismo «está en»: «la clave ESTÁ EN el Modelo3 que vende más»;
 *  3. la sigue «de/del + sustantivo ajeno a una credencial»: «la clave DEL
 *     NEGOCIO es el iPhone16», «la clave DEL PROYECTO es Fase2», «la clave DEL
 *     ÉXITO es Windows11». Con un sustantivo de credencial («de acceso», «del
 *     wifi») NO se aplica y el valor se sigue buscando.
 */
function weakKeywordIsIdiom(text: string, kwStart: number, kwEnd: number): boolean {
  const next = wordsAfter(text, kwEnd, 4);
  // El genitivo se mira PRIMERO (ronda 6, tester r5 N2/V2): un genitivo de
  // credencial manda sobre la cabeza adjetiva, y así «la PALABRA clave DE ACCESO
  // es Verano2025» vuelve a leerse como lo que es. Sin genitivo, «palabra clave»
  // sigue siendo «keyword» y se descarta (límite L9, declarado).
  if (next.length > 0 && (next[0] === 'de' || next[0] === 'del')) {
    let i = 1;
    while (i < next.length && DETERMINERS.has(next[i])) i += 1;
    const noun = next[i] ?? '';
    return !CREDENTIAL_CONTEXT_NOUNS.has(noun);
  }
  if (WEAK_ADJECTIVE_HEADS.has(wordBefore(text, kwStart))) return true;
  if (next.length === 0) return false;
  if (WEAK_IDIOM_VERBS.has(next[0])) return true;
  return false;
}

/**
 * Busca, a partir de `from`, el primer token que "parece un secreto". Entre la
 * palabra clave y el valor sólo puede haber conectores (`SECRET_CONNECTORS`):
 * la primera palabra ajena corta, porque es un cambio de tema.
 *
 *  a) **Letras + dígitos** (`Sol2024`, `Secreta99`, `Ana1990`, 4-24 caracteres):
 *     credencial. Ronda 5: vuelve a exigir el corte por conector —sin él, la
 *     ronda 4 borraba `iPhone16`, `Pro2026`, `Fase2`, `Windows11` e `ISO9001`
 *     (tester r4 P1)—; los aciertos de la ronda 4 se conservan porque las
 *     palabras del dictado de una credencial están en la lista de conectores.
 *
 *  b) **Sólo dígitos**: sólo tras palabra clave FUERTE, 3-8 dígitos y sin unidad
 *     de negocio detrás. Tras «clave» (débil) la vía queda CERRADA: en ventas un
 *     número detrás de «clave» es una cifra («el número clave es 150000», «la
 *     cifra clave es 4500», «La clave es 20000000 al mes», «El dato clave es
 *     2026»), y el coste de esa decisión está declarado abajo.
 *
 * En ambos casos se para en fin de frase o corchete (los corchetes delimitan
 * prefijos de segmento y marcadores ya enmascarados). La coma y los dos puntos
 * NO cortan: son la puntuación normal de un inciso hablado.
 */
function findSecretValue(text: string, from: number, weakKeyword: boolean): { start: number; end: number } | null {
  const slice = text.slice(from, from + 80);
  SECRET_WORD_RE.lastIndex = 0;
  let prevEnd = 0;
  let steps = 0;
  let m: RegExpExecArray | null;
  while ((m = SECRET_WORD_RE.exec(slice)) !== null && steps < 6) {
    if (/[.!?;\n\r[\]]/.test(slice.slice(prevEnd, m.index))) return null;
    const token = m[0];
    const hit = { start: from + m.index, end: from + m.index + token.length };
    const hasDigit = /\d/.test(token);
    const hasLetter = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(token);
    // (a) credencial alfanumérica.
    if (hasDigit && hasLetter) return token.length >= 4 && token.length <= 24 ? hit : null;
    if (hasDigit) {
      // (b) sólo dígitos: cerrada para «clave», acotada para las fuertes.
      if (weakKeyword) return null;
      if (token.length < 3 || token.length > 8) return null;
      if (AMOUNT_MARKER_RE.test(slice.slice(m.index + token.length))) return null;
      return hit;
    }
    if (!SECRET_CONNECTORS.has(plainWord(token))) return null;
    prevEnd = m.index + token.length;
    steps += 1;
  }
  return null;
}

/**
 * Enmascara en la transcripción los datos que NO deben salir hacia el proveedor
 * de ANÁLISIS: números de tarjeta (13-19 dígitos que pasan Luhn, con espacios,
 * guiones, puntos o partidos entre dos segmentos) y el valor que sigue a
 * cvv/cvc/código de seguridad/clave/contraseña/pin/otp cuando ese valor parece
 * un secreto (contiene dígitos), admitiendo conectores por medio.
 *
 * Reescrito en la ronda 3 (tester r2 nº 8), afinado en la 4 (tester r3 N3),
 * corregido en la 5 (tester r4 P1) y en la 6 (tester r5 N2). Cada versión cerraba
 * el fallo denunciado y abría el de al lado: la v4 saltaba el corte por conector
 * en la vía alfanumérica y destruía nombres de producto; la v5 (ronda 5) lo
 * devolvió, y el precio —no declarado entonces— fue que ocho de los sustantivos
 * que ESTE MISMO archivo declara «de credencial» no estaban en la lista de
 * conectores, así que `la clave del router es Admin2024` viajaba ENTERA al
 * proveedor de análisis. En la v5 vigente esa contradicción no puede repetirse:
 * `SECRET_CONNECTORS` se construye con `...CREDENTIAL_CONTEXT_NOUNS`.
 *
 * La regla tiene tres piezas, todas gramaticales:
 *
 *   1. entre la palabra clave y el valor sólo caben conectores (incluidas las
 *      palabras propias del dictado de una credencial: `personal`, `que
 *      usamos siempre`, `apúntala bien`…). La primera palabra ajena corta;
 *   2. «clave» (palabra DÉBIL) no acepta valores de sólo dígitos, y se descarta
 *      cuando la frase la usa como adjetivo SIN genitivo detrás («el factor
 *      clave», «el número clave»), como modismo («la clave está en…») o con
 *      genitivo ajeno a una credencial («la clave del negocio/proyecto/éxito»).
 *      Cuando hay genitivo, el genitivo de credencial manda sobre la cabeza
 *      adjetiva y la protección se pierde («el tema clave DE LA CUENTA es
 *      Premium2024» → `[OCULTO]`): es el mecanismo de L12, no una excepción;
 *   3. las palabras FUERTES sí aceptan 3-8 dígitos, salvo unidad de negocio
 *      detrás.
 *
 * LÍMITES CONOCIDOS (ninguno resuelto). **Esta lista NO es exhaustiva**: en la
 * ronda 5 se declaró «la lista entera» y el tester encontró cuatro clases más en
 * una tarde (r5 N2). Es la lista de lo que se conoce, fijada por prueba (caso D3
 * de `f4Round6Builder.test.ts`); una heurística gramatical sobre lengua hablada
 * tiene más límites de los que su autor sabe enumerar:
 *
 *   L1. credencial de sólo letras: `la clave es Girasol` → intacta (es el precio
 *       de no destrozar frases comerciales);
 *   L2. credencial de sólo dígitos tras «clave»: `la clave es 1234567` → intacta
 *       (en ventas eso es una cifra);
 *   L3. credencial de sólo dígitos de MÁS DE 8 tras palabra fuerte:
 *       `mi contraseña es 987654321` → intacta;
 *   L4. valor situado ANTES de la palabra clave: `Sol2024 es mi clave` → intacto;
 *   L5. fin de frase entre la palabra clave y el valor: `Te digo el pin. Es 4321`
 *       → intacto (el punto corta; la coma y los dos puntos no);
 *   L6. ventana de 6 palabras: `la clave que te dije por teléfono el otro día es
 *       Sol2024` → intacta (además `dije` no es conector);
 *   L7. palabra ajena por medio: `nuestra clave interna es Sol2024` → intacta.
 *       Es el coste de L-nuevo frente a la ronda 4, y el que evita borrar
 *       `nuestro código de seguridad interno es ISO9001`;
 *   L8. FALSO POSITIVO que queda vivo: un producto alfanumérico anunciado sin
 *       genitivo ni adjetivo («la clave es el iPhone16») se oculta igual, porque
 *       `es` y `el` son conectores y la forma del token no distingue `iPhone16`
 *       de `Sol2024`. Sólo se descartan las construcciones de la pieza 2.
 *   L9. «palabra clave» SIN genitivo de credencial se lee como *keyword* (SEO) y
 *       no como contraseña: `mi palabra clave es Sol2024` → intacta. Con
 *       genitivo sí se oculta: `la palabra clave de acceso es Verano2025`;
 *  L10. cualquier SEPARADOR dentro del valor parte el token y corta: `Sol-2024`,
 *       `Sol_2024`, `Sol.2024`, `la clave de acceso es Sol 2024` → intactas.
 *       Admitirlos exige tocar la tokenización, que es la pieza que en cuatro
 *       rondas ha roto siempre por el lado contiguo: se declara, no se cambia;
 *  L11. palabra ajena entre la clave FUERTE y el número: `el pin es el numero
 *       4321` → intacta (`numero` no es conector; sí es cabeza de adjetivo);
 *  L12. FALSO POSITIVO nuevo, coste declarado del arreglo de r5 N2: un sustantivo
 *       de credencial usado en sentido comercial arrastra el valor que le sigue
 *       («la clave del sistema es Windows11» → `[OCULTO]`), y arrastra también
 *       lo que la cabeza adjetiva protegía («el tema clave de la cuenta es
 *       Premium2024», «el codigo de seguridad del sistema es ISO9001» →
 *       `[OCULTO]`; tester r6 F4). Con una palabra ajena por medio («…es el
 *       modulo Pro2026», «…de seguridad interno es ISO9001») L7 lo salva.
 *
 * Es una heurística, no un clasificador: NO se declara cerrada.
 *
 * DECISIÓN (ronda 2, se mantiene): nombre, empresa, teléfono, correo e importes
 * NO se enmascaran — son el contexto que el propio prompt envía.
 *
 * ALCANCE REAL (tester r2 nº 8, párrafo final): esto SOLO se aplica al texto que
 * se manda al LLM de análisis. `call_transcripts.full_text` y los segmentos se
 * guardan sin enmascarar, y el audio íntegro ya se envió al proveedor STT. No es
 * una garantía PCI: es una reducción de superficie ante el SEGUNDO proveedor.
 */
export function maskSensitiveForLlm(text: string): string {
  if (!text) return text;
  // 1) Tarjetas primero: así el marcador queda fuera del alcance de la regla 2.
  let out = text.replace(CARD_RE, (m) => {
    SEGMENT_PREFIX_RE.lastIndex = 0;
    const joins = m.match(SEGMENT_PREFIX_RE) ?? [];
    const digits = m.replace(SEGMENT_PREFIX_RE, '').replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhn(digits)) return m;
    // Si la tarjeta cruzaba segmentos, se conservan los saltos para no fundir líneas.
    return `[TARJETA ****${digits.slice(-4)}]${joins.join('')}`;
  });

  // 2) Valores anunciados por una palabra clave.
  SECRET_KEYWORD_RE.lastIndex = 0;
  const cuts: Array<{ start: number; end: number }> = [];
  let k: RegExpExecArray | null;
  while ((k = SECRET_KEYWORD_RE.exec(out)) !== null) {
    const weak = WEAK_SECRET_KEYWORD_RE.test(k[0]);
    // «clave» usada como «lo esencial de X» no anuncia ningún secreto.
    if (weak && weakKeywordIsIdiom(out, k.index, k.index + k[0].length)) continue;
    const hit = findSecretValue(out, k.index + k[0].length, weak);
    if (hit && (cuts.length === 0 || hit.start >= cuts[cuts.length - 1].end)) cuts.push(hit);
  }
  for (let i = cuts.length - 1; i >= 0; i--) {
    out = `${out.slice(0, cuts[i].start)}[OCULTO]${out.slice(cuts[i].end)}`;
  }
  return out;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Fusión superficial de discovery: no pisa claves existentes con valor. */
export function mergeDiscovery(existing: Record<string, unknown> | null | undefined, incoming: Record<string, unknown>): { merged: Record<string, unknown>; added: string[] } {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };
  const added: string[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined || v === '') continue;
    const cur = merged[k];
    if (cur === null || cur === undefined || cur === '') {
      merged[k] = v;
      added.push(k);
    }
  }
  return { merged, added };
}
