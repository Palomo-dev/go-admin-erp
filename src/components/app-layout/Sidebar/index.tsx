'use client';

/**
 * Archivo index.tsx para exportar todos los componentes del sidebar
 * Facilita la importación de componentes desde otras partes de la aplicación
 * 
 * Ejemplo de uso:
 * import { NavSection, NavItem, SidebarNavigation } from '@/components/app-layout/Sidebar';
 */

export * from './NavItem';
export * from './NavSection';
export * from './SidebarNavigation';

// Exportación por defecto para casos donde se requiera un solo componente principal
export { SidebarNavigation as default } from './SidebarNavigation';
