/**
 * Buscador global (Figma `02 Componentes` › Header › SearchCommand 46:2493):
 * qué grupos de datos y qué acciones rápidas EXISTEN.
 *
 * Qué NO decide este archivo: qué ve cada persona. Cada grupo y cada acción
 * nombra la página del catálogo de navegación (`CATALOGO_NAV`) que la
 * respalda; el servidor calcula las páginas visibles de la persona con
 * `filtrarNavegacion()` —módulos activos de la organización, páginas
 * apagadas, acceso del cargo— y solo busca en los grupos cuya página ve.
 * Las acciones exigen además un permiso resuelto en la base
 * (`get_user_permission_codes`, rol + cargo). Así ningún módulo ni ruta
 * se decide aquí: si la organización apaga Inventario, «Productos» y
 * «Nuevo producto» desaparecen solos.
 *
 * `__tests__/busquedaGlobal.test.ts` exige que toda página nombrada aquí exista
 * en el catálogo: si una ruta cambia de sitio, la prueba avisa.
 */

/** Tipos de entidad que busca el servidor, en el orden en que se pintan. */
export const TIPOS_ENTIDAD = [
  'customer',
  'product',
  'branch',
  'supplier',
  'category',
  'invoice',
  'web_order',
  'reservation',
  'space',
  'membership',
  'parking_vehicle',
] as const;

export type TipoEntidad = (typeof TIPOS_ENTIDAD)[number];

export interface DefinicionGrupo {
  tipo: TipoEntidad;
  /**
   * Páginas del catálogo que respaldan el grupo, por preferencia. El grupo se
   * busca si la persona ve alguna; la primera visible es el destino cuando la
   * entidad no tiene detalle propio (vehículos, sucursales).
   */
  paginas: readonly string[];
}

export const GRUPOS_ENTIDAD: readonly DefinicionGrupo[] = [
  { tipo: 'customer', paginas: ['/app/clientes'] },
  { tipo: 'product', paginas: ['/app/inventario/productos'] },
  { tipo: 'branch', paginas: ['/app/organizacion/sucursales'] },
  { tipo: 'supplier', paginas: ['/app/inventario/proveedores'] },
  { tipo: 'category', paginas: ['/app/inventario/categorias'] },
  { tipo: 'invoice', paginas: ['/app/finanzas/facturas-venta'] },
  { tipo: 'web_order', paginas: ['/app/pos/pedidos-online'] },
  { tipo: 'reservation', paginas: ['/app/pms/reservas'] },
  { tipo: 'space', paginas: ['/app/pms/espacios'] },
  { tipo: 'membership', paginas: ['/app/membresias/membresias'] },
  { tipo: 'parking_vehicle', paginas: ['/app/pms/parking', '/app/parking/operacion'] },
];

export const IDS_ACCION = ['nuevaVenta', 'nuevaFactura', 'nuevoCliente', 'nuevoProducto', 'nuevaReserva'] as const;
export type IdAccion = (typeof IDS_ACCION)[number];

export interface DefinicionAccion {
  id: IdAccion;
  /** A dónde lleva la acción. */
  href: string;
  /** Página del catálogo que la respalda: sin ella visible, no se ofrece. */
  pagina: string;
  /** Basta con uno (rol + cargo). Un admin de la organización los tiene todos. */
  permisos: readonly string[];
}

export const ACCIONES_RAPIDAS: readonly DefinicionAccion[] = [
  { id: 'nuevaVenta', href: '/app/pos', pagina: '/app/pos', permisos: ['pos.create', 'pos_access', 'sales_management'] },
  {
    id: 'nuevaFactura',
    href: '/app/finanzas/facturas-venta/nuevo',
    pagina: '/app/finanzas/facturas-venta',
    permisos: ['finance.create', 'billing_management'],
  },
  {
    id: 'nuevoCliente',
    href: '/app/clientes/new',
    pagina: '/app/clientes',
    permisos: ['crm.customers.create', 'customer_management'],
  },
  {
    id: 'nuevoProducto',
    href: '/app/inventario/productos/nuevo',
    pagina: '/app/inventario/productos',
    permisos: ['inventory.create', 'product_management', 'inventory_management'],
  },
  {
    id: 'nuevaReserva',
    href: '/app/pms/reservas/nueva',
    pagina: '/app/pms/reservas',
    permisos: ['pms.reservations.create', 'reservation_management'],
  },
];

/** Datos de una fila de resultado, sin textos de interfaz: el cliente los traduce y formatea. */
export interface DetalleEntidad {
  documento?: string | null;
  tipoDocumento?: string | null;
  email?: string | null;
  sku?: string | null;
  stock?: number | null;
  direccion?: string | null;
  ciudad?: string | null;
  nit?: string | null;
  numero?: string | null;
  cliente?: string | null;
  total?: number | null;
  moneda?: string | null;
  estado?: string | null;
  /** Fecha calendario (`date`): se pinta con `formatPlainDate`. */
  desdeFecha?: string | null;
  hastaFecha?: string | null;
  /** Instante (`timestamptz`): se pinta en la zona de la organización. */
  desdeInstante?: string | null;
  hastaInstante?: string | null;
  espacio?: string | null;
  tipoEspacio?: string | null;
  zona?: string | null;
  plan?: string | null;
  marca?: string | null;
  modelo?: string | null;
  color?: string | null;
}

export interface ResultadoEntidad {
  id: string;
  tipo: TipoEntidad;
  /** Nombre, placa, número… `null` si la fila no lo tiene (la UI pone «Sin nombre»). */
  titulo: string | null;
  url: string;
  detalle: DetalleEntidad;
}

export interface GrupoResultados {
  tipo: TipoEntidad;
  items: ResultadoEntidad[];
}

/** Respuesta de `GET /api/busqueda-global`. */
export interface RespuestaBusquedaGlobal {
  grupos: GrupoResultados[];
  /** Grupos cuya consulta falló: la UI avisa sin ocultar lo que sí llegó. */
  fallidos: TipoEntidad[];
  acciones: { id: IdAccion; href: string }[];
}
