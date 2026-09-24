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
