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
export { BandaAntiguedad, type BandaAntiguedadProps } from './BandaAntiguedad';
export { PlanCuotasDialog, type PlanCuotasDialogProps, type ParametrosPlan } from './PlanCuotasDialog';
export { EstadoCuentaDialog, descargarTexto, type EstadoCuentaDialogProps } from './EstadoCuentaDialog';
export {
  TRAMOS_ANTIGUEDAD,
  esTramoAntiguedad,
  normalizarTramos,
  validarPlanCuotas,
  totalesPlan,
  estadoCuentaCsv,
  type TramoAntiguedad,
  type DatoTramo,
  type TramosEntrada,
  type CuotaVista,
  type FormularioPlan,
  type ErrorPlan,
  type MovimientoCuenta,
  type EstadoCuentaVista,
  type TextosCsvEstadoCuenta,
} from './carteraLogica';
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

// Edición del documento (formulario de venta, compra y orden de compra).
export { ImpuestosLinea, type ImpuestosLineaProps } from './ImpuestosLinea';
export { AgregarProductosDialog, type AgregarProductosDialogProps, type FiltrosProductos } from './AgregarProductosDialog';
export { DialogoItemManual, type DialogoItemManualProps } from './DialogoItemManual';
export { DialogoTextoLinea, type DialogoTextoLineaProps } from './DialogoTextoLinea';
export { FormularioRapidoTercero, type FormularioRapidoTerceroProps } from './FormularioRapidoTercero';
export { FormularioRapidoProducto, type FormularioRapidoProductoProps } from './FormularioRapidoProducto';
export { ChipAlternable, type ChipAlternableProps } from './ChipAlternable';
export { tonoLinea, type InsigniaLinea } from './documentoLineasLogica';
export {
  alternarImpuesto,
  impuestosElegidos,
  tarifaSeleccion,
  textoSeleccionImpuestos,
  seleccionInicial,
  idsDesdeCodigo,
  estadoStock,
  coincidenciaExacta,
  textoSinHtml,
  contarAgregados,
  terceroRapidoInicial,
  cambiarTipoPersona,
  validarTerceroRapido,
  nombreTerceroRapido,
  validarItemManual,
  productoRapidoInicial,
  validarProductoRapido,
  TIPOS_DOCUMENTO_TERCERO,
  type OpcionImpuesto,
  type SeleccionImpuestos,
  type ProductoDocumento,
  type VarianteDocumento,
  type EstadoStock,
  type DatosTerceroRapido,
  type VarianteTercero,
  type TipoPersona,
  type ErrorTercero,
  type ItemManual,
  type DatosProductoRapido,
} from './edicionDocumentoLogica';
export {
  FormularioDocumentoLayout,
  ResumenErrores,
  DialogoSalirConCambios,
  TarjetaAtajos,
  useAvisoSalida,
  useAutoguardado,
  type FormularioDocumentoLayoutProps,
  type ErrorFormulario,
} from './FormularioDocumento';
