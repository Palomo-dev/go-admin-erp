'use client';

import React from 'react';
import { NavItem } from './NavItem';
import { NavSectionProps, NavItemProps } from '../types';

/**
 * Componente NavSection - Renderiza una sección de navegación con título y elementos de navegación
 * 
 * Este componente se encarga de estructurar cada sección del sidebar, mostrando un título
 * y los elementos de navegación correspondientes. Se adapta tanto al estado expandido
 * como al contraído del sidebar.
 * 
 * @param title - Título de la sección
 * @param items - Array de elementos de navegación
 * @param collapsed - Indica si el sidebar está contraído
 * @param sectionIdx - Índice de la sección para diferenciar cuando está contraído
 */
export const NavSection = ({
  title,
  items,
  collapsed,
  sectionIdx = 0,
  onNavigate
}: NavSectionProps) => {
  return (
    <div className="mb-4">
      {/* Título de la sección - Se adapta al estado contraído */}
      <h3 className={`px-3 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider ${collapsed ? 'lg:text-center lg:px-0' : ''}`}>
        {/* Cuando está contraído, mostrar un punto en lugar del título para una interfaz más limpia */}
        {collapsed ? (sectionIdx === 0 ? '•' : '•') : title}
      </h3>
      
      {/* Renderizar cada elemento de navegación usando el componente NavItem */}
      {items.map((item: NavItemProps, itemIdx: number) => (
        <NavItem 
          key={itemIdx} 
          item={item} 
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
};

export default NavSection;
