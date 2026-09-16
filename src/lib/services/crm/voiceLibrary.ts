/**
 * Biblioteca pública de voces de ElevenLabs (`GET /v1/shared-voices`) — parte pura.
 *
 * Aquí vive lo que se puede probar sin red: normalizar la respuesta cruda del
 * proveedor a la tarjeta que pinta la UI, traducir etiquetas, construir la
 * query con filtros saneados y convertir los errores del proveedor a lenguaje
 * humano. La llamada de red vive en `voiceLibraryService.ts`.
 *
 * Contrato verificado en vivo el 2026-09-14 contra la API real: la respuesta
 * trae `voices[]`, `has_more`, `total_count` y `last_sort_id`; `page` es base 0.
 * El caso de uso se filtra con `use_cases` (plural): con `use_case` la API
 * devuelve el total sin filtrar (7.772 frente a 1.924 con `conversational`).
 * Evidencia: `__tests__/fixtures/sharedVoicesUseCases.json`.
 */

export const LIBRARY_PAGE_SIZE = 24;

/** Campos de la respuesta cruda que consumimos (hay más; se ignoran). */
export interface SharedVoiceRaw {
  public_owner_id: string;
  voice_id: string;
  name: string;
  accent?: string | null;
  gender?: string | null;
  age?: string | null;
  descriptive?: string | null;
  use_case?: string | null;
  category?: string | null;
  language?: string | null;
  locale?: string | null;
  description?: string | null;
  preview_url?: string | null;
  free_users_allowed?: boolean | null;
  featured?: boolean | null;
  cloned_by_count?: number | null;
}

export type LibraryTagKey = 'language' | 'gender' | 'age' | 'accent' | 'use_case' | 'descriptive';

export interface LibraryTag {
  key: LibraryTagKey;
  value: string;
  label: string;
}

export interface LibraryVoice {
  voice_id: string;
  public_owner_id: string;
  name: string;
  description: string | null;
  preview_url: string | null;
  language: string | null;
  locale: string | null;
  category: string | null;
  free_users_allowed: boolean;
  featured: boolean;
  cloned_by_count: number;
  tags: LibraryTag[];
}

export interface LibraryFilters {
  search?: string;
  /** Código ISO (`es`, `en`…) o `'all'` para no filtrar. Por defecto `es`. */
  language?: string;
  gender?: string;
  use_case?: string;
  page?: number;
}

// ─── Etiquetas en español ────────────────────────────────────────────────────

export const LANGUAGE_LABELS: Record<string, string> = {
  es: 'Español', en: 'Inglés', pt: 'Portugués', fr: 'Francés', it: 'Italiano', de: 'Alemán',
  ca: 'Catalán', nl: 'Neerlandés', pl: 'Polaco', ja: 'Japonés', zh: 'Chino', ko: 'Coreano',
  ar: 'Árabe', hi: 'Hindi', ru: 'Ruso', tr: 'Turco', sv: 'Sueco', da: 'Danés', fi: 'Finés',
  no: 'Noruego', cs: 'Checo', el: 'Griego', ro: 'Rumano', hu: 'Húngaro', uk: 'Ucraniano',
  id: 'Indonesio', vi: 'Vietnamita', th: 'Tailandés', tl: 'Filipino', ms: 'Malayo',
};

export const GENDER_LABELS: Record<string, string> = {
  male: 'Masculina', female: 'Femenina', neutral: 'Neutra',
};

export const AGE_LABELS: Record<string, string> = {
  young: 'Joven', middle_aged: 'Adulta', old: 'Mayor',
};

export const USE_CASE_LABELS: Record<string, string> = {
  conversational: 'Conversación',
  narrative_story: 'Narración',
  characters_animation: 'Personajes y animación',
  social_media: 'Redes sociales',
  entertainment_tv: 'Entretenimiento y TV',
  advertisement: 'Publicidad',
  informative_educational: 'Informativo y educativo',
};

export const ACCENT_LABELS: Record<string, string> = {
  'latin american': 'Latinoamericano', colombian: 'Colombiano', mexican: 'Mexicano',
  peninsular: 'Peninsular', castilian: 'Castellano', argentinian: 'Argentino', chilean: 'Chileno',
  peruvian: 'Peruano', venezuelan: 'Venezolano', american: 'Estadounidense', british: 'Británico',
  australian: 'Australiano', neutral: 'Neutro', standard: 'Estándar',
};

/** Valores de filtro que aceptamos reenviar al proveedor (lista cerrada). */
export const GENDER_OPTIONS = Object.keys(GENDER_LABELS);
export const USE_CASE_OPTIONS = Object.keys(USE_CASE_LABELS);
export const LANGUAGE_OPTIONS = ['es', 'en', 'pt', 'fr', 'it', 'de'];

function titleCase(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim().split(/\s+/);
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

export function libraryLabel(key: LibraryTagKey, value: string): string {
  const v = value.trim().toLowerCase();
  switch (key) {
    case 'language':
      return LANGUAGE_LABELS[v] ?? v.toUpperCase();
    case 'gender':
      return GENDER_LABELS[v] ?? titleCase(v);
    case 'age':
      return AGE_LABELS[v] ?? titleCase(v);
    case 'use_case':
      return USE_CASE_LABELS[v] ?? titleCase(v);
    case 'accent':
      return ACCENT_LABELS[v] ?? titleCase(v);
    default:
      return titleCase(v);
  }
}

// ─── Normalización ───────────────────────────────────────────────────────────

const TAG_ORDER: LibraryTagKey[] = ['language', 'gender', 'age', 'accent', 'use_case', 'descriptive'];

export function normalizeSharedVoice(raw: SharedVoiceRaw): LibraryVoice {
  const tags: LibraryTag[] = [];
  for (const key of TAG_ORDER) {
    const value = (raw[key] ?? '').toString().trim();
    if (!value) continue;
    tags.push({ key, value, label: libraryLabel(key, value) });
  }
  return {
    voice_id: raw.voice_id,
    public_owner_id: raw.public_owner_id,
    name: raw.name?.trim() || raw.voice_id,
    description: raw.description?.trim() || null,
    preview_url: raw.preview_url?.trim() || null,
    language: raw.language?.trim() || null,
    locale: raw.locale?.trim() || null,
    category: raw.category?.trim() || null,
    free_users_allowed: raw.free_users_allowed !== false,
    featured: raw.featured === true,
    cloned_by_count: typeof raw.cloned_by_count === 'number' ? raw.cloned_by_count : 0,
    tags,
  };
}

// ─── Query ───────────────────────────────────────────────────────────────────

const MAX_SEARCH_LENGTH = 80;

export function buildSharedVoicesQuery(filters: LibraryFilters): URLSearchParams {
  const q = new URLSearchParams();
  q.set('page_size', String(LIBRARY_PAGE_SIZE));
  const page = Number.isFinite(filters.page) ? Math.max(0, Math.floor(filters.page as number)) : 0;
  q.set('page', String(page));

  const language = (filters.language ?? 'es').trim().toLowerCase();
  if (language && language !== 'all' && /^[a-z]{2,3}$/.test(language)) q.set('language', language);

  const search = (filters.search ?? '').trim().slice(0, MAX_SEARCH_LENGTH);
  if (search) q.set('search', search);

  const gender = (filters.gender ?? '').trim().toLowerCase();
  if (GENDER_OPTIONS.includes(gender)) q.set('gender', gender);

  const useCase = (filters.use_case ?? '').trim().toLowerCase();
  // R0: la API filtra por `use_cases` (plural); `use_case` se ignora en silencio.
  if (USE_CASE_OPTIONS.includes(useCase)) q.set('use_cases', useCase);

  return q;
}

/** Cabecera de la tarjeta (estilo · acento, o el locale) y etiquetas sin recortar. */
export function splitCardTags(voice: LibraryVoice): { headline: string | null; tags: LibraryTag[] } {
  const by = (key: LibraryTagKey) => voice.tags.find((t) => t.key === key)?.label ?? null;
  const headline = [by('descriptive'), by('accent')].filter(Boolean).join(' · ') || voice.locale || null;
  const tags = (['language', 'gender', 'age', 'use_case'] as LibraryTagKey[])
    .map((key) => voice.tags.find((t) => t.key === key))
    .filter((t): t is LibraryTag => Boolean(t));
  return { headline, tags };
}

// ─── Añadir a mis voces: body acotado (R13) ──────────────────────────────────

const VOICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const OWNER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;

export interface AddLibraryVoiceBody {
  voice_id: string;
  public_owner_id: string;
  name: string;
  description: string | null;
  language: string | null;
}

/**
 * Regla dura 5 (CLAUDE.md): la organización sale de la sesión, nunca del body.
 * Una sola decisión para `voices`, `voices/clone`, `voices/library`, F10 y F13:
 * la implementación vive en `@/lib/security/organizationBody` (movida en F13 r2
 * sin cambiar el contrato); aquí solo se reexporta.
 */
export { foreignOrganizationInBody } from '@/lib/security/organizationBody';

export function sanitizeAddLibraryInput(body: unknown): AddLibraryVoiceBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const voiceId = typeof b.voice_id === 'string' ? b.voice_id.trim() : '';
  const owner = typeof b.public_owner_id === 'string' ? b.public_owner_id.trim() : '';
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, MAX_NAME_LENGTH) : '';
  if (!VOICE_ID_RE.test(voiceId) || !OWNER_ID_RE.test(owner) || !name) return null;
  const description = typeof b.description === 'string' ? b.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) : '';
  const language = typeof b.language === 'string' ? b.language.trim().toLowerCase() : '';
  return {
    voice_id: voiceId,
    public_owner_id: owner,
    name,
    description: description || null,
    language: /^[a-z]{2,3}$/.test(language) ? language : null,
  };
}

// ─── Borrar: qué va a pasar de verdad (R5) ───────────────────────────────────

/**
 * Texto del diálogo de borrado. `removeVoice` borra la fila siempre y, en
 * ElevenLabs, cualquier voz que no sea `premade` sin otras referencias: eso
 * incluye las añadidas desde la biblioteca (`professional`, `generated`…).
 */
export function describeVoiceRemoval(row: { provider: string; kind: string; provider_category?: string | null }): string {
  const agentes = 'Los agentes que la usaban pasarán a la voz por defecto.';
  if (row.provider !== 'elevenlabs' || row.provider_category === 'premade') {
    return `Se quitará del catálogo de la organización. ${agentes}`;
  }
  if (row.kind === 'cloned') {
    return `Se quitará del catálogo y se eliminará también en ElevenLabs (se pierde la voz clonada). ${agentes} No se puede deshacer.`;
  }
  if (!row.provider_category) {
    return `Se quitará del catálogo y, si esta cuenta la copió o clonó, también en ElevenLabs. ${agentes}`;
  }
  return `Se quitará del catálogo y también en ElevenLabs, salvo que otra organización de esta cuenta la use. ${agentes} No se puede deshacer.`;
}

// ─── Errores en lenguaje humano ──────────────────────────────────────────────

export interface ProviderErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

export function describeLibraryError(err: ProviderErrorLike): string {
  switch (err.code) {
    case 'paid_plan_required':
    case 'free_users_not_allowed':
      return 'Esta voz solo está disponible en un plan de pago de ElevenLabs. Elige otra o cambia el plan de la cuenta.';
    case 'voice_limit_reached':
      return 'Se alcanzó el límite de voces del plan de ElevenLabs. Borra alguna voz que no uses o amplía el plan.';
    case 'voice_not_found':
    case 'voice_does_not_exist':
      return 'ElevenLabs ya no tiene esa voz: puede que su autor la haya retirado de la biblioteca.';
    case 'can_not_use_instant_voice_cloning':
    case 'voice_cloning_not_allowed':
      return 'El plan actual de ElevenLabs no permite clonar voces. Hace falta al menos el plan Starter.';
    case 'quota_exceeded':
      return 'Se agotó la cuota de caracteres de ElevenLabs de este mes.';
    default:
      break;
  }
  if (err.status === 402) {
    return 'El plan actual de ElevenLabs no incluye esta función. Amplía el plan de la cuenta o elige otra voz.';
  }
  if (err.status === 401 || err.status === 403) {
    return 'ElevenLabs rechazó la clave configurada. Revisa la clave en Configuración › CRM › Proveedores e IA.';
  }
  if (err.status === 429) return 'ElevenLabs está recibiendo demasiadas peticiones. Espera unos segundos e inténtalo de nuevo.';
  if (err.message?.trim()) return `ElevenLabs respondió: ${err.message.trim()}`;
  return 'ElevenLabs no respondió como se esperaba. Inténtalo de nuevo en un momento.';
}
