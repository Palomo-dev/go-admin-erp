/**
 * Lógica de los selectores de tercero (`CustomerPicker`, `SupplierPicker`,
 * base `SelectorEntidad`), sin React: qué estado muestra la lista y cuándo se
 * ofrece «Crear “…”».
 */
import { normalizarBusqueda } from './arbol';

export interface OpcionEntidad {
  id: string;
  titulo: string;
  /** Documento o NIT. */
  subtitulo?: string | null;
  /** Correo · teléfono. */
  meta?: string | null;
  /** Creado sin conexión, aún sin subir. */
  pendienteSync?: boolean;
  deshabilitada?: boolean;
  motivo?: string;
}

export type EstadoListaEntidad = 'cargando' | 'error' | 'inicial' | 'sinResultados' | 'resultados';

export function estadoListaEntidad({
  cargando,
  error,
  total,
  texto,
}: {
  cargando: boolean;
  error: boolean;
  total: number;
  texto: string;
}): EstadoListaEntidad {
  if (error) return 'error';
  if (total > 0) return 'resultados';
  if (cargando) return 'cargando';
  return texto.trim() ? 'sinResultados' : 'inicial';
}

/** Se ofrece crear si hay texto y ninguna opción se llama exactamente así (sin tildes ni mayúsculas). */
export function ofrecerCrear(texto: string, opciones: readonly Pick<OpcionEntidad, 'titulo'>[]): boolean {
  const t = normalizarBusqueda(texto).trim();
  if (!t) return false;
  return !opciones.some((o) => normalizarBusqueda(o.titulo).trim() === t);
}

/** Línea secundaria: documento y contacto, sin huecos. */
export function lineaSecundaria(...partes: (string | null | undefined)[]): string {
  return partes
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

/** Cliente que maneja `CustomerPicker` (lo arma el servicio de la pantalla). */
export interface ClientePicker {
  id: string;
  nombre: string;
  /** «CC 1.020.304.050», «NIT 900.123.456-7». */
  documento?: string | null;
  correo?: string | null;
  telefono?: string | null;
  /** Creado sin conexión (Desktop), aún sin subir. */
  pendienteSync?: boolean;
}

export function opcionCliente(c: ClientePicker): OpcionEntidad {
  return {
    id: c.id,
    titulo: c.nombre,
    subtitulo: c.documento ?? null,
    meta: lineaSecundaria(c.correo, c.telefono) || null,
    pendienteSync: c.pendienteSync,
  };
}

/** Proveedor que maneja `SupplierPicker`. */
export interface ProveedorPicker {
  id: string;
  nombre: string;
  /** «NIT 900.123.456-7». */
  nit?: string | null;
  /** `suppliers.contact` (persona de contacto). */
  contacto?: string | null;
  telefono?: string | null;
  /** Saldo por pagar, ya formateado en la moneda de la organización. */
  saldoPorPagar?: string | null;
}

export function opcionProveedor(p: ProveedorPicker): OpcionEntidad {
  return {
    id: p.id,
    titulo: p.nombre,
    subtitulo: p.nit ?? null,
    meta: lineaSecundaria(p.contacto, p.telefono, p.saldoPorPagar) || null,
  };
}