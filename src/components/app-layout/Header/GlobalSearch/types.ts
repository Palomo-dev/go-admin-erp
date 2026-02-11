import { ReactElement } from 'react';

export type SearchResultType = 
  | 'organization'
  | 'branch'
  | 'user'
  | 'customer'
  | 'page'
  | 'product'
  | 'supplier'
  | 'category'
  | 'invoice'
  | 'web_order'
  | 'reservation'
  | 'space'
  | 'membership'
  | 'parking_vehicle';

export type SearchResult = {
  id: string | number;
  name: string;
  description?: string;
  type: SearchResultType;
  url: string;
  avatarUrl?: string;       // Para usuarios/clientes con imagen de perfil
  imagePath?: string;       // Para productos con imagen
  initials?: string;        // Para generar avatar si no hay imagen
  color?: string;           // Color para avatar generado
};

export interface SearchDataResult {
  organizaciones: any[];
  sucursales: any[];
  productos: any[];
  proveedores: any[];
  categorias: any[];
  clientes: any[];
  facturas: any[];
  pedidosOnline: any[];
  reservas: any[];
  espacios: any[];
  membresias: any[];
  vehiculosParking: any[];
}

// Páginas predefinidas del sistema
export const PAGINAS_PREDEFINIDAS = [
  { id: 'inicio', name: 'Inicio', type: 'page', url: '/app' },
  { id: 'clientes', name: 'Clientes', type: 'page', url: '/app/clientes' },
  { id: 'organizacion', name: 'Organización', type: 'page', url: '/app/organizacion' },
  { id: 'finanzas', name: 'Finanzas', type: 'page', url: '/app/finanzas' },
  { id: 'facturas-venta', name: 'Facturas de Venta', type: 'page', url: '/app/finanzas/facturas-venta' },
  { id: 'inventario', name: 'Inventario', type: 'page', url: '/app/inventario' },
  { id: 'pedidos-online', name: 'Pedidos Online', type: 'page', url: '/app/pos/pedidos-online' },
  { id: 'reservas', name: 'Reservas', type: 'page', url: '/app/pms/reservas' },
  { id: 'espacios', name: 'Espacios', type: 'page', url: '/app/pms/espacios' },
  { id: 'membresias', name: 'Membresías', type: 'page', url: '/app/gym/membresias' },
  { id: 'parking', name: 'Parqueadero', type: 'page', url: '/app/pms/parking' },
  { id: 'reportes', name: 'Reportes', type: 'page', url: '/app/reportes' },
  { id: 'calendario', name: 'Calendario', type: 'page', url: '/app/calendario' },
  { id: 'notificaciones', name: 'Notificaciones', type: 'page', url: '/app/notificaciones' },
  { id: 'configuracion', name: 'Configuración', type: 'page', url: '/app/configuracion' },
];

// Páginas filtradas para mostrar inicialmente en la búsqueda
export const PAGINAS_INICIALES = [
  { id: 'productos', name: 'Productos', type: 'page', url: '/app/inventario/productos' },
  { id: 'proveedores', name: 'Proveedores', type: 'page', url: '/app/proveedores' },
  { id: 'categorias', name: 'Categorías', type: 'page', url: '/app/inventario/categorias' },
  { id: 'organizacion', name: 'Organización', type: 'page', url: '/app/organizacion' },
  { id: 'perfil', name: 'Mi Perfil', type: 'page', url: '/app/perfil' },
];
