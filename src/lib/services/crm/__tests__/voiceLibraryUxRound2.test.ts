/**
 * Rediseño UX de «Agentes IA → Voces» — ronda 2 (2026-09-14).
 *
 * Cierra los hallazgos del tester sobre lo puro (escritas antes, vistas en rojo):
 *  - R0: `use_cases` contra la respuesta REAL capturada (fixture);
 *  - mutantes: `MIN_SAMPLE_SECONDS` literal y `free_users_allowed` ausente;
 *  - R5: texto de borrado según lo que va a pasar de verdad;
 *  - R9: el servidor sella `recorded_at`, acota `consent_at` y mide la duración;
 *  - R13: `description`/`language` acotados al añadir de la biblioteca;
 *  - juicio de producto: tinta de la inicial por luminancia, acento en cabecera.
 */

import fixture from './fixtures/sharedVoicesUseCases.json';
import { inkForHues, voiceAvatar } from '@/lib/services/crm/voiceAvatar';
import {
  buildSharedVoicesQuery,
  describeVoiceRemoval,
  normalizeSharedVoice,
  sanitizeAddLibraryInput,
  splitCardTags,
  type SharedVoiceRaw,
} from '@/lib/services/crm/voiceLibrary';
import {
  MAX_CLONE_SAMPLES,
  MIN_SAMPLE_SECONDS,
  buildConsentEvidence,
  sanitizeConsentAt,
  summarizeSamples,
  validateCloneStep,
} from '@/lib/services/crm/voiceCloneScript';
import { measureAudioDurationSeconds } from '@/lib/services/crm/audioDuration';

// ─── R0 · contra la respuesta real ───────────────────────────────────────────

describe('R0 · buildSharedVoicesQuery contra la API real capturada', () => {
  test('la query que construimos es exactamente la que la API filtra (use_cases)', () => {
    const q = buildSharedVoicesQuery({ use_case: 'conversational', language: 'es' });
    const right = new URLSearchParams(fixture.queries.right_param_use_cases.query);
    const wrong = new URLSearchParams(fixture.queries.wrong_param_use_case.query);
    expect(q.get('use_cases')).toBe(right.get('use_cases'));
    expect(q.has('use_case')).toBe(false);
    expect(wrong.has('use_case')).toBe(true);
  });

  test('la fixture demuestra que el nombre equivocado devuelve el total sin filtrar', () => {
    const { without_filter, wrong_param_use_case, right_param_use_cases } = fixture.queries;
    expect(wrong_param_use_case.total_count).toBe(without_filter.total_count);
    expect(right_param_use_cases.total_count).toBeLessThan(without_filter.total_count);
    expect(right_param_use_cases.use_cases_of_first_page.every((u) => u === 'conversational')).toBe(true);
    expect(wrong_param_use_case.use_cases_of_first_page.some((u) => u !== 'conversational')).toBe(true);
  });

  test('gender sí viaja con el nombre que la API filtra', () => {
    const q = buildSharedVoicesQuery({ gender: 'female', language: 'es' });
    const real = new URLSearchParams(fixture.queries.gender_female.query);
    expect(q.get('gender')).toBe(real.get('gender'));
    expect(fixture.queries.gender_female.genders_of_first_page.every((g) => g === 'female')).toBe(true);
  });
});

// ─── Mutantes ────────────────────────────────────────────────────────────────

describe('mutantes: free_users_allowed ausente y MIN_SAMPLE_SECONDS literal', () => {
  const raw = fixture.raw_voice_paid_plan as SharedVoiceRaw;

  test('free_users_allowed ausente → la voz es gratuita (no se pinta «Plan de pago»)', () => {
    const { free_users_allowed: _omit, ...sinCampo } = raw;
    void _omit;
    expect(normalizeSharedVoice(sinCampo as SharedVoiceRaw).free_users_allowed).toBe(true);
    expect(normalizeSharedVoice({ ...raw, free_users_allowed: null }).free_users_allowed).toBe(true);
  });

  test('free_users_allowed=false (voz real de la fixture) → «Plan de pago»', () => {
    expect(normalizeSharedVoice(raw).free_users_allowed).toBe(false);
  });

  test('la muestra mínima son 20 segundos, literal, y 5 s se rechaza', () => {
    expect(MIN_SAMPLE_SECONDS).toBe(20);
    const state = { consent: true, name: '' };
    expect(validateCloneStep(2, { ...state, sample: { durationSeconds: 5, bytes: 1000 } })).toEqual([
      expect.stringMatching(/20 segundos/),
    ]);
    expect(validateCloneStep(2, { ...state, sample: { durationSeconds: 19.9, bytes: 1000 } })).toHaveLength(1);
    expect(validateCloneStep(2, { ...state, sample: { durationSeconds: 20, bytes: 1000 } })).toEqual([]);
  });

  test('se admiten hasta 5 muestras (la ruta acepta 5)', () => {
    expect(MAX_CLONE_SAMPLES).toBe(5);
  });
});

// ─── R6 · varias muestras ────────────────────────────────────────────────────

describe('summarizeSamples: varias muestras cuentan juntas', () => {
  test('sin muestras → null; con varias, la duración se suma y el peso es el del archivo mayor', () => {
    expect(summarizeSamples([])).toBeNull();
    expect(
      summarizeSamples([
        { durationSeconds: 8, bytes: 100 },
        { durationSeconds: 14, bytes: 900 },
      ])
    ).toEqual({ durationSeconds: 22, bytes: 900 });
  });

  test('dos grabaciones cortas suman el mínimo y pasan el paso 2', () => {
    const sample = summarizeSamples([
      { durationSeconds: 12, bytes: 100 },
      { durationSeconds: 9, bytes: 100 },
    ]);
    expect(validateCloneStep(2, { consent: true, name: '', sample })).toEqual([]);
  });
});

// ─── R5 · texto de borrado ───────────────────────────────────────────────────

describe('describeVoiceRemoval: el diálogo dice exactamente lo que va a pasar', () => {
  test('voz premade del proveedor: solo se quita del catálogo', () => {
    const t = describeVoiceRemoval({ provider: 'elevenlabs', kind: 'library', provider_category: 'premade' });
    expect(t).toMatch(/catálogo/);
    expect(t).not.toMatch(/ElevenLabs/);
  });

  test('voz añadida desde la biblioteca (professional/generated): también se borra en ElevenLabs si nadie más la usa', () => {
    for (const cat of ['professional', 'generated', 'high_quality']) {
      const t = describeVoiceRemoval({ provider: 'elevenlabs', kind: 'library', provider_category: cat });
      expect(t).toMatch(/también.*ElevenLabs/i);
      expect(t).toMatch(/otra organización/i);
    }
  });

  test('voz clonada: se elimina en ElevenLabs y no se puede deshacer', () => {
    const t = describeVoiceRemoval({ provider: 'elevenlabs', kind: 'cloned', provider_category: 'cloned' });
    expect(t).toMatch(/ElevenLabs/);
    expect(t).toMatch(/no se puede deshacer/i);
  });

  test('sin datos del workspace: se avisa de que puede borrarse también en ElevenLabs', () => {
    const t = describeVoiceRemoval({ provider: 'elevenlabs', kind: 'library', provider_category: null });
    expect(t).toMatch(/ElevenLabs/);
    expect(t).toMatch(/si esta cuenta la copió o clonó/i);
  });

  test('otro proveedor: nunca menciona ElevenLabs', () => {
    expect(describeVoiceRemoval({ provider: 'google', kind: 'library', provider_category: null })).not.toMatch(/ElevenLabs/);
  });
});

// ─── R9 · evidencia sellada por el servidor ──────────────────────────────────

describe('sanitizeConsentAt: el momento del consentimiento no se confía a ciegas', () => {
  const now = Date.parse('2026-09-14T15:00:00.000Z');

  test('un valor reciente y válido se conserva normalizado', () => {
    expect(sanitizeConsentAt('2026-09-14T14:58:00Z', now)).toBe('2026-09-14T14:58:00.000Z');
  });

  test('futuro, muy antiguo o basura → el reloj del servidor', () => {
    expect(sanitizeConsentAt('2030-01-01T00:00:00Z', now)).toBe('2026-09-14T15:00:00.000Z');
    expect(sanitizeConsentAt('2020-01-01T00:00:00Z', now)).toBe('2026-09-14T15:00:00.000Z');
    expect(sanitizeConsentAt('ayer', now)).toBe('2026-09-14T15:00:00.000Z');
    expect(sanitizeConsentAt('', now)).toBe('2026-09-14T15:00:00.000Z');
  });
});

describe('buildConsentEvidence: recorded_at del servidor y origen de la duración', () => {
  test('guarda recorded_at y duration_source sin cambiar la forma de sample', () => {
    const ev = buildConsentEvidence({
      acceptedAt: '2026-09-14T14:58:00.000Z',
      recordedAt: '2026-09-14T15:00:00.000Z',
      userId: 'u-1',
      sample: { durationSeconds: 71.4, bytes: 812_000, mimeType: 'audio/webm' },
      durationSource: 'server_measured',
    });
    expect(ev.recorded_at).toBe('2026-09-14T15:00:00.000Z');
    expect(ev.duration_source).toBe('server_measured');
    expect(ev.sample).toEqual({ duration_seconds: 71.4, bytes: 812_000, mime_type: 'audio/webm' });
  });

  test('sin datos del servidor, lo declara: duración reportada por el cliente', () => {
    const ev = buildConsentEvidence({
      acceptedAt: '2026-09-14T14:58:00.000Z',
      userId: null,
      sample: { durationSeconds: 5, bytes: 10, mimeType: 'audio/mpeg' },
    });
    expect(ev.duration_source).toBe('client_reported');
    expect(ev.recorded_at).toBeNull();
  });
});

function wav(sampleRate: number, channels: number, bits: number, seconds: number): Uint8Array {
  const byteRate = (sampleRate * channels * bits) / 8;
  const dataSize = Math.round(byteRate * seconds);
  const buf = new Uint8Array(44 + dataSize);
  const v = new DataView(buf.buffer);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, (channels * bits) / 8, true);
  v.setUint16(34, bits, true);
  ascii(36, 'data');
  v.setUint32(40, dataSize, true);
  return buf;
}

function webmWithDuration(ms: number): Uint8Array {
  // EBML header mínimo + Segment(tamaño desconocido) > Info > TimecodeScale(1e6) + Duration(float32).
  const bytes: number[] = [
    0x1a, 0x45, 0xdf, 0xa3, 0x80, // EBML header vacío
    0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, // Segment, tamaño desconocido
    0x15, 0x49, 0xa9, 0x66, 0x8b, // Info, 11 bytes
    0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40, // TimecodeScale = 1_000_000
    0x44, 0x89, 0x84, 0, 0, 0, 0, // Duration float32
  ];
  const out = new Uint8Array(bytes);
  new DataView(out.buffer).setFloat32(out.length - 4, ms);
  return out;
}

function mp3Cbr(kbps: number, seconds: number): Uint8Array {
  // Cabecera MPEG-1 Layer III, 44.1 kHz, sin ID3: 0xFFFB + índice de bitrate.
  // Ronda 3: cabecera en CADA frame (como un MP3 real): el analizador exige un
  // segundo frame coherente para no creerse un sync que sale por azar.
  const idx: Record<number, number> = { 64: 0x5, 128: 0x9, 192: 0xc };
  const size = Math.round((kbps * 1000 * seconds) / 8);
  const frame = Math.floor((144 * kbps * 1000) / 44100);
  const out = new Uint8Array(size);
  for (let off = 0; off + 4 <= size; off += frame) {
    out[off] = 0xff;
    out[off + 1] = 0xfb;
    out[off + 2] = (idx[kbps] << 4) | 0x00;
    out[off + 3] = 0x00;
  }
  return out;
}

describe('measureAudioDurationSeconds: el servidor mide lo que puede', () => {
  test('WAV PCM: exacto por cabecera', () => {
    expect(measureAudioDurationSeconds(wav(16000, 1, 16, 2.5), 'audio/wav')).toBeCloseTo(2.5, 2);
  });

  test('WebM con Duration en Info: en segundos', () => {
    expect(measureAudioDurationSeconds(webmWithDuration(5000), 'audio/webm')).toBeCloseTo(5, 2);
  });

  test('MP3 CBR sin ID3: estimado por bitrate', () => {
    expect(measureAudioDurationSeconds(mp3Cbr(128, 30), 'audio/mpeg')).toBeCloseTo(30, 0);
  });

  test('lo que no sabe medir devuelve null, nunca inventa', () => {
    expect(measureAudioDurationSeconds(new Uint8Array([1, 2, 3, 4]), 'audio/webm')).toBeNull();
    expect(measureAudioDurationSeconds(new Uint8Array(0), 'audio/wav')).toBeNull();
    expect(measureAudioDurationSeconds(new Uint8Array(100), 'application/octet-stream')).toBeNull();
  });
});

// ─── R13 · POST /library acotado ─────────────────────────────────────────────

describe('sanitizeAddLibraryInput: el body de «Añadir» se acota', () => {
  const ok = { voice_id: 'E6Ovvm45Mr8G306dTM7t', public_owner_id: 'a'.repeat(64), name: '  Ourania  ' };

  test('campos obligatorios válidos → entrada limpia', () => {
    expect(sanitizeAddLibraryInput(ok)).toEqual({
      voice_id: ok.voice_id,
      public_owner_id: ok.public_owner_id,
      name: 'Ourania',
      description: null,
      language: null,
    });
  });

  test('description se recorta a 500 caracteres y language a un código ISO en minúsculas', () => {
    const out = sanitizeAddLibraryInput({ ...ok, description: 'x'.repeat(900), language: ' ES ' });
    expect(out?.description?.length).toBe(500);
    expect(out?.language).toBe('es');
    expect(sanitizeAddLibraryInput({ ...ok, language: 'es-CO; DROP' })?.language).toBeNull();
    expect(sanitizeAddLibraryInput({ ...ok, description: 42 })?.description).toBeNull();
  });

  test('sin voice_id válido, propietario o nombre → null', () => {
    expect(sanitizeAddLibraryInput(null)).toBeNull();
    expect(sanitizeAddLibraryInput({ ...ok, voice_id: '../x' })).toBeNull();
    expect(sanitizeAddLibraryInput({ ...ok, name: '   ' })).toBeNull();
    expect(sanitizeAddLibraryInput({ ...ok, public_owner_id: '' })).toBeNull();
  });
});

// ─── Juicio de producto ──────────────────────────────────────────────────────

describe('inkForHues: la inicial se lee sobre cualquier orbe', () => {
  test('orbes claros (amarillo, verde, cian) llevan tinta oscura', () => {
    for (const [a, b] of [[60, 100], [90, 130], [150, 190], [170, 60]]) expect(inkForHues(a, b)).toBe('dark');
  });

  test('orbes oscuros (azul, violeta) llevan tinta clara', () => {
    for (const [a, b] of [[240, 280], [260, 300], [230, 270]]) expect(inkForHues(a, b)).toBe('light');
  });

  test('voiceAvatar expone la tinta y sigue siendo determinista', () => {
    const av = voiceAvatar('109o5orBWJUFCKODv4Rd');
    expect(['light', 'dark']).toContain(av.ink);
    expect(av.ink).toBe(inkForHues(av.hueA, av.hueB));
  });
});

describe('splitCardTags: el acento va en la cabecera y ninguna etiqueta se corta', () => {
  const v = normalizeSharedVoice({
    ...(fixture.raw_voice_paid_plan as SharedVoiceRaw),
    gender: 'female',
    age: 'middle_aged',
    accent: 'latin american',
    descriptive: 'pleasant',
    use_case: 'conversational',
  });

  test('cabecera = estilo · acento; etiquetas = idioma, género, edad, uso (4 como máximo, sin recortar)', () => {
    const { headline, tags } = splitCardTags(v);
    expect(headline).toBe('Pleasant · Latinoamericano');
    expect(tags.map((t) => t.key)).toEqual(['language', 'gender', 'age', 'use_case']);
    expect(tags.length).toBeLessThanOrEqual(4);
  });

  test('sin estilo ni acento la cabecera cae al locale', () => {
    const { headline } = splitCardTags({ ...v, tags: v.tags.filter((t) => t.key !== 'accent' && t.key !== 'descriptive') });
    expect(headline).toBe('es-AR');
  });
});
