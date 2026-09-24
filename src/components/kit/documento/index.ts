/**
 * Piezas de documento del kit (facturas de venta y compra, CxC, CxP, ventas):
 * compartidas por los cuatro planes de docs/implementacion. Se importan desde
 * `@/components/kit` o `@/components/kit/documento`.
 */
export {
  TIPOS_DOCUMENTO,
  ICONO_DOCUMENTO,
  esTipoDocumento,
  ordenarCadena,
  type TipoDocumento,
  type EslabonDocumento,
} from './documentos';
export { ChipDocumento, type ChipDocumentoProps } from './ChipDocumento';
export { CadenaDocumento, type CadenaDocumentoProps } from './CadenaDocumento';
export { DocumentoCabecera, type DocumentoCabeceraProps } from './DocumentoCabecera';
export { DocumentoLineas, type DocumentoLineasProps } from './DocumentoLineas';
export {
  simboloMoneda,
  decimalesCantidad,
  textoImpuestosLinea,
  limitesRecepcion,
  resumenRecepcion,
  type LineaDocumento,
  type ImpuestoLinea,
  type CambioLinea,
  type ModoLineas,
} from './documentoLineasLogica';
export { DocumentoTotales, type DocumentoTotalesProps } from './DocumentoTotales';
export { RegistrarPagoDialog, type RegistrarPagoDialogProps, type DocumentoPago } from './RegistrarPagoDialog';
export {
  validarPago,
  montosRapidos,
  cambioEfectivo,
  pagoInicial,
  pagoLimpio,
  type ValorPago,
  type DestinoPago,
  type CampoPago,
  type ErrorPago,
  type ReglasPago,
} from './pago';
