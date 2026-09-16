/**
 * Catálogo de proveedores CRM (isomórfico: lo usan UI y servidor).
 *
 * NO contiene secretos ni lee process.env. Solo define qué categorías
 * existen, qué proveedores soporta cada una, qué campos de credenciales
 * y de settings tiene cada proveedor, y cómo se detectan placeholders.
 *
 * Fuente: docs/crm-revenue-os/FASE-00-FUNDACIONES.md §4.1–4.2, §5 y brief D1.
 */

export type ProviderCategory =
  | 'voice' | 'stt' | 'tts' | 'llm' | 'email'
  | 'whatsapp' | 'sms' | 'analysis' | 'esign' | 'calendar'
  | 'video' | 'enrichment';

export const PROVIDER_CATEGORIES: ProviderCategory[] = [
  'voice', 'stt', 'tts', 'llm', 'email', 'whatsapp', 'sms', 'analysis',
  'esign', 'calendar', 'video', 'enrichment',
];

/** Categorías que se muestran en la pestaña "Proveedores e IA" (orden de UI). */
export const UI_PROVIDER_CATEGORIES: ProviderCategory[] = [
  'llm', 'analysis', 'stt', 'tts', 'voice', 'sms', 'email', 'whatsapp',
];

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  voice: 'Telefonía (voz)',
  stt: 'Transcripción (STT)',
  tts: 'Voz sintética (TTS)',
  llm: 'Modelo de lenguaje (LLM)',
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  analysis: 'Análisis de llamadas',
  esign: 'Firma electrónica',
  calendar: 'Calendario',
  video: 'Video',
  enrichment: 'Enriquecimiento',
};

/** Proveedores soportados por categoría (el primero es el recomendado). */
export const SUPPORTED_PROVIDERS: Record<ProviderCategory, string[]> = {
  voice: ['twilio'],
  stt: ['elevenlabs', 'google', 'openai', 'deepgram'],
  tts: ['elevenlabs'],
  llm: ['openai', 'google'],
  email: ['resend'],
  whatsapp: ['meta', 'twilio'],
  sms: ['twilio'],
  analysis: ['google', 'openai'],
  esign: ['documenso', 'none'],
  calendar: ['internal', 'calcom', 'none'],
  video: ['daily', 'none'],
  enrichment: ['apollo', 'none'],
};

export const PROVIDER_LABELS: Record<string, string> = {
  twilio: 'Twilio',
  elevenlabs: 'ElevenLabs',
  google: 'Google Gemini',
  openai: 'OpenAI',
  deepgram: 'Deepgram (legacy)',
  resend: 'Resend',
  meta: 'Meta WhatsApp Cloud API',
  documenso: 'Documenso',
  internal: 'Calendario interno',
  calcom: 'Cal.com',
  daily: 'Daily',
  apollo: 'Apollo',
  none: 'Ninguno',
};

export interface CredentialField {
  key: string;
  label: string;
  /** Solo para el hint del formulario; nunca se rellena con el valor real. */
  placeholder?: string;
  required?: boolean;
}

/**
 * Campos de credenciales por proveedor. Las claves coinciden con los nombres
 * de las variables de entorno para que el fallback env y la fila de
 * `provider_configs.credentials` compartan el mismo shape.
 */
export const CREDENTIAL_FIELDS: Record<string, CredentialField[]> = {
  twilio: [
    { key: 'TWILIO_ACCOUNT_SID', label: 'Account SID', placeholder: 'AC…', required: true },
    { key: 'TWILIO_AUTH_TOKEN', label: 'Auth Token', required: true },
    { key: 'TWILIO_API_KEY', label: 'API Key SID', placeholder: 'SK…' },
    { key: 'TWILIO_API_SECRET', label: 'API Key Secret' },
    { key: 'TWILIO_TWIML_APP_SID', label: 'TwiML App SID', placeholder: 'AP…' },
    { key: 'TWILIO_PHONE_NUMBER', label: 'Número (E.164)', placeholder: '+57…' },
  ],
  elevenlabs: [
    { key: 'ELEVENLABS_API_KEY', label: 'API Key', required: true },
  ],
  openai: [
    { key: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'sk-…', required: true },
  ],
  google: [
    { key: 'GOOGLE_AI_API_KEY', label: 'Google AI API Key', required: true },
  ],
  deepgram: [
    { key: 'DEEPGRAM_API_KEY', label: 'API Key', required: true },
  ],
  resend: [
    { key: 'RESEND_API_KEY', label: 'API Key', placeholder: 're_…', required: true },
  ],
  meta: [
    { key: 'META_ACCESS_TOKEN', label: 'Access token (sistema)', required: true },
    { key: 'META_PHONE_NUMBER_ID', label: 'Phone number ID', required: true },
    { key: 'META_WABA_ID', label: 'WABA ID' },
    { key: 'META_APP_SECRET', label: 'App secret (firma de webhooks)' },
  ],
  documenso: [{ key: 'DOCUMENSO_API_KEY', label: 'API Key', required: true }],
  calcom: [{ key: 'CALCOM_API_KEY', label: 'API Key', required: true }],
  daily: [{ key: 'DAILY_API_KEY', label: 'API Key', required: true }],
  apollo: [{ key: 'APOLLO_API_KEY', label: 'API Key', required: true }],
  internal: [],
  none: [],
};

export interface SettingField {
  key: string;
  label: string;
  type: 'select' | 'number' | 'text' | 'boolean';
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}

/** Settings editables por (categoría, proveedor). */
export const SETTING_FIELDS: Partial<Record<`${ProviderCategory}:${string}`, SettingField[]>> = {
  'llm:openai': [
    { key: 'conversation_model', label: 'Modelo de conversación', type: 'select', options: ['gpt-5.6-terra', 'gpt-5.6-luna'] },
    { key: 'cheap_model', label: 'Modelo para tareas', type: 'select', options: ['gpt-5.6-luna', 'gpt-5.6-terra'] },
    { key: 'monthly_budget_usd', label: 'Presupuesto mensual (USD)', type: 'number', min: 0, max: 100000, step: 5 },
  ],
  'llm:google': [
    { key: 'model', label: 'Modelo', type: 'select', options: ['gemini-3.8-flash', 'gemini-2.5-flash'] },
  ],
  'analysis:google': [
    { key: 'model', label: 'Modelo', type: 'select', options: ['gemini-3.8-flash', 'gemini-2.5-flash'] },
  ],
  'analysis:openai': [
    { key: 'model', label: 'Modelo', type: 'select', options: ['gpt-5.6-luna', 'gpt-5.6-terra'] },
  ],
  'stt:elevenlabs': [
    { key: 'model_id', label: 'Modelo', type: 'select', options: ['scribe_v2'] },
    { key: 'language_code', label: 'Idioma', type: 'select', options: ['spa', 'eng'] },
    { key: 'diarize', label: 'Diarización', type: 'boolean' },
  ],
  'stt:google': [
    { key: 'model', label: 'Modelo', type: 'select', options: ['gemini-3.8-flash', 'gemini-2.5-flash'] },
  ],
  'tts:elevenlabs': [
    { key: 'model_id', label: 'Modelo', type: 'select', options: ['eleven_flash_v2_5', 'eleven_multilingual_v2'] },
  ],
  'voice:twilio': [
    { key: 'use_master_account', label: 'Usar cuenta de la plataforma', type: 'boolean' },
    { key: 'recording_channels', label: 'Canales de grabación', type: 'select', options: ['dual', 'mono'] },
    { key: 'consent_language', label: 'Idioma del aviso de grabación', type: 'select', options: ['es-MX', 'es-US'], help: 'es-CO no existe en Twilio' },
    { key: 'consent_voice', label: 'Voz del aviso', type: 'select', options: ['Polly.Mia-Neural', 'Polly.Andres-Neural', 'Polly.Lupe-Neural'] },
  ],
  'sms:twilio': [
    { key: 'advanced_opt_out', label: 'Advanced Opt-Out', type: 'boolean' },
  ],
  'email:resend': [
    { key: 'tracking_marketing_only', label: 'Tracking solo en marketing', type: 'boolean' },
  ],
  'whatsapp:meta': [],
  'whatsapp:twilio': [],
};

/**
 * Relleno de ejemplo del tipo `SKxxxxxxxx…`, `APxxxxxxxx…` o `0000…`: tras el
 * prefijo del proveedor, TODO el resto del valor es el mismo carácter repetido.
 * Eso no es una credencial, es un hueco sin rellenar.
 *
 * Se exige que el resto sea UNIFORME (no basta con "contiene una racha"), para
 * no marcar como ejemplo una clave real que termine en una racha de ceros —
 * caso ya cubierto por `providerConfigContract.tester`.
 *
 * F0-SEC r3 (tester r2, hueco 4): el relleno `=`/`==` final de base64 se quita
 * antes de comprobar la uniformidad. `AAAA…A=` (base64 de 32 bytes cero, el
 * ejemplo típico de la documentación) es relleno igual que `AAAA…A`.
 */
function isFillerCredential(v: string): boolean {
  const unpadded = v.replace(/={1,2}$/, '');
  // El prefijo de proveedor puede ser `SK`, `AP`, `sk-`, `re_`, `whsec_`…
  const body = unpadded.replace(/^[A-Za-z]{0,8}[-_.]?/, '');
  if (body.length >= 6 && /^(.)\1*$/.test(body)) return true;
  // Relleno corto sin prefijo ('0000', 'xxxx'): un solo carácter repetido ≥ 4
  // veces nunca es una credencial (QA r1 bajo 18).
  return unpadded.length >= 4 && /^(.)\1*$/.test(unpadded);
}

/**
 * Palabras que, como valor COMPLETO (sin distinguir mayúsculas, con o sin
 * prefijo de proveedor), son un hueco sin rellenar y no una credencial:
 * `changeme`, `TODO`, `secret`, `test`, `dummy`… (F0-SEC r2, sonda P1).
 * Se comparan contra el valor entero a propósito: `sk_test_…` de Stripe o un
 * secreto real que contenga la subcadena `test` NO son relleno.
 */
const PLACEHOLDER_WORDS = new Set([
  'changeme', 'change-me', 'change_me', 'replaceme', 'replace-me', 'replace_me',
  'todo', 'fixme', 'example', 'sample', 'secret', 'password', 'test', 'dummy',
  'placeholder', 'none', 'null', 'undefined', 'xxx', 'redacted',
]);

/**
 * Prefijos con los que empiezan los rellenos de `.env.example` y de la
 * documentación: `changeme-…`, `replace-me-…`, `cambia-esto-por-…`,
 * `genera-uno-con-openssl-…`, `generate-with-…`, `todo-…`.
 */
const PLACEHOLDER_PREFIXES = [
  'changeme', 'change-me', 'change_me', 'replaceme', 'replace-me', 'replace_me',
  'cambia-esto', 'cambiame', 'cambia-me', 'genera-uno', 'generate-', 'todo-', 'todo_', 'fixme',
  'example-', 'example_', 'dummy-', 'dummy_', 'placeholder-', 'placeholder_',
];

/**
 * Marcas de relleno que lo son en CUALQUIER posición (F0-SEC r3, tester r2
 * hueco 5: `1234changeme5678` pasaba). Son secuencias que un secreto aleatorio
 * real no contiene: aparecer dentro del valor ya lo delata.
 */
const PLACEHOLDER_ANYWHERE = ['changeme', 'change-me', 'change_me', 'replaceme', 'replace-me', 'replace_me', 'cambia-esto', 'cambiame'];

/**
 * Valor compuesto SOLO por palabras de relleno, pegadas o separadas por
 * `-`/`_`/`.` (F0-SEC r3, tester r2 hueco 5): `undefinedundefined`,
 * `undefined-undefined`, `null_null`, `secret.secret`. Es lo que produce una
 * plantilla mal interpolada (`${A}${B}` con las dos sin definir).
 */
const PLACEHOLDER_WORDS_ONLY = new RegExp(`^(?:(?:${Array.from(PLACEHOLDER_WORDS).join('|')})[-_.]?){2,}$`);

/**
 * Detecta valores de ejemplo de `.env.example` (p. ej. `your-...`, `sk-your...`,
 * `ACyour-account-sid`, `re_your-resend-key`, `cambia-esto-por-…`,
 * `genera-uno-con-openssl-…`), palabras de relleno (`changeme`, `todo`,
 * `secret`, `test`…), huecos de plantilla (`<app-secret>`, `${META_APP_SECRET}`)
 * y rellenos `SKxxxxxxxx…`. Un placeholder NO cuenta como credencial
 * configurada (tester-F00 r1).
 *
 * F6 r3: sin la comprobación de relleno, `TWILIO_API_KEY=SKxxxx…` y
 * `TWILIO_TWIML_APP_SID=APxxxx…` pasaban por credenciales reales. El softphone
 * decía que solo faltaba el API Secret y, una vez guardado, la llamada seguía
 * fallando con un 401 de Twilio sin explicación. Ahora el aviso enumera las tres.
 *
 * F0-SEC r2: la capa `src/lib/security/` (cron, Meta, Resend, Twilio, token del
 * ws-server) pasa a fallar cerrada con todo lo que esta función marque; ver
 * `src/lib/security/secrets.ts`. Un relleno que se acepta es PEOR que un secreto
 * ausente: firma con una clave que está publicada en el repositorio.
 */
export function isPlaceholderCredential(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const v = value.trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  if (lower.startsWith('your-') || lower.startsWith('sk-your')) return true;
  // Prefijos de proveedor + "your-" (ACyour-…, SKyour-…, re_your-…, whsec_your-…)
  if (/^[a-z]{0,6}[_.]?your[-_]/i.test(v)) return true;
  if (lower.includes('your-') && lower.length < 48) return true;
  // Hueco de plantilla sin sustituir: `<meta-app-secret>`, `${CRON_SECRET}`, `{{secret}}`
  if (/^<[^<>]*>$/.test(v) || /^\$\{[^}]*\}$/.test(v) || /^\{\{[^}]*\}\}$/.test(v)) return true;
  // Palabra de relleno como valor completo, con o sin prefijo de proveedor (`whsec_changeme`)
  const word = lower.replace(/^[a-z]{0,8}[-_.]?/, '');
  if (PLACEHOLDER_WORDS.has(lower) || PLACEHOLDER_WORDS.has(word)) return true;
  if (PLACEHOLDER_PREFIXES.some((p) => lower.startsWith(p) || word.startsWith(p))) return true;
  if (PLACEHOLDER_ANYWHERE.some((p) => lower.includes(p))) return true;
  if (PLACEHOLDER_WORDS_ONLY.test(lower) || PLACEHOLDER_WORDS_ONLY.test(word)) return true;
  if (isFillerCredential(v)) return true;
  return false;
}

/** Devuelve solo las claves con un valor real (sin placeholders ni vacíos). */
export function pickConfiguredKeys(creds: Record<string, unknown> | null | undefined): string[] {
  if (!creds) return [];
  return Object.keys(creds).filter((k) => !isPlaceholderCredential(creds[k]));
}

export function hasRequiredCredentials(provider: string, creds: Record<string, unknown> | null | undefined): boolean {
  const fields = CREDENTIAL_FIELDS[provider] ?? [];
  const required = fields.filter((f) => f.required);
  if (required.length === 0) return pickConfiguredKeys(creds).length > 0;
  return required.every((f) => !isPlaceholderCredential(creds?.[f.key]));
}
