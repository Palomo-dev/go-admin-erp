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
  | 'invoice';

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
  usuarios: any[];
  productos: any[];
  proveedores: any[];
  categorias: any[];
  clientes: any[];
}

// Páginas predefinidas del sistema
export const PAGINAS_PREDEFINIDAS = [
  { id: 'inicio', name: 'Inicio', type: 'page', url: '/app' },
  { id: 'clientes', name: 'Clientes', type: 'page', url: '/app/clientes' },
  { id: 'organizacion', name: 'Organización', type: 'page', url: '/app/organizacion' },
  { id: 'usuarios', name: 'Usuarios', type: 'page', url: '/app/usuarios' },
  { id: 'finanzas', name: 'Finanzas', type: 'page', url: '/app/finanzas' },
  { id: 'inventario', name: 'Inventario', type: 'page', url: '/app/inventario' },
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
