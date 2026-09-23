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

// Tabla, tarjetas y acciones
export { DataTable, type DataTableProps, type ColumnaTabla, type EstadoTabla, type ContextoTarjeta } from './DataTable';
export { RowActionsMenu, type RowActionsMenuProps } from './RowActionsMenu';
export { ActionSheet, type ActionSheetProps } from './ActionSheet';
export { BulkActionBar, aplanarMenuMasivo, type BulkActionBarProps, type AccionMasiva, type GrupoMenuMasivo } from './BulkActionBar';
export { ListCard, type ListCardProps } from './ListCard';
export { AvatarIniciales, inicialesDe, type AvatarInicialesProps } from './AvatarIniciales';
export { TabBar, idPestana, idPanel, type TabBarProps, type PestanaTab } from './TabBar';
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
export { BranchBadge, BranchBadgeActiva, type BranchBadgeProps, type AlcanceSucursal } from './BranchBadge';
export { resolverEstado, etiquetaEstado, type TonoBadge, type AparienciaBadge } from './estadoTono';

// Formularios
export { FormSection, type FormSectionProps } from './FormSection';
export { FormField, type FormFieldProps, type PropsCampo } from './FormField';
export { SegmentedControl, type SegmentedControlProps, type OpcionSegmento } from './SegmentedControl';

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
