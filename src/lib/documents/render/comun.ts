/**
 * Piezas compartidas por los renderizadores (carta/A4 y 80 mm): valor de un
 * campo o de una celda ya formateado y ESCAPADO, rótulos y tonos.
 */

import { escaparHtml } from '../escape';
import type { Formateador } from '../formato';
import type { Traductor } from '../textos';
import type { Campo, CeldaTabla, ColumnaTabla, DocumentoPayload, FilaTotal, SeccionTabla, Tono, Valor } from '../tipos';

export const OCULTO = '***';

/** Texto plano (sin escapar) de un valor. */
export function textoDeValor(valor: Valor, f: Formateador, t: Traductor): string {
  switch (valor.tipo) {
    case 'texto':
      return valor.v ?? '';
    case 'clave':
      return t(valor.v, valor.vars);
    case 'dinero':
      return valor.v === null ? '' : f.dinero(valor.v);
    case 'instante':
      return f.instante(valor.v);
    case 'instanteHora':
      return f.instanteHora(valor.v);
    case 'fecha':
      return f.fecha(valor.v);
    case 'numero':
      return valor.v === null ? '' : f.numero(valor.v, valor.decimales);
    case 'porcentaje':
      return valor.v === null ? '' : `${f.numero(valor.v, 2)} %`;
    case 'oculto':
      return OCULTO;
  }
}

/** HTML escapado de un valor. */
export function htmlDeValor(valor: Valor, f: Formateador, t: Traductor): string {
  return escaparHtml(textoDeValor(valor, f, t));
}

export function esOculta(celda: CeldaTabla): celda is { oculto: true } {
  return typeof celda === 'object' && celda !== null && 'oculto' in celda;
}

/** Texto plano (sin escapar) de una celda según el tipo de su columna. */
export function textoDeCelda(columna: ColumnaTabla, celda: CeldaTabla, f: Formateador, t: Traductor): string {
  if (celda === null || celda === undefined || celda === '') return '';
  if (esOculta(celda)) return OCULTO;
  switch (columna.tipo) {
    case 'dinero':
      return f.dinero(celda as number | string);
    case 'instante':
      return f.instante(String(celda));
    case 'instanteHora':
      return f.instanteHora(String(celda));
    case 'fecha':
      return f.fecha(String(celda));
    case 'numero':
      return f.numero(celda as number | string);
    case 'porcentaje': {
      const texto = f.numero(celda as number | string, 2);
      return texto ? `${texto} %` : '';
    }
    case 'clave':
      return t(String(celda));
    default:
      return String(celda);
  }
}

export function textoDeTotal(fila: FilaTotal, f: Formateador): string {
  if (fila.oculto) return OCULTO;
  if (fila.valor === null) return '';
  const monto = f.dinero(Math.abs(fila.valor));
  const negativo = fila.resta || fila.valor < 0;
  return negativo && fila.valor !== 0 ? `- ${monto}` : monto;
}

export function titulo(doc: DocumentoPayload, t: Traductor): string {
  return t(`tipos.${doc.tituloClave}`);
}

/** Rótulo de un campo: el texto ya resuelto si lo trae, si no su clave traducida. */
export function rotuloCampo(campo: Campo, t: Traductor): string {
  return campo.rotulo ?? t(`campos.${campo.clave}`);
}

export function rotuloColumna(columna: ColumnaTabla, t: Traductor): string {
  return columna.rotulo ?? t(`columnas.${columna.clave}`);
}

export function tituloSeccion(seccion: SeccionTabla, t: Traductor): string {
  return seccion.tituloTexto ?? t(`secciones.${seccion.titulo}`);
}

/** NIT con dígito de verificación: `900123456-7`. */
export function nitConDv(nit: string | null, dv: string | null): string | null {
  if (!nit) return null;
  return dv !== null && dv !== '' ? `${nit}-${dv}` : nit;
}

/**
 * Tipos de documento colombianos cuyo número se escribe con puntos de miles
 * («1.234.567», «900.123.456-7»): los códigos de `country_identification_types`
 * (COL) y los numéricos de la DIAN. Un RFC, un DNI o un pasaporte se dejan
 * como vienen.
 */
const TIPOS_CON_MILES = new Set(['cc', 'ce', 'ti', 'rc', 'te', 'nuip', 'nit', '11', '12', '13', '21', '22', '31', '91']);

/** «1234567» → «1.234.567». Si no son solo dígitos, igual que vino. */
export function agruparMiles(numero: string): string {
  const limpio = numero.trim();
  return /^\d{4,}$/.test(limpio) ? limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : limpio;
}

/** Sigla del tipo de documento en el idioma del documento (`documentos.tiposDocumento`), o el código en mayúsculas. */
export function siglaDocumento(tipo: string, t: Traductor): string {
  const codigo = tipo.trim().toLowerCase();
  const clave = `tiposDocumento.${codigo}`;
  const traducida = t(clave);
  return traducida && traducida !== clave ? traducida : tipo.trim().toUpperCase();
}

/**
 * Documento de una persona o empresa: «CC 1.234.567», «NIT 900.123.456-7».
 * Sin número no hay documento (null): nunca un tipo suelto.
 */
export function documentoLegible(
  tipo: string | null | undefined,
  numero: string | null | undefined,
  dv: string | null | undefined,
  t: Traductor,
): string | null {
  const conDv = numeroDocumentoLegible(tipo, numero, dv);
  if (!conDv) return null;
  const codigo = (tipo ?? '').trim();
  return [codigo ? siglaDocumento(codigo, t) : null, conDv].filter(Boolean).join(' ');
}

/** Solo el número (con puntos de miles si el tipo es colombiano, o sin tipo) y el DV. */
export function numeroDocumentoLegible(
  tipo: string | null | undefined,
  numero: string | null | undefined,
  dv: string | null | undefined,
): string | null {
  const n = (numero ?? '').trim();
  if (!n) return null;
  const codigo = (tipo ?? '').trim().toLowerCase();
  const cifras = !codigo || TIPOS_CON_MILES.has(codigo) ? agruparMiles(n) : n;
  return nitConDv(cifras, dv ?? null) ?? cifras;
}

/** NIT del emisor con puntos de miles y DV (`900.123.456-7`); null sin NIT. */
export function nitEmisor(nit: string | null, dv: string | null): string | null {
  return nit ? nitConDv(agruparMiles(nit), dv) : null;
}

/**
 * Responsabilidades fiscales con su nombre legible (`documentos.responsabilidades.<código>`,
 * nombres del catálogo `dian_fiscal_responsibilities`); un código sin nombre se deja tal cual.
 */
export function nombresResponsabilidades(codigos: string[], t: Traductor): string[] {
  return codigos.map((codigo) => {
    const clave = `responsabilidades.${codigo.trim().toUpperCase()}`;
    const nombre = t(clave);
    return nombre && nombre !== clave ? nombre : codigo;
  });
}

export function claseTono(tono: Tono): string {
  return `tono-${tono}`;
}
