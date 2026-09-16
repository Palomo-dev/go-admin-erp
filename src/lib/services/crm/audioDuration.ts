/**
 * Duración de un audio a partir de sus bytes, sin dependencias (R9 · ronda 2
 * de Voces). El servidor no se fía de `duration_seconds` del cliente: mide lo
 * que puede y, si no puede, devuelve `null` y la evidencia lo declara.
 *
 * Formatos: WAV PCM (cabecera RIFF, exacto), WebM/Matroska con `Duration` en
 * `Info` (lo escriben los conversores; MediaRecorder de Chrome no lo escribe)
 * y MP3 (Xing/Info para VBR; CBR estimado por bitrate del primer frame).
 *
 * Ronda 3 [seguridad]: la entrada es un archivo subido por cualquier admin de
 * organización, así que el analizador es hostil por defecto: comprueba
 * límites en cada lectura, acota el tamaño de los escalares (8 bytes), el
 * número de elementos y los bytes recorridos, exige un segundo frame para
 * creerse un sync de MP3, rechaza duraciones > 1 h y NUNCA lanza.
 */

/** Por encima de esto la medida es basura (Xing absurdo, byteRate 1): `null`. */
export const MAX_MEASURABLE_SECONDS = 3600;
const MAX_SCAN_BYTES = 1 << 20;
const MAX_ELEMENTS = 4096;
const MAX_SCALAR_BYTES = 8;

function ascii(bytes: Uint8Array, off: number, len: number): string {
  if (off < 0 || off + len > bytes.length) return '';
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[off + i]);
  return s;
}

/** Entero big-endian de `size` bytes; `null` si se sale del archivo o pasa de 8 bytes. */
function readUint(bytes: Uint8Array, off: number, size: number): number | null {
  if (size < 0 || size > MAX_SCALAR_BYTES || off < 0 || off + size > bytes.length) return null;
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + bytes[off + i];
  return v;
}

// ─── WAV ─────────────────────────────────────────────────────────────────────

function wavDuration(bytes: Uint8Array): number | null {
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 12;
  let byteRate = 0;
  for (let n = 0; n < MAX_ELEMENTS && off + 8 <= bytes.length; n++) {
    const id = ascii(bytes, off, 4);
    const size = view.getUint32(off + 4, true);
    if (id === 'fmt ' && off + 32 <= bytes.length) byteRate = view.getUint32(off + 16, true);
    if (id === 'data') {
      if (!byteRate) return null;
      return Math.min(size, bytes.length - off - 8) / byteRate;
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

// ─── WebM / Matroska ─────────────────────────────────────────────────────────

function readVint(bytes: Uint8Array, off: number): { value: number; length: number; unknown: boolean } | null {
  if (off < 0 || off >= bytes.length) return null;
  const first = bytes[off];
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && !(first & mask)) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || off + length > bytes.length) return null;
  let value = first & (mask - 1);
  let allOnes = value === mask - 1;
  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[off + i];
    if (bytes[off + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: allOnes };
}

function readId(bytes: Uint8Array, off: number): { id: number; length: number } | null {
  const v = readVint(bytes, off);
  if (!v) return null;
  let id = 0;
  for (let i = 0; i < v.length; i++) id = id * 256 + bytes[off + i];
  return { id, length: v.length };
}

const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;

/** Float IEEE de 4 u 8 bytes; `null` si otro tamaño o si se sale del archivo. */
function readFloat(bytes: Uint8Array, off: number, size: number): number | null {
  if (off < 0 || off + size > bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (size === 4) return view.getFloat32(off);
  if (size === 8) return view.getFloat64(off);
  return null;
}

function webmDuration(bytes: Uint8Array): number | null {
  if (readUint(bytes, 0, 4) !== 0x1a45dfa3) return null;
  let off = 0;
  const limit = Math.min(bytes.length, MAX_SCAN_BYTES);
  let scale = 1_000_000;
  for (let n = 0; n < MAX_ELEMENTS && off < limit; n++) {
    const id = readId(bytes, off);
    if (!id) return null;
    const size = readVint(bytes, off + id.length);
    if (!size) return null;
    const dataOff = off + id.length + size.length;
    if (id.id === ID_SEGMENT || id.id === ID_INFO) {
      off = dataOff; // entramos en el contenedor
      continue;
    }
    if (size.unknown) return null;
    // Escalares: `readUint`/`readFloat` devuelven null si pasan de 8 bytes o se
    // salen del archivo (un tamaño declarado de 2^40 ya no se recorre: se rechaza).
    if (id.id === ID_TIMECODE_SCALE) {
      const s = readUint(bytes, dataOff, size.value);
      if (s === null) return null;
      scale = s;
    } else if (id.id === ID_DURATION) {
      const duration = readFloat(bytes, dataOff, size.value);
      return duration === null ? null : (duration * scale) / 1e9;
    }
    off = dataOff + size.value;
  }
  return null;
}

// ─── MP3 ─────────────────────────────────────────────────────────────────────

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

interface Mp3Header {
  version: number;
  bitrate: number;
  sampleRate: number;
  frameLength: number;
  samplesPerFrame: number;
  /** Desplazamiento de la cabecera Xing/Info respecto al inicio del frame. */
  xingOffset: number;
}

/** Cabecera de frame MPEG Layer III en `off`; `null` si no lo es. */
function mp3Header(bytes: Uint8Array, off: number): Mp3Header | null {
  if (off + 4 > bytes.length || bytes[off] !== 0xff || (bytes[off + 1] & 0xe0) !== 0xe0) return null;
  const version = (bytes[off + 1] >> 3) & 0x3;
  const layer = (bytes[off + 1] >> 1) & 0x3;
  if (version === 1 || layer !== 1) return null; // solo Layer III
  const bitrate = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bytes[off + 2] >> 4];
  const sampleRate = SAMPLE_RATES[version]?.[(bytes[off + 2] >> 2) & 0x3];
  if (!bitrate || !sampleRate) return null;
  const padding = (bytes[off + 2] >> 1) & 0x1;
  const mono = (bytes[off + 3] >> 6) === 3;
  return {
    version,
    bitrate,
    sampleRate,
    frameLength: Math.floor(((version === 3 ? 144 : 72) * bitrate * 1000) / sampleRate) + padding,
    samplesPerFrame: version === 3 ? 1152 : 576,
    xingOffset: 4 + (version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17),
  };
}

function mp3Duration(bytes: Uint8Array): number | null {
  let off = 0;
  if (ascii(bytes, 0, 3) === 'ID3' && bytes.length >= 10) {
    off = 10 + ((bytes[6] & 0x7f) << 21) + ((bytes[7] & 0x7f) << 14) + ((bytes[8] & 0x7f) << 7) + (bytes[9] & 0x7f);
  }
  const limit = Math.min(bytes.length - 4, off + 65536);
  for (; off < limit; off++) {
    const h = mp3Header(bytes, off);
    if (!h) continue;
    // Un sync aislado sale por azar en cualquier basura: se exige que el frame
    // siguiente exista y sea coherente (misma versión y frecuencia).
    const next = mp3Header(bytes, off + h.frameLength);
    if (!next || next.version !== h.version || next.sampleRate !== h.sampleRate) continue;
    const tag = ascii(bytes, off + h.xingOffset, 4);
    if ((tag === 'Xing' || tag === 'Info') && (readUint(bytes, off + h.xingOffset + 7, 1) ?? 0) & 0x1) {
      const frames = readUint(bytes, off + h.xingOffset + 8, 4);
      return frames === null ? null : (frames * h.samplesPerFrame) / h.sampleRate;
    }
    return ((bytes.length - off) * 8) / (h.bitrate * 1000);
  }
  return null;
}

// ─── Entrada única ───────────────────────────────────────────────────────────

export function measureAudioDurationSeconds(bytes: Uint8Array, mimeType?: string | null): number | null {
  if (bytes.length === 0) return null;
  try {
    const mime = (mimeType ?? '').toLowerCase();
    let out: number | null;
    if (mime.includes('wav')) out = wavDuration(bytes);
    else if (mime.includes('webm') || mime.includes('matroska')) out = webmDuration(bytes);
    else if (mime.includes('mpeg') || mime.includes('mp3')) out = mp3Duration(bytes);
    else out = wavDuration(bytes) ?? webmDuration(bytes) ?? mp3Duration(bytes);
    if (out === null || !Number.isFinite(out) || out <= 0 || out > MAX_MEASURABLE_SECONDS) return null;
    return Math.round(out * 10) / 10;
  } catch {
    // Un archivo malformado nunca es un 500: simplemente no se pudo medir.
    return null;
  }
}
