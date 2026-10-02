/**
 * Kit de componentes compartidos, fiel a Figma (`EAvjINVRnlzFM70GVoWXgl`,
 * página `02 Componentes`). Documentación: docs/design/KIT-CODIGO.md.
 *
 * Regla: las páginas usan el kit. Si falta algo, se agrega al kit, no a la
 * página: si se modifica en un lado, se modifica en todos.
 */

// Cabecera y cifras
export { PageHeader, type PageHeaderProps, type PageHeaderMovil } from './PageHeader';
export { Breadcrumbs, type BreadcrumbsProps, type Miga } from './Breadcrumbs';
export { StatCard, type StatCardProps, type TonoStat } from './StatCard';
export { KpiStrip, type KpiStripProps } from './KpiStrip';

// Buscador y filtros
export { SearchInput, type SearchInputProps } from './SearchInput';
export { FilterButton, type FilterButtonProps } from './FilterButton';
export { FilterPanel, type FilterPanelProps } from './FilterPanel';
export { FilterChip, type FilterChipProps } from './FilterChip';
export { FilterChips, type FilterChipsProps, type ChipFiltro } from './FilterChips';
export { ListToolbar, type ListToolbarProps } from './ListToolbar';
export { DateRangeButton, type DateRangeButtonProps } from './DateRangeButton';
export { CampoFecha, type CampoFechaProps } from './CampoFecha';
export { CalendarioMes, type CalendarioMesProps } from './CalendarioMes';
export { SelectorFranja, cruzaMedianoche, type SelectorFranjaProps, type FranjaHoraria } from './SelectorFranja';
export { primerDiaDeSemana, grillaMes, etiquetaDiaTrigger, type CeldaDia } from './calendarioLogica';
export {
  etiquetaRango,
  etiquetaRangoLarga,
  presetsRango,
  presetDe,
  normalizarRango,
  esFechaPlana,
  inicioDeMes,
  type RangoFechas,
  type PresetRango,
  type IdPresetRango,
} from './rangoFechas';

// Tabla, tarjetas y acciones
export { DataTable, type DataTableProps, type ColumnaTabla, type EstadoTabla, type ContextoTarjeta, type AtributosDatosFila } from './DataTable';
export { RowActionsMenu, type RowActionsMenuProps } from './RowActionsMenu';
export { ActionSheet, type ActionSheetProps } from './ActionSheet';
export { BulkActionBar, aplanarMenuMasivo, type BulkActionBarProps, type AccionMasiva, type GrupoMenuMasivo } from './BulkActionBar';
export { ListCard, type ListCardProps } from './ListCard';
export { AvatarIniciales, inicialesDe, type AvatarInicialesProps } from './AvatarIniciales';
export { TabBar, idPestana, idPanel, type TabBarProps, type PestanaTab } from './TabBar';
export { AccionRapida, type AccionRapidaProps } from './AccionRapida';
export { prepararMenu, MAX_ENTRADAS_MENU, type AccionFila, type EntradaMenu } from './acciones';

// Estados y paginación
export { EmptyState, type EmptyStateProps, type VarianteEmptyState, type AccionEmptyState } from './EmptyState';
export { Pagination, type PaginationProps } from './Pagination';
export { PaginationCompact, type PaginationCompactProps } from './PaginationCompact';
export {
  calcularRango,
  paginasVisibles,
  resumenPaginacion,
  resumenCompacto,
  TAMANOS_PAGINA,
  type RangoPagina,
  type Sustantivo,
} from './paginacion';

// Badges
export { StatusBadge, type StatusBadgeProps } from './StatusBadge';
export { BadgeTono, type BadgeTonoProps } from './BadgeTono';
export { BranchBadge, BranchBadgeActiva, type BranchBadgeProps, type AlcanceSucursal } from './BranchBadge';
export { resolverEstado, etiquetaEstado, type TonoBadge, type AparienciaBadge } from './estadoTono';

// Formularios
export { FormSection, type FormSectionProps } from './FormSection';
export { FormField, type FormFieldProps, type PropsCampo } from './FormField';
export { SegmentedControl, type SegmentedControlProps, type OpcionSegmento } from './SegmentedControl';
export { ChipsOpcion, type ChipsOpcionProps, type OpcionChip } from './ChipsOpcion';

// Estado de listados en la URL
export { useListadoServidor, type ListadoServidor } from './useListadoServidor';
export {
  leerEstadoListado,
  escribirEstadoListado,
  rangoServidor,
  siguienteOrden,
  valoresFiltro,
  type ConfigListado,
  type EstadoListado,
  type OrdenListado,
} from './listadoUrl';
export { estadoCasillaCabecera, alternarPagina, alternarId } from './seleccion';
export { useEsEscritorio } from './useEsEscritorio';

// Árboles (categorías hoy; cualquier listado jerárquico) y diálogo con cuerpo
export {
  construirArbol,
  filtrarArbol,
  aplanarArbol,
  paginarRaices,
  descendientesDe,
  ancestrosDe,
  idsConHijos,
  normalizarBusqueda,
  type NodoPlano,
  type NodoArbol,
  type FilaArbol,
  type ResultadoFiltroArbol,
} from './arbol';
export { TreeCell, type TreeCellProps } from './TreeCell';
export { TreeCard, type TreeCardProps } from './TreeCard';
export { TreeList, TreeSelect, rutaOpcion, type OpcionArbol, type TreeListProps, type TreeSelectProps } from './TreePicker';
export {
  useArrastreArbol,
  ZonaSoltarRaiz,
  type ArrastreArbol,
  type OpcionesArrastreArbol,
  type PropsNodoArrastre,
  type ZonaSoltarRaizProps,
} from './arrastreArbol';
export { Dialogo, type DialogoProps, type AccionDialogo } from './Dialogo';

// Documentos: etiquetas de producto (Figma `Doc/Código de barras`, `Doc/Etiqueta de producto`)
export { CodigoBarras, type CodigoBarrasProps } from './CodigoBarras';
export { EtiquetaProducto, type EtiquetaProductoProps } from './EtiquetaProducto';
export { HojaEtiquetas, type HojaEtiquetasProps } from './HojaEtiquetas';

// Asistentes (importar productos) y diálogo que en móvil es hoja inferior (Meta y canales)
export { Stepper, type StepperProps, type PasoStepper } from './Stepper';
export { PanelAdaptable, type PanelAdaptableProps } from './PanelAdaptable';

// ── Kit compartido de POS y finanzas (2026-09-24) · docs/implementacion/KIT-COMPARTIDO.md
// Datos, tarjetas y confirmación con motivo
export { FilaDato, ListaDatos, clasesTonoFilaDato, type FilaDatoProps, type ListaDatosProps, type TonoFilaDato } from './FilaDato';
export { Tarjeta, clasesTonoTarjeta, type TarjetaProps, type TonoTarjeta } from './Tarjeta';
export { KpiCompacto, type KpiCompactoProps, type CifraCompacta } from './KpiCompacto';
export { DialogoMotivo, type DialogoMotivoProps } from './DialogoMotivo';
export { validarMotivo, componerMotivo, limpiarMotivo, MOTIVO_MINIMO, MOTIVO_MAXIMO, type ResultadoMotivo, type ErrorMotivo } from './motivo';
// Totales, teclado, botón con importe y pagos
export { CampoNumero, type CampoNumeroProps } from './CampoNumero';
export { ResumenTotales, type ResumenTotalesProps } from './ResumenTotales';
export {
  filasResumen,
  agruparImpuestos,
  formatearTarifa,
  importeConSigno,
  type EntradaResumen,
  type ImpuestoResumen,
  type AjusteResumen,
  type FilaResumen,
} from './resumenTotalesLogica';
export { Kbd, useNombresTecla, type KbdProps } from './Kbd';
export { KbdButton, type KbdButtonProps } from './KbdButton';
export { clasesBoton, temaKbdDe, type VarianteBoton, type TamanoBoton, type PatronBoton, type TemaKbd } from './botonClases';
export { partesAtajo, etiquetaAtajo, ariaAtajo, claveAtajo, claveDeEvento, type EventoTecla } from './teclas';
export { useAtajos, resolverAtajo, agruparAtajos, type Atajo, type ContextoAtajo, type OpcionesAtajos } from './useAtajos';
export { BotonImporte, type BotonImporteProps } from './BotonImporte';
export { vistaBotonImporte, type EstadoBotonImporte } from './botonImporteLogica';
export { SelectorMetodoPago, type SelectorMetodoPagoProps } from './SelectorMetodoPago';
export { repartirMetodos, atajoMetodo, iconoMetodoPago, type MetodoPagoOpcion } from './metodosPago';
export { ListaPagos, type ListaPagosProps, type PagoLista, type EstadoPagoLista } from './ListaPagos';
// Documentos (cadena, chips, cabecera, líneas, totales, diálogo único de pago)
export * from './documento';
// Cobro y post-venta, vista y selectores de tercero
export { SeccionPlegable, type SeccionPlegableProps } from './SeccionPlegable';
export { ViewToggle, otraVista, type ViewToggleProps, type OpcionVista } from './ViewToggle';
export { ResultadoOperacion, type ResultadoOperacionProps, type AccionResultado, type TonoResultado } from './ResultadoOperacion';
export { SelectorEntidad, type SelectorEntidadProps, type TextosSelectorEntidad, type FiltroEntidad, type ContextoCrearEntidad } from './SelectorEntidad';
export { CustomerPicker, type CustomerPickerProps } from './CustomerPicker';
export { SupplierPicker, type SupplierPickerProps } from './SupplierPicker';
export {
  estadoListaEntidad,
  ofrecerCrear,
  lineaSecundaria,
  opcionCliente,
  opcionProveedor,
  type OpcionEntidad,
  type EstadoListaEntidad,
  type ClientePicker,
  type ProveedorPicker,
} from './selectorEntidadLogica';
// ── POS: piezas de venta (inicio)
// CartTag, CartLine, ProductCard, CategoryBar (POS-PLAN §3.3; adenda en KIT-CODIGO.md).
export { CartTag, type CartTagProps } from './CartTag';
export { vistaCartTag, clasesTonoCartTag, type TonoCartTag, type OrigenDescuento } from './cartTagLogica';
export { CartLine, type CartLineProps, type LineaCarrito } from './CartLine';
export {
  textoImpuestoLinea,
  controlesDeshabilitados,
  mostrarAgregarDescuento,
  cantidadDesdeTexto,
  ATAJOS_LINEA,
  type ModoImpuestoLinea,
  type ImpuestoLinea,
  type AccionLinea,
} from './cartLineLogica';
export { ProductCard, MarcadorSinFoto, type ProductCardProps } from './ProductCard';
export {
  UMBRAL_STOCK_BAJO,
  nivelStock,
  esAgotado,
  sinPrecio,
  eleccion,
  porcentajeDescuento,
  esTop,
  insigniasTarjeta,
  partesMeta,
  type ProductoTarjeta,
  type VarianteTarjeta,
  type StockTarjeta,
  type NivelStock,
} from './productCardLogica';
export { CategoryBar, type CategoryBarProps } from './CategoryBar';
export { opcionesBarra, esTopCategoria, type CategoriaBarra, type ValorCategoria, type IdCategoria } from './categoryBarLogica';
// ── POS: piezas de venta (fin)

// ── Selector de variantes (Figma `VariantModifierDialog` 155:7980) y enlace relacionado
export {
  SelectorVariantes,
  type SelectorVariantesProps,
  type AtributoSelector,
  type ValorAtributoSelector,
  type VarianteListaSelector,
  type StockVarianteSelector,
  type ResumenVarianteSelector,
  type GrupoSelector,
  type OpcionGrupoSelector,
  type ReglaGrupoSelector,
  type BloqueoSelector,
} from './SelectorVariantes';
export {
  CANTIDAD_MAXIMA_SELECTOR,
  nombreEnFrase,
  atributosEnFrase,
  etiquetaResumenVariante,
  acotarCantidad,
  totalSelector,
} from './selectorVariantesLogica';
export { RelatedLinkCard, type RelatedLinkCardProps, type TonoRelatedLink } from './RelatedLinkCard';
