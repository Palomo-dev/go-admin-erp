/**
 * Motor único de documentos — punto de entrada del servidor.
 *
 * `armarDocumento(sesion, solicitud)`:
 *   1. valida tipo, papel e idioma (400 si no aplica);
 *   2. permiso del tipo, resuelto en el servidor (403);
 *   3. el cargador del tipo lee el documento de la base CON la organización
 *      de la sesión (404 si es de otra, no existe o el id no es válido);
 *   4. renderiza HTML de carta/A4 o de 80 mm.
 * La ruta `/api/documentos/[tipo]/[id]` lo llama y, si piden PDF, pasa el HTML
 * por `generarPdf`. Nada de lo que se pinta viene del cuerpo de la petición.
 */

import { OrgContextError } from '@/lib/utils/orgContextError';
import { renderizarCarta } from '../render/carta';
import { renderizarTermico } from '../render/termico';
import { cargarTextos, type Traductor } from '../textos';
import {
  TIPOS_CON_80MM,
  type DocumentoPayload,
  type IdiomaDocumento,
  type PapelDocumento,
  type TipoDocumento,
} from '../tipos';
import type { OpcionesCarga, SesionDocumento } from './base';
import { cargarArqueoCaja, cargarCierreCaja } from './cargadores/cajas';
import { cargarDocumentoSoporte, cargarFacturaCompra } from './cargadores/compras';
import { cargarCertificadoRetenciones } from './cargadores/certificadoRetenciones';
import { cargarCotizacion } from './cargadores/cotizacion';
import { cargarEstadoCuenta } from './cargadores/estadoCuenta';
import { cargarEstadoCuentaProveedor } from './cargadores/estadoCuentaProveedor';
import { cargarComprobantePago } from './cargadores/pagos';
import { cargarVenta } from './cargadores/ventas';
import { autorizarTipo } from './permisos';

export interface SolicitudDocumento {
  tipo: TipoDocumento;
  id: string;
  papel: PapelDocumento;
  idioma: IdiomaDocumento;
  /** HTML que abre el diálogo de impresión al cargar (necesita `nonce`). */
  imprimir?: boolean;
  nonce?: string;
  desde?: string | null;
  hasta?: string | null;
  ahora?: Date;
}

export interface DocumentoArmado {
  payload: DocumentoPayload;
  html: string;
  papel: PapelDocumento;
}

type Cargador = (sesion: SesionDocumento, id: string, opciones: OpcionesCarga, t: Traductor) => Promise<DocumentoPayload>;

const CARGADORES: Record<TipoDocumento, Cargador> = {
  'factura-venta': (s, id, o, t) => cargarVenta(s, 'factura-venta', id, o, t),
  'nota-credito': (s, id, o, t) => cargarVenta(s, 'nota-credito', id, o, t),
  cotizacion: cargarCotizacion,
  'factura-compra': cargarFacturaCompra,
  'documento-soporte': cargarDocumentoSoporte,
  'estado-cuenta': cargarEstadoCuenta,
  'estado-cuenta-proveedor': cargarEstadoCuentaProveedor,
  'certificado-retenciones': cargarCertificadoRetenciones,
  'recibo-caja': (s, id, o, t) => cargarComprobantePago(s, 'recibo-caja', id, o, t),
  'comprobante-egreso': (s, id, o, t) => cargarComprobantePago(s, 'comprobante-egreso', id, o, t),
  'cierre-caja': cargarCierreCaja,
  'arqueo-caja': cargarArqueoCaja,
};

export async function armarDocumento(sesion: SesionDocumento, solicitud: SolicitudDocumento): Promise<DocumentoArmado> {
  if (solicitud.papel === '80mm' && !TIPOS_CON_80MM.has(solicitud.tipo)) {
    throw new OrgContextError('Este documento no se imprime en rollo de 80 mm', 400, 'PAPEL_NO_DISPONIBLE');
  }
  await autorizarTipo(sesion, solicitud.tipo);

  const t = await cargarTextos(solicitud.idioma);
  const payload = await CARGADORES[solicitud.tipo](
    sesion,
    solicitud.id,
    { idioma: solicitud.idioma, desde: solicitud.desde, hasta: solicitud.hasta, ahora: solicitud.ahora },
    t,
  );
  if (payload.tipo !== solicitud.tipo) await autorizarTipo(sesion, payload.tipo);
  const html = solicitud.papel === '80mm'
    ? renderizarTermico(payload, t, { imprimir: solicitud.imprimir, nonce: solicitud.nonce })
    : renderizarCarta(payload, t, { papel: solicitud.papel, imprimir: solicitud.imprimir, nonce: solicitud.nonce });
  return { payload, html, papel: solicitud.papel };
}
