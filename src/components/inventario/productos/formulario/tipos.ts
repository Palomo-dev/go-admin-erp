import type { ModoFormularioProducto } from '@/lib/services/productoService';
import type {
  ErroresFormulario,
  EstadoFormularioProducto,
  SucursalBasica,
} from '../logica/formularioProducto';

/**
 * Contrato de las secciones del formulario único de producto. `ProductoForm`
 * carga los catálogos una vez y pasa el mismo estado a todas las secciones;
 * ninguna sección escribe en la base: todo se guarda en `fn_producto_guardar`.
 */

export interface CategoriaCatalogo {
  id: number;
  name: string;
  parent_id: number | null;
  station?: string | null;
}

export interface UnidadCatalogo {
  code: string;
  name: string;
}

export interface ImpuestoCatalogo {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
  tax_included: boolean | null;
}

export interface ProveedorCatalogo {
  id: number;
  name: string;
  nit: string | null;
}

export interface EtiquetaCatalogo {
  id: number;
  name: string;
  color: string | null;
}

export interface TipoVarianteCatalogo {
  id: number;
  name: string;
  valores: { id: number; value: string }[];
}

export interface CatalogosFormulario {
  sucursales: SucursalBasica[];
  categorias: CategoriaCatalogo[];
  unidades: UnidadCatalogo[];
  impuestos: ImpuestoCatalogo[];
  proveedores: ProveedorCatalogo[];
  etiquetas: EtiquetaCatalogo[];
  tiposVariante: TipoVarianteCatalogo[];
  /** Nombres de grupos de modificadores ya usados en la organización (sugerencias). */
  gruposModificador: string[];
}

export const CATALOGOS_VACIOS: CatalogosFormulario = {
  sucursales: [],
  categorias: [],
  unidades: [],
  impuestos: [],
  proveedores: [],
  etiquetas: [],
  tiposVariante: [],
  gruposModificador: [],
};

export interface MonedaFormulario {
  codigo: string;
  simbolo: string;
  decimales: number;
  formatear: (valor: number | string | null | undefined) => string;
}

export type CambiarCampo = <K extends keyof EstadoFormularioProducto>(campo: K, valor: EstadoFormularioProducto[K]) => void;

export interface PropsSeccionFormulario {
  estado: EstadoFormularioProducto;
  cambiar: CambiarCampo;
  /** Cambia varios campos a la vez (p. ej. servicio ⇒ sin inventario). */
  actualizar: (parcial: Partial<EstadoFormularioProducto>) => void;
  errores: ErroresFormulario;
  modo: ModoFormularioProducto;
  catalogos: CatalogosFormulario;
  /** Agrega un registro creado al vuelo (etiqueta, proveedor, categoría). */
  agregarACatalogo: <K extends keyof CatalogosFormulario>(clave: K, item: CatalogosFormulario[K][number]) => void;
  organizacionId: number;
  /** En editar: id del producto (enlaces a ajustes, exclusión de códigos). */
  productId?: number;
  productUuid?: string;
  moneda: MonedaFormulario;
  /** Día de la organización (YYYY-MM-DD) para vistas previas. */
  hoy: string;
}
