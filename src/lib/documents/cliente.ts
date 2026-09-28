/**
 * Funciones del navegador para usar el motor de documentos.
 *
 * El navegador solo pide `GET /api/documentos/<tipo>/<id>`: el servidor arma
 * el documento desde la base con la organización de la sesión (la cookie viaja
 * sola). Nunca se mandan datos del documento: no hay nada que manipular.
 *
 * - `abrirDocumento`: PDF en una pestaña nueva.
 * - `imprimirDocumento`: HTML imprimible en una pestaña nueva que abre el
 *   diálogo de impresión (se abre SÍNCRONAMENTE dentro del clic, para que el
 *   bloqueador de ventanas emergentes no la corte).
 * - `descargarDocumento`: descarga el PDF; si el servidor no puede generar PDF
 *   (503 `PDF_NO_DISPONIBLE`), descarga el mismo documento en HTML para
 *   «Guardar como PDF» desde el navegador — nunca deja al usuario sin archivo.
 * - `urlDocumento`: la URL, para un `<a href>` o un `<iframe>` de vista previa.
 */

import type { FormatoDocumento, IdiomaDocumento, PapelDocumento, TipoDocumento } from './tipos';

export interface OpcionesDocumentoCliente {
  formato?: FormatoDocumento;
  papel?: PapelDocumento;
  idioma?: IdiomaDocumento;
  /** Estado de cuenta: días `YYYY-MM-DD`. */
  desde?: string;
  hasta?: string;
}

export class ErrorDocumento extends Error {
  constructor(message: string, readonly status: number, readonly codigo: string | null) {
    super(message);
    this.name = 'ErrorDocumento';
  }
}

export function urlDocumento(
  tipo: TipoDocumento,
  id: string | number,
  opciones: OpcionesDocumentoCliente & { descargar?: boolean; imprimir?: boolean } = {},
): string {
  const q = new URLSearchParams();
  q.set('formato', opciones.formato ?? 'pdf');
  if (opciones.papel) q.set('papel', opciones.papel);
  if (opciones.idioma) q.set('idioma', opciones.idioma);
  if (opciones.desde) q.set('desde', opciones.desde);
  if (opciones.hasta) q.set('hasta', opciones.hasta);
  if (opciones.descargar) q.set('descargar', '1');
  if (opciones.imprimir) q.set('imprimir', '1');
  return `/api/documentos/${encodeURIComponent(tipo)}/${encodeURIComponent(String(id))}?${q.toString()}`;
}

function abrirPestana(url: string): Window | null {
  if (typeof window === 'undefined') return null;
  return window.open(url, '_blank', 'noopener');
}

/** PDF del documento en una pestaña nueva. */
export function abrirDocumento(tipo: TipoDocumento, id: string | number, opciones: OpcionesDocumentoCliente = {}): void {
  abrirPestana(urlDocumento(tipo, id, { ...opciones, formato: 'pdf' }));
}

/** Documento imprimible (HTML) en una pestaña nueva que abre el diálogo de impresión. */
export function imprimirDocumento(tipo: TipoDocumento, id: string | number, opciones: OpcionesDocumentoCliente = {}): void {
  abrirPestana(urlDocumento(tipo, id, { ...opciones, formato: 'html', imprimir: true }));
}

function nombreDeDisposicion(cabecera: string | null, respaldo: string): string {
  const m = cabecera ? /filename="([^"]+)"/.exec(cabecera) : null;
  return m?.[1] ?? respaldo;
}

/** Guarda un blob como archivo descargado. */
export function guardarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function errorDeRespuesta(respuesta: Response): Promise<ErrorDocumento> {
  let cuerpo: { error?: string; code?: string } = {};
  try {
    cuerpo = (await respuesta.json()) as { error?: string; code?: string };
  } catch {
    // respuesta sin JSON
  }
  return new ErrorDocumento(cuerpo.error ?? `Error ${respuesta.status} al generar el documento`, respuesta.status, cuerpo.code ?? null);
}

/** Pide el PDF al motor y devuelve el blob (lanza `ErrorDocumento` con el estado y el código). */
export async function obtenerPdf(tipo: TipoDocumento, id: string | number, opciones: OpcionesDocumentoCliente = {}): Promise<{ blob: Blob; nombre: string }> {
  const respuesta = await fetch(urlDocumento(tipo, id, { ...opciones, formato: 'pdf', descargar: true }), { credentials: 'same-origin' });
  if (!respuesta.ok) throw await errorDeRespuesta(respuesta);
  return { blob: await respuesta.blob(), nombre: nombreDeDisposicion(respuesta.headers.get('content-disposition'), `${tipo}.pdf`) };
}

/** Descarga el PDF; si el servidor no puede generarlo, descarga el HTML imprimible. */
export async function descargarDocumento(tipo: TipoDocumento, id: string | number, opciones: OpcionesDocumentoCliente = {}): Promise<void> {
  try {
    const { blob, nombre } = await obtenerPdf(tipo, id, opciones);
    guardarArchivo(blob, nombre);
  } catch (err) {
    if (!(err instanceof ErrorDocumento) || err.codigo !== 'PDF_NO_DISPONIBLE') throw err;
    const respuesta = await fetch(urlDocumento(tipo, id, { ...opciones, formato: 'html' }), { credentials: 'same-origin' });
    if (!respuesta.ok) throw await errorDeRespuesta(respuesta);
    guardarArchivo(await respuesta.blob(), `${tipo}-${String(id)}.html`);
  }
}
