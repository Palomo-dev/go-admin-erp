/**
 * Rediseño UX de «Agentes IA → Voces» (brief 6.1, 2026-09-14).
 *
 * Pruebas de lo puro, escritas ANTES de implementar (vistas en rojo):
 *  - avatar determinista a partir del `voice_id`;
 *  - transformación y filtros de la respuesta de `/v1/shared-voices`;
 *  - guion de clonación (60–90 s, fonemas variados) y validación del flujo;
 *  - errores del proveedor en lenguaje humano.
 */

import { voiceAvatar, hashVoiceId } from '@/lib/services/crm/voiceAvatar';
import {
  normalizeSharedVoice,
  buildSharedVoicesQuery,
  describeLibraryError,
  libraryLabel,
  LIBRARY_PAGE_SIZE,
  type SharedVoiceRaw,
} from '@/lib/services/crm/voiceLibrary';
import {
  CLONE_SCRIPT_ES,
  CLONE_SCRIPT_VERSION,
  HABEAS_DATA_TEXT,
  MIN_SAMPLE_SECONDS,
  MAX_SAMPLE_SECONDS,
  estimateReadingSeconds,
  validateCloneStep,
  buildConsentEvidence,
  sha256Hex,
} from '@/lib/services/crm/voiceCloneScript';

// ─── Avatar determinista ─────────────────────────────────────────────────────

describe('voiceAvatar: orbe determinista a partir del voice_id', () => {
  test('el mismo id produce siempre el mismo avatar', () => {
    const a = voiceAvatar('109o5orBWJUFCKODv4Rd');
    const b = voiceAvatar('109o5orBWJUFCKODv4Rd');
    expect(a).toEqual(b);
  });

  test('ids distintos producen avatares distintos', () => {
    const a = voiceAvatar('109o5orBWJUFCKODv4Rd');
    const b = voiceAvatar('JCY7f4177XgBm0ExKdas');
    expect(a.gradient).not.toBe(b.gradient);
  });

  test('los tonos están en rango y el gradiente es CSS válido', () => {
    const av = voiceAvatar('Y11rBAl8on4Ba9ZpY3DY');
    expect(av.hueA).toBeGreaterThanOrEqual(0);
    expect(av.hueA).toBeLessThan(360);
    expect(av.hueB).toBeGreaterThanOrEqual(0);
    expect(av.hueB).toBeLessThan(360);
    expect(av.angle).toBeGreaterThanOrEqual(0);
    expect(av.angle).toBeLessThan(360);
    expect(av.gradient).toMatch(/^linear-gradient\(\d+deg, hsl\(/);
  });

  test('los dos tonos se separan al menos 40° para que el orbe tenga relieve', () => {
    for (const id of ['a', 'bb', 'ccc', '109o5orBWJUFCKODv4Rd', 'pNInz6obpgDQGcFmaJgB', 'x'.repeat(40)]) {
      const av = voiceAvatar(id);
      const diff = Math.abs(av.hueA - av.hueB);
      expect(Math.min(diff, 360 - diff)).toBeGreaterThanOrEqual(40);
    }
  });

  test('un id vacío no revienta y devuelve un avatar neutro estable', () => {
    expect(voiceAvatar('')).toEqual(voiceAvatar(''));
    expect(hashVoiceId('')).toBe(hashVoiceId(''));
  });

  test('el hash es de 32 bits sin signo', () => {
    const h = hashVoiceId('109o5orBWJUFCKODv4Rd');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});

// ─── Transformación de /v1/shared-voices ─────────────────────────────────────

const RAW: SharedVoiceRaw = {
  public_owner_id: '64cbc624eb5aab4e95a968e1f41d75402277cca6e549036ed17e56ea33bbbc9e',
  voice_id: '109o5orBWJUFCKODv4Rd',
  name: 'Valentina - Lively and animated',
  accent: 'latin american',
  gender: '',
  age: '',
  descriptive: 'confident',
  use_case: 'entertainment_tv',
  category: 'high_quality',
  language: 'es',
  locale: 'es-AR',
  description: 'A vibrant, expressive voice.',
  preview_url: 'https://api.us.elevenlabs.io/v1/voices/109o5orBWJUFCKODv4Rd/previews/audio?payload=x',
  free_users_allowed: true,
  featured: false,
  cloned_by_count: 7,
};

describe('normalizeSharedVoice: de la respuesta cruda a la tarjeta', () => {
  test('conserva id, propietario, nombre, preview y descripción', () => {
    const v = normalizeSharedVoice(RAW);
    expect(v.voice_id).toBe('109o5orBWJUFCKODv4Rd');
    expect(v.public_owner_id).toBe(RAW.public_owner_id);
    expect(v.name).toBe('Valentina - Lively and animated');
    expect(v.preview_url).toBe(RAW.preview_url);
    expect(v.description).toBe('A vibrant, expressive voice.');
    expect(v.free_users_allowed).toBe(true);
  });

  test('las etiquetas vacías se descartan y las llenas se traducen', () => {
    const v = normalizeSharedVoice(RAW);
    const keys = v.tags.map((t) => t.key);
    expect(keys).not.toContain('gender');
    expect(keys).not.toContain('age');
    expect(v.tags.find((t) => t.key === 'language')?.label).toBe('Español');
    expect(v.tags.find((t) => t.key === 'accent')?.label).toBe('Latinoamericano');
    expect(v.tags.find((t) => t.key === 'use_case')?.label).toBe('Entretenimiento y TV');
  });

  test('el género y la edad se traducen cuando llegan', () => {
    const v = normalizeSharedVoice({ ...RAW, gender: 'female', age: 'middle_aged' });
    expect(v.tags.find((t) => t.key === 'gender')?.label).toBe('Femenina');
    expect(v.tags.find((t) => t.key === 'age')?.label).toBe('Adulta');
  });

  test('preview_url ausente queda en null, nunca en cadena vacía', () => {
    const v = normalizeSharedVoice({ ...RAW, preview_url: '' });
    expect(v.preview_url).toBeNull();
  });

  test('una etiqueta desconocida se muestra legible en vez de con guiones bajos', () => {
    expect(libraryLabel('use_case', 'informative_educational')).toBe('Informativo y educativo');
    expect(libraryLabel('use_case', 'algo_nuevo_raro')).toBe('Algo nuevo raro');
    expect(libraryLabel('language', 'en')).toBe('Inglés');
    expect(libraryLabel('language', 'zz')).toBe('ZZ');
  });
});

describe('buildSharedVoicesQuery: filtros → query string del proveedor', () => {
  test('por defecto: español, primera página y tamaño de página fijo', () => {
    const q = buildSharedVoicesQuery({});
    expect(q.get('language')).toBe('es');
    expect(q.get('page')).toBe('0');
    expect(q.get('page_size')).toBe(String(LIBRARY_PAGE_SIZE));
    expect(q.get('search')).toBeNull();
  });

  test('los filtros vacíos no viajan; los llenos sí, recortados', () => {
    const q = buildSharedVoicesQuery({ search: '  colombia ', gender: 'female', use_case: '', language: 'en', page: 3 });
    expect(q.get('search')).toBe('colombia');
    expect(q.get('gender')).toBe('female');
    expect(q.get('use_cases')).toBeNull();
    expect(q.get('use_case')).toBeNull();
    expect(q.get('language')).toBe('en');
    expect(q.get('page')).toBe('3');
  });

  test('R0 · el caso de uso viaja como `use_cases` (plural): `use_case` no filtra en la API real', () => {
    // Capturado en vivo el 2026-09-14: use_case=conversational → 7.772 (= sin filtro);
    // use_cases=conversational → 1.924. Ver fixtures/sharedVoicesUseCases.json.
    const q = buildSharedVoicesQuery({ use_case: 'conversational' });
    expect(q.get('use_cases')).toBe('conversational');
    expect(q.get('use_case')).toBeNull();
  });

  test('«todos los idiomas» se expresa sin filtro de idioma', () => {
    const q = buildSharedVoicesQuery({ language: 'all' });
    expect(q.get('language')).toBeNull();
  });

  test('página negativa o no numérica se normaliza a 0', () => {
    expect(buildSharedVoicesQuery({ page: -4 }).get('page')).toBe('0');
    expect(buildSharedVoicesQuery({ page: Number.NaN }).get('page')).toBe('0');
  });

  test('valores fuera del catálogo de filtros no se reenvían al proveedor', () => {
    const q = buildSharedVoicesQuery({ gender: "female' OR 1=1", use_case: 'DROP TABLE' });
    expect(q.get('gender')).toBeNull();
    expect(q.get('use_cases')).toBeNull();
  });

  test('la búsqueda se limita a 80 caracteres', () => {
    const q = buildSharedVoicesQuery({ search: 'a'.repeat(200) });
    expect(q.get('search')?.length).toBe(80);
  });
});

describe('describeLibraryError: errores del proveedor en lenguaje humano', () => {
  test('voz solo para planes de pago', () => {
    const msg = describeLibraryError({ status: 400, code: 'paid_plan_required' });
    expect(msg).toMatch(/plan de pago/i);
    expect(msg).not.toMatch(/upgrade your plan/i);
  });

  test('clonación no incluida en el plan (visto en vivo el 2026-09-14 con plan gratuito)', () => {
    // El proveedor responde code=paid_plan_required y status=can_not_use_instant_voice_cloning;
    // el cliente prefiere el status por ser más específico.
    const msg = describeLibraryError({ status: 400, code: 'can_not_use_instant_voice_cloning' });
    expect(msg).toMatch(/clonar/i);
    expect(msg).toMatch(/plan/i);
  });

  test('402 sin código conocido también habla del plan', () => {
    expect(describeLibraryError({ status: 402 })).toMatch(/plan/i);
  });

  test('sin huecos de voz en el workspace', () => {
    expect(describeLibraryError({ status: 400, code: 'voice_limit_reached' })).toMatch(/límite de voces/i);
  });

  test('clave inválida o sin permisos', () => {
    expect(describeLibraryError({ status: 401 })).toMatch(/clave/i);
  });

  test('sin código conocido devuelve el mensaje del proveedor si existe, sin inventar', () => {
    expect(describeLibraryError({ status: 500, message: 'Kaboom' })).toContain('Kaboom');
    expect(describeLibraryError({ status: 500 })).toMatch(/ElevenLabs/);
  });
});

// ─── Guion de clonación y validación del flujo ──────────────────────────────

describe('CLONE_SCRIPT_ES: guion que se muestra en pantalla', () => {
  test('dura entre 60 y 90 segundos a ritmo de lectura normal', () => {
    const s = estimateReadingSeconds(CLONE_SCRIPT_ES);
    expect(s).toBeGreaterThanOrEqual(60);
    expect(s).toBeLessThanOrEqual(90);
  });

  test('cubre fonemas variados del español (ñ, rr, ll, j, z/c, ch, diptongos, números)', () => {
    const t = CLONE_SCRIPT_ES.toLowerCase();
    expect(t).toMatch(/ñ/);
    expect(t).toMatch(/rr/);
    expect(t).toMatch(/ll/);
    expect(t).toMatch(/j/);
    expect(t).toMatch(/ch/);
    expect(t).toMatch(/[zc][ei]/);
    expect(t).toMatch(/gu[ei]/);
    expect(t).toMatch(/[aeo]i|[aeo]u|ue|ie|ua/);
    expect(t).toMatch(/\d/);
    // Interrogación y exclamación para entonación.
    expect(t).toMatch(/¿.+\?/);
    expect(t).toMatch(/¡.+!/);
  });

  test('está en español neutro: sin voseo ni regionalismos marcados', () => {
    const t = CLONE_SCRIPT_ES.toLowerCase();
    expect(t).not.toMatch(/\bvos\b/);
    expect(t).not.toMatch(/\bparce\b/);
  });

  test('es un texto por párrafos, sin líneas kilométricas', () => {
    for (const p of CLONE_SCRIPT_ES.split('\n\n')) {
      expect(p.length).toBeLessThanOrEqual(420);
    }
    expect(CLONE_SCRIPT_VERSION).toMatch(/^es-\d+$/);
  });

  test('estimateReadingSeconds es proporcional a las palabras', () => {
    expect(estimateReadingSeconds('')).toBe(0);
    expect(estimateReadingSeconds('una dos tres cuatro cinco', 150)).toBe(2);
  });
});

describe('HABEAS_DATA_TEXT: consentimiento que se guarda como evidencia', () => {
  test('cita la Ley 1581 de 2012, la política de ElevenLabs y el derecho a retirarlo', () => {
    expect(HABEAS_DATA_TEXT).toMatch(/1581/);
    expect(HABEAS_DATA_TEXT).toMatch(/ElevenLabs/);
    expect(HABEAS_DATA_TEXT).toMatch(/retirar|revocar|eliminar/i);
  });
});

describe('validateCloneStep: cada paso bloquea con motivo', () => {
  const base = {
    consent: false,
    sample: null as null | { durationSeconds: number; bytes: number },
    name: '',
  };

  test('paso 1 exige la casilla de consentimiento', () => {
    expect(validateCloneStep(1, base)).toEqual([expect.stringMatching(/consentimiento/i)]);
    expect(validateCloneStep(1, { ...base, consent: true })).toEqual([]);
  });

  test('paso 2 exige una muestra de duración razonable', () => {
    expect(validateCloneStep(2, { ...base, consent: true })).toEqual([expect.stringMatching(/graba/i)]);
    expect(
      validateCloneStep(2, { ...base, consent: true, sample: { durationSeconds: MIN_SAMPLE_SECONDS - 1, bytes: 1000 } })
    ).toEqual([expect.stringMatching(new RegExp(`${MIN_SAMPLE_SECONDS}`))]);
    expect(
      validateCloneStep(2, { ...base, consent: true, sample: { durationSeconds: MAX_SAMPLE_SECONDS + 1, bytes: 1000 } })
    ).toEqual([expect.stringMatching(/larga/i)]);
    expect(
      validateCloneStep(2, { ...base, consent: true, sample: { durationSeconds: 70, bytes: 11 * 1024 * 1024 } })
    ).toEqual([expect.stringMatching(/10 MB/)]);
    expect(validateCloneStep(2, { ...base, consent: true, sample: { durationSeconds: 70, bytes: 900_000 } })).toEqual([]);
  });

  test('paso 3 (escuchar) no exige nada nuevo si la muestra es válida', () => {
    expect(validateCloneStep(3, { ...base, consent: true, sample: { durationSeconds: 70, bytes: 900_000 } })).toEqual([]);
  });

  test('paso 4 exige nombre de 2 a 60 caracteres y arrastra los errores anteriores', () => {
    const ok = { ...base, consent: true, sample: { durationSeconds: 70, bytes: 900_000 } };
    expect(validateCloneStep(4, ok)).toEqual([expect.stringMatching(/nombre/i)]);
    expect(validateCloneStep(4, { ...ok, name: 'a' })).toEqual([expect.stringMatching(/nombre/i)]);
    expect(validateCloneStep(4, { ...ok, name: 'x'.repeat(61) })).toEqual([expect.stringMatching(/nombre/i)]);
    expect(validateCloneStep(4, { ...ok, name: 'Mi voz comercial' })).toEqual([]);
    // Sin consentimiento, el paso 4 también falla: no se puede saltar el paso 1.
    expect(validateCloneStep(4, { ...ok, consent: false, name: 'Mi voz' })).toEqual([expect.stringMatching(/consentimiento/i)]);
  });
});

describe('sha256Hex: implementación pura, contrastada con el vector de referencia', () => {
  test('sha256("abc") coincide con el estándar', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('buildConsentEvidence: lo que se guarda en consent_evidence', () => {
  test('incluye versión del guion, hash del texto de Habeas Data, momento y datos de la muestra', () => {
    const ev = buildConsentEvidence({
      acceptedAt: '2026-09-14T15:00:00.000Z',
      userId: 'u-1',
      sample: { durationSeconds: 71.4, bytes: 812_000, mimeType: 'audio/webm' },
      userAgent: 'jest',
    });
    expect(ev.method).toBe('instant_voice_cloning');
    expect(ev.script_version).toBe(CLONE_SCRIPT_VERSION);
    expect(typeof ev.habeas_data_sha256).toBe('string');
    expect((ev.habeas_data_sha256 as string).length).toBe(64);
    expect(ev.accepted_at).toBe('2026-09-14T15:00:00.000Z');
    expect(ev.accepted_by).toBe('u-1');
    expect(ev.sample).toEqual({ duration_seconds: 71.4, bytes: 812_000, mime_type: 'audio/webm' });
    expect(ev.user_agent).toBe('jest');
    // Nunca el audio ni el texto completo: solo su huella.
    expect(JSON.stringify(ev)).not.toContain(HABEAS_DATA_TEXT.slice(0, 40));
  });
});
