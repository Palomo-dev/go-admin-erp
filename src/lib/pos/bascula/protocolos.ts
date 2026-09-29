/**
 * Intérprete único de protocolos de báscula (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.8). Lo usan todos los transportes (Go Admin Desktop, Web Serial y, más
 * adelante, BLE): el Desktop solo entrega bytes.
 *
 * Dos piezas puras:
 * - `DivisorTramas`: junta los pedazos que llegan del puerto y los corta en
 *   tramas completas según el protocolo (fin de línea, STX…CR, SOH…EOT).
 * - `interpretarTrama(protocolo, trama)`: una trama completa → `LecturaTrama`
 *   o `null` si no la reconoce (la prueba de lectura muestra entonces los
 *   bytes crudos y sugiere el protocolo que sí la entiende).
 *
 * Tramas soportadas (fixtures en src/lib/pos/bascula/__tests__):
 * - Continuo «ST,GS» (A&D, CAS, indicadores genéricos): `ST,GS,+00.735kg`.
 *   Cabecera 1: ST estable · US inestable · OL sobrecarga. Cabecera 2: GS/GW
 *   bruto · NT/NW neto · TR/TW tara (no es una pesada: se ignora).
 * - Mettler Toledo 8217: el POS pide `W`; la báscula responde `STX 00.735 CR`
 *   con el peso estable, o `STX ? <estado> CR` con el byte de estado (bit 0
 *   en movimiento, bit 1 sobrecarga, bit 2 bajo cero).
 * - Mettler SICS: el POS pide `SI` (inmediato); `S S     0.735 kg` estable,
 *   `S D     0.735 kg` dinámico, `S +` sobrecarga, `S -` bajo cero, `S I`
 *   ocupado, `ES`/`ET`/`EL` error.
 * - CAS PD-II: el POS manda ENQ, la báscula responde ACK, el POS manda DC1 y
 *   llega `SOH STX <S|U> <signo> <peso 6> <unidad 2> BCC ETX EOT`. El BCC no
 *   se verifica (varía por firmware).
 * - Dibal: PENDIENTE — no hay trama documentada y validada con un equipo; se
 *   devuelve null y la prueba muestra los bytes crudos.
 * - Propio: expresión regular de JavaScript con grupos con nombre `peso`
 *   (obligatorio), `signo`, `estado` y `unidad`.
 */

import type { EstadoTrama, LecturaTrama, OpcionesInterpretar, ProtocoloBascula } from './tipos';
import { PROTOCOLOS_BASCULA } from './tipos';

export const STX = 0x02;
export const ETX = 0x03;
export const EOT = 0x04;
export const ENQ = 0x05;
export const ACK = 0x06;
export const SOH = 0x01;
export const DC1 = 0x11;
export const CR = 0x0d;
export const LF = 0x0a;

/** Tamaño máximo de una trama: más que esto sin terminador es basura del puerto. */
export const MAX_TRAMA = 256;

const ascii = (texto: string): Uint8Array => Uint8Array.from(texto, (c) => c.charCodeAt(0) & 0xff);

/** Cómo se habla con cada protocolo. */
export interface DescriptorProtocolo {
  /** Bytes que el POS manda periódicamente para pedir el peso (null = la báscula manda sola). */
  peticion: Uint8Array | null;
  intervaloMs: number;
  /** CAS PD-II: lo que se manda al recibir ACK. */
  respuestaAck: Uint8Array | null;
  /** Comando de cero de la báscula; sin él, el cero se hace en el POS. */
  comandoCero: Uint8Array | null;
  /** Cómo se cortan las tramas. */
  corte: 'linea' | 'soh_eot';
  pendiente: boolean;
}

export const DESCRIPTORES: Record<ProtocoloBascula, DescriptorProtocolo> = {
  continuous_st_gs: { peticion: null, intervaloMs: 0, respuestaAck: null, comandoCero: null, corte: 'linea', pendiente: false },
  toledo_8217: { peticion: ascii('W'), intervaloMs: 200, respuestaAck: null, comandoCero: ascii('Z'), corte: 'linea', pendiente: false },
  mettler_sics: { peticion: ascii('SI\r\n'), intervaloMs: 200, respuestaAck: null, comandoCero: ascii('Z\r\n'), corte: 'linea', pendiente: false },
  cas_pd2: { peticion: Uint8Array.of(ENQ), intervaloMs: 250, respuestaAck: Uint8Array.of(DC1), comandoCero: null, corte: 'soh_eot', pendiente: false },
  dibal: { peticion: null, intervaloMs: 0, respuestaAck: null, comandoCero: null, corte: 'linea', pendiente: true },
  custom_regex: { peticion: null, intervaloMs: 0, respuestaAck: null, comandoCero: null, corte: 'linea', pendiente: false },
};

export function esProtocolo(valor: unknown): valor is ProtocoloBascula {
  return typeof valor === 'string' && (PROTOCOLOS_BASCULA as readonly string[]).includes(valor);
}

// ── Utilidades ──────────────────────────────────────────────────────────────

function aTexto(trama: Uint8Array | string): string {
  if (typeof trama === 'string') return trama;
  let s = '';
  for (const b of trama) s += String.fromCharCode(b);
  return s;
}

/** Quita caracteres de control (STX, CR, LF, NUL…) de los extremos. */
function limpiar(texto: string): string {
  // eslint-disable-next-line no-control-regex
  return texto.replace(/^[\x00-\x1f\s]+|[\x00-\x1f\s]+$/g, '');
}

/**
 * Número de la trama. Con punto o coma decimal se lee tal cual; sin
 * separador, se aplican los decimales implícitos de la báscula.
 */
export function leerNumero(texto: string, decimalesImplicitos = 0): number | null {
  const t = texto.replace(/\s+/g, '');
  const m = /^([+-])?(\d+(?:[.,]\d*)?|[.,]\d+)$/.exec(t);
  if (!m) return null;
  const signo = m[1] === '-' ? -1 : 1;
  const cuerpo = m[2];
  let n: number;
  if (/[.,]/.test(cuerpo)) n = Number(cuerpo.replace(',', '.'));
  else n = Number(cuerpo) / 10 ** Math.max(0, Math.min(6, decimalesImplicitos));
  if (!Number.isFinite(n)) return null;
  // Evita -0 en «-0.000».
  const v = signo * n;
  return v === 0 ? 0 : v;
}

/** Unidad normalizada: 'KG', 'LB', 'G', 'OZ' o null. */
export function normalizarUnidad(texto: string | null | undefined): string | null {
  const u = (texto ?? '').trim().toLowerCase();
  if (!u) return null;
  if (u === 'kg' || u === 'k' || u === 'kgs') return 'KG';
  if (u === 'lb' || u === 'lbs' || u === 'l' || u === '#') return 'LB';
  if (u === 'g' || u === 'gr' || u === 'grs') return 'G';
  if (u === 'oz') return 'OZ';
  return u.toUpperCase();
}

function lectura(peso: number | null, extra: Partial<LecturaTrama> = {}): LecturaTrama {
  const estado: EstadoTrama = extra.estado ?? (peso !== null && peso < 0 ? 'bajo_cero' : 'ok');
  return {
    neto: peso,
    bruto: extra.netoDeBascula ? null : peso,
    tara: null,
    unidad: null,
    estable: false,
    netoDeBascula: false,
    ...extra,
    estado,
  };
}

// ── Continuo ST,GS ─────────────────────────────────────────────────────────

function interpretarStGs(texto: string, op: OpcionesInterpretar): LecturaTrama | null {
  const m = /^(ST|US|OL|QT)\s*,\s*(GS|GW|NT|NW|TR|TW)\s*,?\s*(.*)$/i.exec(texto);
  if (!m) return null;
  const cab1 = m[1].toUpperCase();
  const cab2 = m[2].toUpperCase();
  if (cab2 === 'TR' || cab2 === 'TW') return null; // informa la tara, no es una pesada
  const netoDeBascula = cab2 === 'NT' || cab2 === 'NW';
  const d = /^([+-]?\s*[\d.,\s]*\d[\d.,]*)\s*,?\s*([a-zA-Z#]{1,3})?\s*$/.exec(m[3].trim());
  if (cab1 === 'OL') {
    return lectura(null, { estado: 'sobrecarga', estable: false, netoDeBascula, unidad: normalizarUnidad(d?.[2]) });
  }
  if (!d) return null;
  const peso = leerNumero(d[1], op.decimales);
  if (peso === null) return null;
  return lectura(peso, { estable: cab1 === 'ST', netoDeBascula, unidad: normalizarUnidad(d[2]) });
}

// ── Mettler Toledo 8217 ────────────────────────────────────────────────────

function interpretarToledo(texto: string, op: OpcionesInterpretar): LecturaTrama | null {
  if (texto.startsWith('?')) {
    const estado = texto.charCodeAt(1);
    if (!Number.isFinite(estado)) return null;
    if (estado & 0b010) return lectura(null, { estado: 'sobrecarga' });
    if (estado & 0b100) return lectura(null, { estado: 'bajo_cero' });
    if (estado & 0b001) return lectura(null, { estable: false });
    // Estado sin banderas de error ni movimiento (p. ej. fuera del rango de captura de cero).
    return lectura(null, { estado: 'error' });
  }
  const m = /^([+-]?\s*[\d.,\s]*\d[\d.,]*)\s*([a-zA-Z#]{1,3})?$/.exec(texto);
  if (!m) return null;
  const peso = leerNumero(m[1], op.decimales);
  if (peso === null) return null;
  return lectura(peso, { estable: true, unidad: normalizarUnidad(m[2]) });
}

// ── Mettler SICS ───────────────────────────────────────────────────────────

function interpretarSics(texto: string): LecturaTrama | null {
  if (/^E[STL]$/.test(texto)) return lectura(null, { estado: 'error' });
  const m = /^(S|SI|SU|SIU)\s+(\S)(?:\s+(.*))?$/.exec(texto);
  if (!m) return null;
  const estado = m[2];
  if (estado === '+') return lectura(null, { estado: 'sobrecarga' });
  if (estado === '-') return lectura(null, { estado: 'bajo_cero' });
  if (estado === 'I') return lectura(null, { estable: false });
  if (estado !== 'S' && estado !== 'D') return null;
  const d = /^([+-]?\s*[\d.,]+)\s*([a-zA-Z#]{1,3})?\s*$/.exec((m[3] ?? '').trim());
  if (!d) return null;
  const peso = leerNumero(d[1]);
  if (peso === null) return null;
  return lectura(peso, { estable: estado === 'S', unidad: normalizarUnidad(d[2]) });
}

// ── CAS PD-II ──────────────────────────────────────────────────────────────

function interpretarCas(texto: string, op: OpcionesInterpretar): LecturaTrama | null {
  const inicio = texto.indexOf(String.fromCharCode(STX));
  const cuerpo = inicio >= 0 ? texto.slice(inicio + 1) : limpiar(texto);
  if (cuerpo.length < 10) return null;
  const sta = cuerpo[0];
  const signo = cuerpo[1];
  const pesoTxt = cuerpo.slice(2, 8);
  const unidad = normalizarUnidad(cuerpo.slice(8, 10));
  if (sta !== 'S' && sta !== 'U' && sta !== 'F') return null;
  if (sta === 'F' || /o/i.test(pesoTxt)) return lectura(null, { estado: 'sobrecarga', unidad });
  const peso = leerNumero(pesoTxt, op.decimales);
  if (peso === null) return null;
  const valor = signo === '-' ? -Math.abs(peso) : peso;
  return lectura(valor, { estable: sta === 'S', unidad });
}

// ── Propio (expresión regular) ─────────────────────────────────────────────

const cachePatrones = new Map<string, RegExp | null>();

function compilar(patron: string): RegExp | null {
  if (cachePatrones.has(patron)) return cachePatrones.get(patron) ?? null;
  let re: RegExp | null = null;
  try {
    re = new RegExp(patron);
  } catch {
    re = null;
  }
  if (cachePatrones.size > 50) cachePatrones.clear();
  cachePatrones.set(patron, re);
  return re;
}

/** Error del patrón propio o null si sirve: debe compilar y tener el grupo `peso`. */
export function validarPatronPropio(patron: string | null | undefined): 'vacio' | 'invalido' | 'sin_grupo_peso' | null {
  const p = (patron ?? '').trim();
  if (!p) return 'vacio';
  if (p.length > 300) return 'invalido';
  const re = compilar(p);
  if (!re) return 'invalido';
  if (!/\(\?<peso>/.test(p)) return 'sin_grupo_peso';
  return null;
}

function interpretarPropio(texto: string, op: OpcionesInterpretar): LecturaTrama | null {
  const p = (op.patron ?? '').trim();
  if (!p) return null;
  const re = compilar(p);
  const g = re?.exec(texto)?.groups;
  if (!g || g.peso === undefined) return null;
  let peso = leerNumero(g.peso, op.decimales);
  if (peso === null) return null;
  if ((g.signo ?? '').trim() === '-') peso = -Math.abs(peso);
  const est = (g.estado ?? '').trim();
  let estado: EstadoTrama = peso < 0 ? 'bajo_cero' : 'ok';
  let estable = true;
  if (est) {
    if (/^(ol|over|o|\+)$/i.test(est)) {
      estado = 'sobrecarga';
      estable = false;
    } else {
      estable = /^(st|s|stable|estable|e)$/i.test(est);
    }
  }
  return lectura(estado === 'sobrecarga' ? null : peso, { estado, estable, unidad: normalizarUnidad(g.unidad) });
}

// ── Punto de entrada ───────────────────────────────────────────────────────

/**
 * Interpreta una trama completa (bytes o texto) según el protocolo.
 * Devuelve null si no la reconoce (o si el protocolo está pendiente).
 */
export function interpretarTrama(
  protocolo: ProtocoloBascula,
  trama: Uint8Array | string,
  opciones: OpcionesInterpretar = {},
): LecturaTrama | null {
  const crudo = aTexto(trama);
  if (protocolo === 'cas_pd2') return interpretarCas(crudo, opciones);
  const texto = limpiar(crudo);
  if (!texto) return null;
  switch (protocolo) {
    case 'continuous_st_gs':
      return interpretarStGs(texto, opciones);
    case 'toledo_8217':
      return interpretarToledo(texto, opciones);
    case 'mettler_sics':
      return interpretarSics(texto);
    case 'custom_regex':
      return interpretarPropio(texto, opciones);
    case 'dibal':
    default:
      return null;
  }
}

// ── Corte de tramas ────────────────────────────────────────────────────────

export type Trama = { tipo: 'datos'; bytes: Uint8Array } | { tipo: 'ack' } | { tipo: 'desborde'; bytes: Uint8Array };

/**
 * Junta los pedazos del puerto y devuelve tramas completas. Un pedazo puede
 * traer media trama o varias; el resto queda para el siguiente.
 */
export class DivisorTramas {
  private buffer: number[] = [];
  private dentro = false;

  constructor(private readonly corte: DescriptorProtocolo['corte']) {}

  static para(protocolo: ProtocoloBascula): DivisorTramas {
    return new DivisorTramas(DESCRIPTORES[protocolo].corte);
  }

  agregar(chunk: Uint8Array): Trama[] {
    const salida: Trama[] = [];
    for (const b of chunk) {
      if (this.corte === 'soh_eot') this.byteSohEot(b, salida);
      else this.byteLinea(b, salida);
      if (this.buffer.length > MAX_TRAMA) {
        salida.push({ tipo: 'desborde', bytes: Uint8Array.from(this.buffer) });
        this.buffer = [];
        this.dentro = false;
      }
    }
    return salida;
  }

  reiniciar(): void {
    this.buffer = [];
    this.dentro = false;
  }

  private byteLinea(b: number, salida: Trama[]): void {
    if (b === CR || b === LF || b === ETX) {
      if (this.buffer.some((x) => x > 0x20)) salida.push({ tipo: 'datos', bytes: Uint8Array.from(this.buffer) });
      this.buffer = [];
      return;
    }
    // STX abre trama (Toledo): descarta lo que hubiera sin terminar.
    if (b === STX) {
      this.buffer = [];
      return;
    }
    this.buffer.push(b);
  }

  private byteSohEot(b: number, salida: Trama[]): void {
    if (!this.dentro) {
      if (b === ACK) salida.push({ tipo: 'ack' });
      else if (b === SOH) {
        this.dentro = true;
        this.buffer = [];
      }
      return;
    }
    if (b === EOT) {
      salida.push({ tipo: 'datos', bytes: Uint8Array.from(this.buffer) });
      this.buffer = [];
      this.dentro = false;
      return;
    }
    this.buffer.push(b);
  }
}

/**
 * Protocolos que entienden estos bytes (para «Probar lectura» con una trama no
 * reconocida). Prueba todos los no pendientes salvo el propio.
 */
export function sugerirProtocolos(bytes: Uint8Array, opciones: OpcionesInterpretar = {}): ProtocoloBascula[] {
  const candidatos: ProtocoloBascula[] = ['continuous_st_gs', 'toledo_8217', 'mettler_sics', 'cas_pd2'];
  const resultado: ProtocoloBascula[] = [];
  for (const p of candidatos) {
    const divisor = DivisorTramas.para(p);
    const tramas = divisor.agregar(bytes);
    const reconoce = tramas.some((t) => t.tipo === 'datos' && interpretarTrama(p, t.bytes, opciones) !== null);
    if (reconoce) resultado.push(p);
  }
  return resultado;
}

/** Bytes crudos para mostrar: texto imprimible y los de control como ‹02›. */
export function bytesLegibles(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    if (b === CR) s += '␍';
    else if (b === LF) s += '␊\n';
    else if (b >= 0x20 && b < 0x7f) s += String.fromCharCode(b);
    else s += `‹${b.toString(16).padStart(2, '0').toUpperCase()}›`;
  }
  return s;
}

/** Bytes en hexadecimal: «53 54 2C 47 53». */
export function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
