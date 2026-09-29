/**
 * Formulario «Nueva báscula» / «Editar báscula» (Figma K2/K3): estado,
 * validación y lo que se manda a `pos_basculas_guardar`. Puro.
 */

import { validarPatronPropio } from '@/lib/pos/bascula/protocolos';
import type { ConfigBascula, Paridad, ProtocoloBascula, TransporteBasculaId } from '@/lib/pos/bascula/tipos';
import type { BasculaConfigurada, BasculaPayload } from '@/lib/services/basculasService';

export interface FormularioBascula {
  id: string | null;
  nombre: string;
  sucursalId: number | null;
  cajaId: string | null;
  transporte: TransporteBasculaId;
  dispositivo: string;
  protocolo: ProtocoloBascula;
  patron: string;
  baudios: number;
  bitsDatos: 7 | 8;
  paridad: Paridad;
  bitsParada: 1 | 2;
  unidad: 'KG' | 'LB';
  decimales: number;
  capacidad: number | null;
  division: number | null;
  estableMs: number;
}

export type CampoConError = 'nombre' | 'sucursal' | 'dispositivo' | 'patron' | 'capacidad' | 'division' | 'estableMs' | 'decimales';
export type ErroresFormulario = Partial<Record<CampoConError, string>>;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function formularioInicial(opciones: {
  bascula?: BasculaConfigurada | null;
  sucursalId: number | null;
  transportePorDefecto: TransporteBasculaId;
}): FormularioBascula {
  const b = opciones.bascula;
  if (!b) {
    return {
      id: null,
      nombre: '',
      sucursalId: opciones.sucursalId,
      cajaId: null,
      transporte: opciones.transportePorDefecto,
      dispositivo: '',
      protocolo: 'continuous_st_gs',
      patron: '',
      baudios: 9600,
      bitsDatos: 8,
      paridad: 'none',
      bitsParada: 1,
      unidad: 'KG',
      decimales: 3,
      capacidad: 15,
      division: 0.005,
      estableMs: 500,
    };
  }
  return {
    id: b.id,
    nombre: b.name,
    sucursalId: b.branch_id,
    cajaId: b.pos_terminal_id ?? null,
    transporte: b.transport === 'desktop_serial' ? 'desktop_serial' : 'web_serial',
    dispositivo: b.device_hint ?? '',
    protocolo: (b.protocol as ProtocoloBascula) ?? 'continuous_st_gs',
    patron: b.custom_pattern ?? '',
    baudios: num(b.baud_rate) ?? 9600,
    bitsDatos: num(b.data_bits) === 7 ? 7 : 8,
    paridad: b.parity === 'even' || b.parity === 'odd' ? b.parity : 'none',
    bitsParada: num(b.stop_bits) === 2 ? 2 : 1,
    unidad: (b.unit_code ?? 'KG').trim().toUpperCase() === 'LB' ? 'LB' : 'KG',
    decimales: num(b.decimals) ?? 3,
    capacidad: num(b.capacity_max),
    division: num(b.min_division),
    estableMs: num(b.stable_ms) ?? 500,
  };
}

/** Errores por campo como claves de traducción (`posBascula.config.form.errores.*`). */
export function validarFormulario(f: FormularioBascula): ErroresFormulario {
  const e: ErroresFormulario = {};
  const nombre = f.nombre.trim();
  if (!nombre) e.nombre = 'nombreVacio';
  else if (nombre.length > 80) e.nombre = 'nombreLargo';
  if (!f.sucursalId) e.sucursal = 'sucursal';
  if (f.transporte === 'desktop_serial' && !f.dispositivo.trim()) e.dispositivo = 'puertoDesktop';
  if (f.protocolo === 'custom_regex') {
    const err = validarPatronPropio(f.patron);
    if (err) e.patron = `patron_${err}`;
  }
  if (f.capacidad !== null && !(f.capacidad > 0)) e.capacidad = 'positivo';
  if (f.division !== null && !(f.division > 0)) e.division = 'positivo';
  if (!Number.isInteger(f.estableMs) || f.estableMs < 0 || f.estableMs > 5000) e.estableMs = 'estableMs';
  if (!Number.isInteger(f.decimales) || f.decimales < 0 || f.decimales > 4) e.decimales = 'decimales';
  return e;
}

export function payloadDesdeFormulario(f: FormularioBascula): BasculaPayload {
  return {
    ...(f.id ? { id: f.id } : {}),
    branch_id: f.sucursalId ?? 0,
    name: f.nombre.trim(),
    transport: f.transporte,
    protocol: f.protocolo,
    custom_pattern: f.protocolo === 'custom_regex' ? f.patron.trim() : null,
    device_hint: f.dispositivo.trim() || null,
    pos_terminal_id: f.cajaId || null,
    baud_rate: f.baudios,
    data_bits: f.bitsDatos,
    parity: f.paridad,
    stop_bits: f.bitsParada,
    unit_code: f.unidad,
    decimals: f.decimales,
    capacity_max: f.capacidad,
    min_division: f.division,
    stable_ms: f.estableMs,
  };
}

/** Configuración para «Probar lectura» con lo que está escrito (aún sin guardar). */
export function configDesdeFormulario(f: FormularioBascula): ConfigBascula {
  return {
    id: f.id ?? 'prueba',
    nombre: f.nombre.trim() || '—',
    transporte: f.transporte,
    protocolo: f.protocolo,
    patron: f.protocolo === 'custom_regex' ? f.patron : null,
    dispositivo: f.dispositivo.trim() || null,
    baudios: f.baudios,
    bitsDatos: f.bitsDatos,
    paridad: f.paridad,
    bitsParada: f.bitsParada,
    unidad: f.unidad,
    decimales: f.decimales,
    capacidad: f.capacidad,
    division: f.division,
    estableMs: f.estableMs,
  };
}
