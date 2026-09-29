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
  /** Insignia junto al nombre: «Persona», «Empresa». */
  etiqueta?: string | null;
  /** Insignia a la derecha: «Por cobrar $ 1.200.000» (advertencia) · «Al día» (éxito). */
  insignia?: { texto: string; tono?: 'advertencia' | 'exito' | 'neutro' | 'informacion' } | null;
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

/**
 * Resultado paginado de `buscar`: una página y el total de coincidencias. Con
 * él la lista muestra «Mostrando 20 de 57 · Ver más»; con un arreglo simple,
 * no (la pantalla no sabe cuántas hay).
 */
export interface PaginaEntidad<T> {
  items: readonly T[];
  total: number;
}

export function esPaginaEntidad<T>(r: readonly T[] | PaginaEntidad<T>): r is PaginaEntidad<T> {
  return !Array.isArray(r) && typeof r === 'object' && r !== null && Array.isArray((r as PaginaEntidad<T>).items);
}

/** Hay más coincidencias que las mostradas (solo con total conocido). */
export function hayMasResultados(mostrados: number, total: number | null): boolean {
  return total !== null && total > mostrados;
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
  /** Documento: «Persona» / «Empresa» ya traducido. */
  tipo?: string | null;
  /** Contacto principal de una empresa («Ana Ruiz (Compras)»). */
  contacto?: string | null;
  /** Saldo por cobrar ya formateado; `null` o vacío = al día. */
  saldoPorCobrar?: string | null;
  /** Texto de «Al día» (traducido) cuando no debe nada; sin él, no se muestra insignia. */
  alDia?: string | null;
  /** Plazo de crédito del cliente en días (sugiere el vencimiento). */
  plazoDias?: number | null;
}

export function opcionCliente(c: ClientePicker): OpcionEntidad {
  return {
    id: c.id,
    titulo: c.nombre,
    subtitulo: c.documento ?? null,
    meta: lineaSecundaria(c.contacto, c.correo, c.telefono) || null,
    pendienteSync: c.pendienteSync,
    // Solo en el diálogo del documento (con `tipo` o `alDia`): el resto de selectores no cambia.
    ...(c.tipo !== undefined || c.alDia !== undefined || c.saldoPorCobrar !== undefined
      ? {
          etiqueta: c.tipo ?? null,
          insignia: c.saldoPorCobrar ? { texto: c.saldoPorCobrar, tono: 'advertencia' as const } : c.alDia ? { texto: c.alDia, tono: 'exito' as const } : null,
        }
      : {}),
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
  /** Documento: «Persona» / «Empresa» ya traducido. */
  tipo?: string | null;
  /** Texto de «Al día» (traducido) cuando no se le debe; con él, el saldo va como insignia. */
  alDia?: string | null;
  /** Días de crédito del proveedor (sugieren el plazo). */
  creditDays?: number | null;
}

export function opcionProveedor(p: ProveedorPicker): OpcionEntidad {
  // Con `tipo` o `alDia` (diálogo del documento) el saldo va como insignia; si no, en la línea secundaria como siempre.
  const conInsignia = p.tipo !== undefined || p.alDia !== undefined;
  return {
    id: p.id,
    titulo: p.nombre,
    subtitulo: p.nit ?? null,
    meta: (conInsignia ? lineaSecundaria(p.contacto, p.telefono) : lineaSecundaria(p.contacto, p.telefono, p.saldoPorPagar)) || null,
    ...(conInsignia
      ? {
          etiqueta: p.tipo ?? null,
          insignia: p.saldoPorPagar ? { texto: p.saldoPorPagar, tono: 'advertencia' as const } : p.alDia ? { texto: p.alDia, tono: 'exito' as const } : null,
        }
      : {}),
  };
}