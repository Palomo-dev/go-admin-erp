/**
 * Reglas del selector de terceros, sin React.
 *
 * El texto que se escribe no es el valor. El valor solo cambia al elegir una
 * fila, al crear o al confirmar «Usar NIT» con un dígito de verificación
 * válido (módulo 11 DIAN). Un nombre nunca se guarda como NIT.
 */
import { calcularDv, validarDv } from '@/lib/utils/nitDv';
import type { OpcionEntidad } from './selectorEntidadLogica';

export type TipoTercero = 'cliente' | 'proveedor' | 'empleado' | 'nit';

export type TonoEtiquetaTercero = 'informacion' | 'advertencia' | 'exito' | 'neutro';

/** Valor del campo. `id` es null cuando el tercero es solo un NIT confirmado. */
export interface TerceroElegido {
  tipo: TipoTercero;
  id: string | null;
  nit: string | null;
  dv: string | null;
  nombre: string;
}

/** Fila de búsqueda: incluye el correo y el documento ya presentado. */
export interface TerceroLista extends TerceroElegido {
  email?: string | null;
  documento?: string | null;
}

export interface InterpretacionNit {
  /** El texto es un NIT (dígitos, con o sin DV), no un nombre. */
  esNit: boolean;
  /** Se puede usar: DV presente y válido, o base sin guion con DV calculado. */
  valido: boolean;
  /** Había guion y el DV no corresponde. No se ofrece como valor. */
  dvInvalido: boolean;
  nit: string | null;
  dv: string | null;
}

const NIT_MIN = 6;
const NIT_MAX = 15;

const VACIO: InterpretacionNit = { esNit: false, valido: false, dvInvalido: false, nit: null, dv: null };

/**
 * «Usar NIT» solo si el texto es un NIT.
 * Con guion se valida el DV; si no corresponde, se rechaza.
 * Solo dígitos (6 a 15, se admiten puntos de miles) calculan el DV.
 * Cualquier letra es un nombre: no es un NIT.
 */
export function interpretarNit(texto: string): InterpretacionNit {
  const t = texto.trim();
  if (!t || /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(t)) return VACIO;
  const compacto = t.replace(/[\s.]/g, '');
  if (!/^\d+(?:-\d)?$/.test(compacto)) return VACIO;

  if (compacto.includes('-')) {
    const [base, dv] = compacto.split('-');
    if (base.length < NIT_MIN || base.length > NIT_MAX || dv.length !== 1) return VACIO;
    const ok = validarDv(`${base}-${dv}`);
    return { esNit: true, valido: ok, dvInvalido: !ok, nit: ok ? base : null, dv: ok ? dv : null };
  }

  if (compacto.length < NIT_MIN || compacto.length > NIT_MAX) return VACIO;
  const dv = calcularDv(compacto);
  if (dv === null) return VACIO;
  return { esNit: true, valido: true, dvInvalido: false, nit: compacto, dv: String(dv) };
}

/** Escribir no cambia el valor elegido. */
export function valorAlEscribir<T>(actual: T, _texto: string): T {
  return actual;
}

export const TONO_TIPO_TERCERO: Record<TipoTercero, TonoEtiquetaTercero> = {
  cliente: 'informacion',
  proveedor: 'advertencia',
  empleado: 'exito',
  nit: 'neutro',
};

/** Una fila sin documento sigue siendo elegible: el subtítulo queda vacío. */
export function opcionTercero(
  fila: TerceroLista,
  etiqueta: string,
): OpcionEntidad {
  return {
    id: fila.id ?? `nit:${fila.nit ?? fila.nombre}`,
    titulo: fila.nombre || fila.nit || '—',
    subtitulo: fila.documento ?? null,
    meta: fila.email ?? null,
    etiqueta,
    tonoEtiqueta: TONO_TIPO_TERCERO[fila.tipo],
    conAvatar: true,
  };
}

/**
 * Texto de un movimiento ya guardado. Sin `dv` queda `{nit} · {nombre}`,
 * igual que antes de esta columna. El DV solo se agrega si el NIT no lo trae.
 */
export function textoTerceroGuardado(nit: string, nombre?: string | null, dv?: string | null): string {
  const documento = dv && !nit.includes('-') ? `${nit}-${dv}` : nit;
  return nombre?.trim() ? `${documento} · ${nombre.trim()}` : documento;
}
