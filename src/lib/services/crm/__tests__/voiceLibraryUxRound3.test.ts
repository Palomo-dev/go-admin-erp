/**
 * Rediseño UX de «Agentes IA → Voces» — ronda 3 (2026-09-15).
 *
 * Cierra la lista del tester de la ronda 2 (escritas antes, vistas en rojo):
 *  - H1: el grabador produce `audio/webm;codecs=opus` y la lista blanca lo
 *    rechazaba → grabar y crear nunca funcionaba. Se compara el tipo base y
 *    esta prueba cruza `RECORDER_MIME_CANDIDATES` con `ALLOWED_SAMPLE_MIME`
 *    para que no vuelvan a divergir; H1 se reproduce con un `File` real a
 *    través de `request.formData()` en Node.
 *  - `audioDuration.ts` [seguridad]: nunca lanza, nunca bloquea, nunca inventa.
 *  - El servidor aplica MIN/MAX cuando la duración es `server_measured`.
 *  - Tinta del orbe por la luminancia del color CENTRAL del gradiente.
 *  - Huecos de cobertura del tester: `describeSample`, «se pierde la voz
 *    clonada», tope de `VOICE_ID_RE`, pista del paso 2.
 *  - Guardas estáticas: sin `requestAnimationFrame` para el foco, `MotionConfig`
 *    en la pestaña, R1 con StrictMode.
 */

import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

const mockCreateInstantClone = jest.fn();
jest.mock('@/lib/services/integrations/elevenlabs/voiceCloneClient', () => {
  class ElevenLabsError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, _detail?: unknown, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    ElevenLabsError,
    getElevenLabsClientForOrg: jest.fn(async () => ({ createInstantClone: mockCreateInstantClone })),
  };
});

const mockCtx = { organizationId: 120, userId: 'user-1', supabase: {} as SupabaseClient, roleName: 'Admin de organización', roleId: 2 };
jest.mock('@/lib/utils/orgContext', () => {
  class OrgContextError extends Error {
    statusCode = 401;
    code = 'UNAUTHORIZED';
  }
  return {
    OrgContextError,
    getServerOrgContext: jest.fn(async () => mockCtx),
    requireOrgAdmin: jest.fn(),
  };
});

import { NextRequest } from 'next/server';
import { POST as clonePost } from '@/app/api/crm/voices/clone/route';
import {
  ALLOWED_SAMPLE_MIME,
  cloneVoiceFromSample,
  isAllowedSampleMime,
} from '@/lib/services/crm/voiceCatalogService';
import {
  MAX_SAMPLE_SECONDS,
  MIN_SAMPLE_SECONDS,
  RECORDER_MIME_CANDIDATES,
  baseMimeType,
  measuredDurationError,
} from '@/lib/services/crm/voiceCloneScript';
import { MAX_MEASURABLE_SECONDS, measureAudioDurationSeconds } from '@/lib/services/crm/audioDuration';
import { inkForHues, orbCenterLuminance, voiceAvatar } from '@/lib/services/crm/voiceAvatar';
import { describeVoiceRemoval, sanitizeAddLibraryInput } from '@/lib/services/crm/voiceLibrary';
import { describeRecordHint, describeSample } from '@/components/crm/agentes/voces/cloneSamples';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf8');

/** Supabase mínimo: `insert(...).select('*').single()` devuelve la fila. */
function fakeSupabase() {
  const inserted: Record<string, unknown>[] = [];
  const from = () => ({
    insert: (row: Record<string, unknown>) => {
      inserted.push(row);
      return { select: () => ({ single: async () => ({ data: { id: 'row-1', ...row }, error: null }) }) };
    },
  });
  return { client: { from } as unknown as SupabaseClient, inserted };
}

function wav(seconds: number, sampleRate = 16000): Uint8Array {
  const byteRate = sampleRate * 2;
  const dataSize = Math.round(byteRate * seconds);
  const buf = new Uint8Array(44 + dataSize);
  const v = new DataView(buf.buffer);
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, byteRate, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, 'data'); v.setUint32(40, dataSize, true);
  return buf;
}

async function postClone(files: File[], extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set('name', 'PRUEBA-CLON-R3');
  form.set('consent', 'true');
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  for (const f of files) form.append('samples', f, f.name);
  const req = new NextRequest('http://localhost/api/crm/voices/clone', { method: 'POST', body: form });
  const res = await clonePost(req);
  return { status: res.status, json: (await res.json()) as { success?: boolean; error?: string } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateInstantClone.mockResolvedValue({ voice_id: 'NEW-VOICE', requires_verification: false });
  mockCtx.supabase = fakeSupabase().client;
});

// ─── H1 · grabar y crear ─────────────────────────────────────────────────────

describe('H1 · lo que graba el navegador lo admite el servidor', () => {
  test('cada candidato del grabador pasa la lista blanca por su tipo base', () => {
    for (const mime of RECORDER_MIME_CANDIDATES) {
      expect({ mime, allowed: isAllowedSampleMime(mime) }).toEqual({ mime, allowed: true });
      expect(ALLOWED_SAMPLE_MIME).toContain(baseMimeType(mime));
    }
  });

  test('baseMimeType descarta parámetros, espacios y mayúsculas', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(baseMimeType(' Audio/OGG ; codecs=opus')).toBe('audio/ogg');
    expect(baseMimeType(null)).toBe('');
    expect(isAllowedSampleMime('')).toBe(true); // sin tipo: el proveedor decide
    // Ronda 4: `video/webm` es alias deliberado (así etiqueta Chrome un .webm del selector); otros video/* no.
    expect(isAllowedSampleMime('video/webm;codecs=opus')).toBe(true);
    expect(isAllowedSampleMime('video/mp4')).toBe(false);
    expect(isAllowedSampleMime('text/plain')).toBe(false);
  });

  test('un File real audio/webm;codecs=opus conserva el tipo a través de request.formData() y se acepta', async () => {
    const file = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80])], 'muestra.webm', { type: 'audio/webm;codecs=opus' });
    const form = new FormData();
    form.append('samples', file, file.name);
    const echoed = (await new NextRequest('http://localhost/x', { method: 'POST', body: form }).formData()).get('samples') as File;
    expect(echoed.type).toBe('audio/webm;codecs=opus');

    const { client, inserted } = fakeSupabase();
    const out = await cloneVoiceFromSample(client, 120, {
      name: 'PRUEBA-CLON-R3',
      consentConfirmed: true,
      files: [{ filename: echoed.name, type: echoed.type, size: echoed.size, blob: echoed }],
    });
    expect(out.provider_voice_id).toBe('NEW-VOICE');
    expect(mockCreateInstantClone).toHaveBeenCalledTimes(1);
    expect(inserted[0]).toMatchObject({ organization_id: 120, kind: 'cloned' });
  });

  test('Firefox (audio/ogg;codecs=opus) también; un tipo ajeno sigue en 400', async () => {
    const ogg = new File([new Uint8Array(64)], 'muestra.ogg', { type: 'audio/ogg;codecs=opus' });
    const ok = await postClone([ogg]);
    expect(ok.status).toBe(201);
    const bad = await postClone([new File([new Uint8Array(64)], 'x.txt', { type: 'text/plain' })]);
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatch(/Formato de audio no admitido/);
  });

  test('el grabador toma sus candidatos de la fuente única (sin literal propio)', () => {
    const hook = read('components/crm/agentes/useVoiceRecorder.ts');
    expect(hook).toContain('RECORDER_MIME_CANDIDATES');
    expect(hook).not.toMatch(/["']audio\/webm;codecs=opus["']/);
  });
});

// ─── audioDuration · basura del tester ───────────────────────────────────────

function webm(elements: number[]): Uint8Array {
  return new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...elements]);
}
function prng(seed: number, n: number): Uint8Array {
  const out = new Uint8Array(n);
  let x = seed >>> 0;
  for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out[i] = x & 0xff; }
  return out;
}
/** MP3 MPEG-1 Layer III 128 kbps 44,1 kHz estéreo: cabecera en CADA frame de 417 bytes. */
function mp3(frames: number, xingFrames?: number): Uint8Array {
  const out = new Uint8Array(417 * frames);
  for (let f = 0; f < frames; f++) { out[f * 417] = 0xff; out[f * 417 + 1] = 0xfb; out[f * 417 + 2] = 0x90; out[f * 417 + 3] = 0x00; }
  if (xingFrames !== undefined) {
    const x = 36; // 4 + 32 (estéreo)
    [0x58, 0x69, 0x6e, 0x67].forEach((b, i) => { out[x + i] = b; });
    out[x + 7] = 0x01;
    new DataView(out.buffer).setUint32(x + 8, xingFrames);
  }
  return out;
}

describe('audioDuration · nunca lanza, nunca bloquea, nunca inventa', () => {
  test('WebM con Duration truncado (readFloat fuera de rango) → null, no RangeError', () => {
    const truncated = webm([0x15, 0x49, 0xa9, 0x66, 0x86, 0x44, 0x89, 0x84, 0x45, 0x9c]); // declara 4 bytes, trae 2
    expect(() => measureAudioDurationSeconds(truncated, 'audio/webm')).not.toThrow();
    expect(measureAudioDurationSeconds(truncated, 'audio/webm')).toBeNull();
  });

  test('TimecodeScale con tamaño 2^40 (40 bytes) → null en milisegundos, no en 24 s', () => {
    const bomb = webm([0x15, 0x49, 0xa9, 0x66, 0x88, 0x2a, 0xd7, 0xb1, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const t0 = Date.now();
    expect(measureAudioDurationSeconds(bomb, 'audio/webm')).toBeNull();
    expect(Date.now() - t0).toBeLessThan(200);
  }, 2000);

  test('escalar con tamaño > 8 bytes (tope por escalar) → null, aunque el valor «cuadre»', () => {
    // TimecodeScale declara 9 bytes (cero + 1e6): leerlo «a lo largo» daba 1e6 y medía 5 s.
    const nine = webm([0x15, 0x49, 0xa9, 0x66, 0x94, 0x2a, 0xd7, 0xb1, 0x89, 0, 0, 0, 0, 0, 0, 0x0f, 0x42, 0x40, 0x44, 0x89, 0x84, 0x45, 0x9c, 0x40, 0x00]);
    expect(measureAudioDurationSeconds(nine, 'audio/webm')).toBeNull();
  });

  test('Xing con frames=0xFFFFFFFF (112 millones de segundos) → null; un Xing sensato sí mide', () => {
    expect(measureAudioDurationSeconds(mp3(3, 0xffffffff), 'audio/mpeg')).toBeNull();
    expect(measureAudioDurationSeconds(mp3(3, 1000), 'audio/mpeg')).toBeCloseTo((1000 * 1152) / 44100, 1);
    expect(MAX_MEASURABLE_SECONDS).toBe(3600);
  });

  test('1 MB aleatorio con audio/mpeg → null (el falso sync exige un segundo frame)', () => {
    for (const seed of [7, 99, 2026]) expect(measureAudioDurationSeconds(prng(seed, 1 << 20), 'audio/mpeg')).toBeNull();
    for (const seed of [7, 99]) expect(measureAudioDurationSeconds(prng(seed, 1 << 20), null)).toBeNull();
  });

  test('CBR real con cabecera en cada frame se sigue midiendo', () => {
    expect(measureAudioDurationSeconds(mp3(300), 'audio/mpeg')).toBeCloseTo((300 * 417 * 8) / 128000, 0);
  });

  test('WAV que declara más de una hora → null (cota superior)', () => {
    const long = wav(1, 8000);
    new DataView(long.buffer).setUint32(28, 1, true); // byteRate=1 → 16.000 s
    expect(measureAudioDurationSeconds(long, 'audio/wav')).toBeNull();
  });

  test('basura de 40 bytes con cualquier tipo: siempre null y siempre rápido', () => {
    const t0 = Date.now();
    for (let seed = 1; seed <= 300; seed++) {
      for (const mime of ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', null]) {
        expect(() => measureAudioDurationSeconds(prng(seed, 40), mime)).not.toThrow();
      }
    }
    expect(Date.now() - t0).toBeLessThan(1500);
  }, 3000);
});

// ─── El servidor aplica MIN/MAX cuando midió ─────────────────────────────────

describe('servidor · MIN/MAX_SAMPLE_SECONDS sobre la duración medida', () => {
  test('measuredDurationError: null si no midió o si está en rango; mensaje con la medida si no', () => {
    expect(measuredDurationError(null)).toBeNull();
    expect(measuredDurationError(MIN_SAMPLE_SECONDS)).toBeNull();
    expect(measuredDurationError(MAX_SAMPLE_SECONDS)).toBeNull();
    expect(measuredDurationError(3)).toMatch(/3 s.*20 segundos/);
    expect(measuredDurationError(MAX_SAMPLE_SECONDS + 0.1)).toMatch(/180 segundos/);
  });

  test('una WAV de 3 s medida en el servidor → 400 y no se llama al proveedor, aunque el cliente diga 25', async () => {
    const short = new File([wav(3)], 'corta.wav', { type: 'audio/wav' });
    const res = await postClone([short], { duration_seconds: '25' });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/20 segundos/);
    expect(mockCreateInstantClone).not.toHaveBeenCalled();
  });

  test('una WAV de 25 s medida → 201', async () => {
    const res = await postClone([new File([wav(25)], 'ok.wav', { type: 'audio/wav' })]);
    expect(res.status).toBe(201);
  });
});

// ─── Pista del paso 2 ────────────────────────────────────────────────────────

describe('describeRecordHint: con 0:05 dice lo que falta, no «pulsa Continuar»', () => {
  const base = { recording: false, elapsed: 0, count: 1, totalSeconds: 5, unknownDuration: false };
  test('por debajo del mínimo: faltan N s', () => {
    expect(describeRecordHint(base)).toMatch(/Faltan 15 s/);
    expect(describeRecordHint(base)).not.toMatch(/Continuar/);
  });
  test('en el mínimo: invita a continuar', () => {
    expect(describeRecordHint({ ...base, totalSeconds: 20 })).toMatch(/Continuar/);
  });
  test('con una muestra de duración desconocida no se acusa falta', () => {
    expect(describeRecordHint({ ...base, unknownDuration: true })).toMatch(/Continuar/);
  });
});

// ─── Cobertura que el tester echó en falta ───────────────────────────────────

describe('huecos: describeSample, «se pierde la voz clonada», tope de VOICE_ID_RE', () => {
  test('describeSample con durationUnknown lo dice en vez de 0:00', () => {
    const file = new File([new Uint8Array(1024 * 1024)], 'archivo.mp3', { type: 'audio/mpeg' });
    expect(describeSample({ id: 'a', file, durationSeconds: 0, durationUnknown: true, source: 'file' })).toBe('duración no disponible · 1.0 MB · archivo.mp3');
    expect(describeSample({ id: 'b', file, durationSeconds: 65, source: 'recording' })).toBe('1:05 min · 1.0 MB · grabada aquí');
  });

  test('voz clonada: el diálogo avisa de que se pierde la voz clonada', () => {
    const t = describeVoiceRemoval({ provider: 'elevenlabs', kind: 'cloned', provider_category: 'cloned' });
    expect(t).toContain('se pierde la voz clonada');
    expect(t).toMatch(/No se puede deshacer/);
  });

  test('VOICE_ID_RE: 64 caracteres pasan, 65 no', () => {
    const body = (voice_id: string) => sanitizeAddLibraryInput({ voice_id, public_owner_id: 'o', name: 'n' });
    expect(body('a'.repeat(64))?.voice_id).toHaveLength(64);
    expect(body('a'.repeat(65))).toBeNull();
    expect(body('a b')).toBeNull();
  });
});

// ─── Tinta por el color central del orbe ─────────────────────────────────────

describe('inkForHues: contraste ≥ 4,5:1 en el CENTRO del orbe para todo tono', () => {
  const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  test('24 tonos × 3 separaciones: la tinta elegida contrasta ≥ 4,5 con el color medio', () => {
    const failures: string[] = [];
    for (let hueA = 0; hueA < 360; hueA += 15) {
      for (const gap of [40, 110, 179]) {
        const hueB = (hueA + gap) % 360;
        const ink = inkForHues(hueA, hueB);
        const ratio = contrast(orbCenterLuminance(hueA, hueB), ink === 'light' ? 1 : 0);
        if (ratio < 4.5) failures.push(`${hueA}/${hueB} ${ink} ${ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });
  test('el centro no es el promedio de las luminancias de los extremos', () => {
    // Amarillo (60) y azul (240): la media de luminancias es alta, pero el color medio (gris) es medio.
    expect(orbCenterLuminance(60, 240)).toBeLessThan(0.4);
    expect(voiceAvatar('109o5orBWJUFCKODv4Rd').ink).toBe(inkForHues(voiceAvatar('109o5orBWJUFCKODv4Rd').hueA, voiceAvatar('109o5orBWJUFCKODv4Rd').hueB));
  });
  test('la tinta oscura se pinta negra (la garantía de 4,5 se calcula contra negro)', () => {
    expect(read('components/crm/agentes/voces/VoiceAvatar.tsx')).toContain('"text-black"');
  });
});

// ─── Guardas estáticas de la pestaña ─────────────────────────────────────────

describe('guardas: foco sin rAF, MotionConfig, R1 con StrictMode', () => {
  test('ningún requestAnimationFrame para mover el foco en la pestaña Voces', () => {
    for (const f of ['CloneVoiceWizard.tsx', 'VoiceLibraryFilters.tsx', 'MyVoiceCard.tsx', 'MyVoicesPanel.tsx', 'VoiceLibraryGrid.tsx']) {
      expect({ f, raf: /requestAnimationFrame\s*\(/.test(read(`components/crm/agentes/voces/${f}`)) }).toEqual({ f, raf: false });
    }
  });
  test('la pestaña Voces respeta prefers-reduced-motion con MotionConfig', () => {
    expect(read('components/crm/agentes/VoicesPanel.tsx')).toContain('<MotionConfig reducedMotion="user">');
  });
  test('R1: el foco al título compara el paso anterior, no un guard de montaje (StrictMode ejecuta el efecto dos veces)', () => {
    const wizard = read('components/crm/agentes/voces/CloneVoiceWizard.tsx');
    expect(wizard).toContain('prevStep.current !== step');
    expect(wizard).not.toContain('mounted.current');
  });
  test('«Por defecto» desaparece al predeterminar: la tarjeta devuelve el foco a «Escuchar»', () => {
    const card = read('components/crm/agentes/voces/MyVoiceCard.tsx');
    expect(card).toContain('focusAfterDefault.current = true;');
    expect(card).toMatch(/if \(voice\.is_default && focusAfterDefault\.current\)/);
    expect(card).toMatch(/previewRef\.current\?\.focus\(\)/);
  });
});
