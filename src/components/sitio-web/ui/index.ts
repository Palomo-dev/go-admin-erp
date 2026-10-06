/**
 * Componentes compartidos del módulo Sitio web (Figma A/07, B/02 y D/02).
 * Los usan las páginas del módulo y el editor: si cambian aquí, cambian en
 * todos. Lo genérico (barras de guardado, avisos, diálogos) vive en el kit.
 */
export { IconoEstadoPublicacion, SubtituloConEstado, type IconoEstadoPublicacionProps } from './IconoEstadoPublicacion';
export { FilaSubtitulo, SubtituloConIcono, type SubtituloConIconoProps } from './SubtituloConIcono';
export { SelectorAnchoVista, etiquetaAncho, type SelectorAnchoVistaProps } from './SelectorAnchoVista';
export { PublishStatusBadge, useEtiquetaPublicacion, type PublishStatusBadgeProps } from './PublishStatusBadge';
export { resolverEstadoPublicacion, ESTADO_TONO_PUBLICACION, type EstadoPublicacion, type DatosPublicacion } from './estadoPublicacion';
export { ChecklistItem, type ChecklistItemProps, type EstadoChecklist, type AccionChecklist } from './ChecklistItem';
export { SortableRow, type SortableRowProps } from './SortableRow';
export { MenuLinkRow, type MenuLinkRowProps, type TipoEnlaceMenu } from './MenuLinkRow';
export { FontPairOption, type FontPairOptionProps } from './FontPairOption';
export { ColorField, type ColorFieldProps } from './ColorField';
export { SitePreview, type SitePreviewProps } from './SitePreview';
export { DevicePreviewFrame, type DevicePreviewFrameProps } from './DevicePreviewFrame';
export { DISPOSITIVOS_VISTA, VIEWPORT_DISPOSITIVO, escalaVista, origenDe, type DispositivoVista } from './dispositivos';
export { StylePresetCard, type StylePresetCardProps, type MuestraEstilo } from './StylePresetCard';
export { TemplateCard, type TemplateCardProps } from './TemplateCard';
export { SectionThumbnail, TIPOS_MINIATURA_SECCION, type SectionThumbnailProps, type TipoMiniaturaSeccion } from './SectionThumbnail';
export {
  DomainStatusBadge,
  resolverEstadoDominio,
  DIAS_AVISO_VENCIMIENTO,
  type DomainStatusBadgeProps,
  type EstadoDominio,
} from './DomainStatusBadge';
export { DnsRecordRow, type DnsRecordRowProps, type EstadoRegistroDns } from './DnsRecordRow';
export { PriceTag, formatearPrecio, type PriceTagProps } from './PriceTag';
export { ProviderGuideTabs, PROVEEDORES_DNS, type ProviderGuideTabsProps, type ProveedorDns } from './ProviderGuideTabs';
export { QRCard, type QRCardProps } from './QRCard';
export { InheritanceTag, type InheritanceTagProps, type OrigenValor } from './InheritanceTag';
export { OutletSwitcher, type OutletSwitcherProps, type SedeEditable } from './OutletSwitcher';
export { HeaderLayoutThumb, DISPOSICIONES_ENCABEZADO, type HeaderLayoutThumbProps, type DisposicionEncabezado } from './HeaderLayoutThumb';
export { SiteHeaderPreview, type SiteHeaderPreviewProps, type EnlaceVista } from './SiteHeaderPreview';
export { SiteFooterPreview, type SiteFooterPreviewProps, type DisposicionPie, type ColumnaPie, type RedSocialVista } from './SiteFooterPreview';
export { MegaMenuPreview, type MegaMenuPreviewProps, type ColumnaMegaMenu } from './MegaMenuPreview';
export { TEMA_VISTA_RESPALDO, estilosTema, type TemaVistaSitio } from './temaVistaSitio';
export { useTextosComun, useListaComun, TEXTOS_COMUN, type TraductorComun } from './textos';
export { FontOption, type FontOptionProps } from './FontOption';
export { FontField, type FontFieldProps } from './FontField';
export { ColorMarcaField, type ColorMarcaFieldProps } from './ColorMarcaField';
export { DeviceToggle, DeviceToggleGroup, type DeviceToggleProps, type DeviceToggleGroupProps } from './DeviceToggle';
export { DeviceVisibilityChip, type DeviceVisibilityChipProps } from './DeviceVisibilityChip';
export {
  DISPOSITIVOS_SITIO,
  resumirVisibilidad,
  desdeVisibilidadDocumento,
  type DispositivoSitio,
  type VisibilidadDispositivos,
  type ResumenVisibilidad,
} from './visibilidadDispositivo';
export { CampoLogoFavicon, type CampoLogoFaviconProps, type CampoIdentidadImagen } from './CampoLogoFavicon';
export { EtiquetaDieta, type EtiquetaDietaProps, type TipoEtiquetaDieta } from './EtiquetaDieta';
export { CajaIcono, type CajaIconoProps, type TonoCajaIcono } from './CajaIcono';
export {
  TRAZO_ICONO,
  TAMANO_ICONO,
  CLASE_TAMANO_ICONO,
  CAJA_ICONO,
  CLASE_ICONO_TONO,
  ICONO_ESTADO_PUBLICACION,
  ICONO_TAREA_SITIO,
  ICONO_KPI_SITIO,
  ICONO_GIRO_SITIO,
  ICONO_GIRO_PLANTILLA,
  ICONO_DISPOSITIVO_VISTA,
  ICONO_GRUPO_ESTILO,
  ICONO_PESTANA_DISENO,
  ICONO_SUBTITULO_SITIO,
  iconoGira,
  type TamanoIcono,
  type TamanoCajaIcono,
  type TareaSitio,
  type KpiSitio,
  type GiroIcono,
  type GiroPlantillaIcono,
  type DispositivoIcono,
  type GrupoEstilo,
} from './iconosSitio';
