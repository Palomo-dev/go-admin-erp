/**
 * Funciones del navegador para usar el motor de documentos.
 *
 * El navegador solo pide `GET /api/documentos/<tipo>/<id>`: el servidor arma
 * el documento desde la base con la organización de la sesión (la cookie viaja
 * sola). Nunca se mandan datos del documento: no hay nada que manipular.
 *
 * - `abrirDocumento`: PDF en una pestaña nueva. Hay que llamarlo dentro del clic:
 *   después de un `await` el navegador bloquea la ventana y no baja nada.
 * - `prepararDescarga` + `entregarArchivo`: la pestaña se abre en el clic y el
 *   archivo se guarda ahí cuando la respuesta ya llegó.
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
  /** Reporte del catálogo: `periodo`, `sucursal`, `hi`, `hf`, `vista`, `comparar` (los valida el servidor). */
  parametros?: Readonly<Record<string, string>>;
}

const PARAMETROS_REPORTE = ['periodo', 'sucursal', 'hi', 'hf', 'vista', 'comparar'] as const;

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
  for (const clave of PARAMETROS_REPORTE) {
    const valor = opciones.parametros?.[clave];
    if (valor) q.set(clave, valor);
  }
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

/**
 * Abre la pestaña de la descarga en el mismo clic, antes de cualquier `await`.
 * Un `window.open` después de guardar el cierre lo bloquea el navegador y el
 * archivo no sale, aunque el cierre sí haya quedado guardado.
 */
export function prepararDescarga(aviso?: string): Window | null {
  if (typeof window === 'undefined') return null;
  let pestana: Window | null = null;
  try {
    pestana = window.open('about:blank', '_blank');
  } catch {
    return null;
  }
  if (!pestana) return null;
  try {
    if (aviso) {
      pestana.document.title = aviso;
      if (pestana.document.body) pestana.document.body.textContent = aviso;
    }
    pestana.blur();
    window.focus();
  } catch {
    // La pestaña ya está abierta; el aviso no es necesario para bajar el archivo.
  }
  return pestana;
}

/**
 * Baja el archivo. Si `pestana` se abrió en el clic, el clic de descarga
 * ocurre ahí y el navegador no lo trata como una descarga automática.
 */
export function entregarArchivo(blob: Blob, nombre: string, pestana: Window | null = null): void {
  if (pestana && !pestana.closed) {
    // `Window` no declara `URL` en los tipos del DOM (es de `globalThis`), pero
    // cada ventana tiene el suyo: el blob se crea en la pestaña que lo descarga.
    const urlPestana = (pestana as Window & typeof globalThis).URL;
    try {
      const url = urlPestana.createObjectURL(blob);
      const doc = pestana.document;
      const cuerpo = doc.body ?? doc.documentElement.appendChild(doc.createElement('body'));
      const a = doc.createElement('a');
      a.href = url;
      a.download = nombre;
      cuerpo.appendChild(a);
      a.click();
      pestana.setTimeout(() => {
        try {
          urlPestana.revokeObjectURL(url);
        } catch {
          // La pestaña ya no está.
        }
        try {
          if (!pestana.closed) pestana.close();
        } catch {
          // El navegador no deja cerrarla.
        }
      }, 1500);
      return;
    } catch {
      // La pestaña no dejó escribir el archivo: se baja en esta.
    }
  }
  guardarArchivo(blob, nombre);
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

/** Pide el archivo: PDF, o el HTML imprimible si el servidor no puede generar PDF. */
export async function obtenerDescarga(tipo: TipoDocumento, id: string | number, opciones: OpcionesDocumentoCliente = {}): Promise<{ blob: Blob; nombre: string }> {
  try {
    return await obtenerPdf(tipo, id, opciones);
  } catch (err) {
    if (!(err instanceof ErrorDocumento) || err.codigo !== 'PDF_NO_DISPONIBLE') throw err;
    const respuesta = await fetch(urlDocumento(tipo, id, { ...opciones, formato: 'html' }), { credentials: 'same-origin' });
    if (!respuesta.ok) throw await errorDeRespuesta(respuesta);
    return { blob: await respuesta.blob(), nombre: `${tipo}-${String(id)}.html` };
  }
}

/** Descarga el PDF; si el servidor no puede generarlo, descarga el HTML imprimible. */
export async function descargarDocumento(tipo: TipoDocumento, id: string | number, opciones: OpcionesDocumentoCliente = {}): Promise<void> {
  const { blob, nombre } = await obtenerDescarga(tipo, id, opciones);
  guardarArchivo(blob, nombre);
}
