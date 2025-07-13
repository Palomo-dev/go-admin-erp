'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { NavItemComponentProps } from '../types';

// Componente para elemento de navegación con posible submenú
export const NavItem = ({ item, collapsed }: NavItemComponentProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
  
  // Para abrir automáticamente el submenú de una sección activa
  useEffect(() => {
    if (isActive && item.submenu) {
      setIsOpen(true);
    }
  }, [isActive, item.submenu]);
  
  // Si tiene submenú, controla su apertura/cierre
  const handleClick = () => {
    if (item.submenu) {
      setIsOpen(!isOpen);
    }
  };
  
  return (
    <div>
      <div 
        className={`
          flex items-center justify-between ${collapsed ? 'lg:justify-center' : ''} px-3 py-2 rounded-md text-sm font-medium
          ${isActive 
            ? 'bg-blue-50 text-blue-600 dark:bg-gray-700 dark:text-blue-300 font-semibold' 
            : 'text-gray-700 hover:bg-blue-50/50 hover:text-blue-600 dark:text-gray-300 dark:hover:bg-gray-700/50'
          }
          transition-all duration-200 cursor-pointer
          ${collapsed ? 'lg:relative lg:group' : ''}
        `}>
        <Link href={item.href} className={`flex items-center ${collapsed ? 'lg:justify-center lg:w-full' : 'flex-grow'}`}>
          <span className={`
              inline-block ${collapsed ? 'lg:mr-0' : 'mr-3'} transition-colors duration-200
              ${isActive ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}
            `}>
            {item.icon}
          </span>
          {!collapsed && <span>{item.name}</span>}
          {collapsed && <span className="lg:hidden">{item.name}</span>}
          {/* Tooltip para mostrar el nombre cuando está contraído */}
          {collapsed && (
            <div className="absolute left-full ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
              <div className="bg-gray-800 text-white text-sm py-1 px-3 rounded shadow-lg">
                {item.name}
              </div>
            </div>
          )}
        </Link>
        {item.submenu && !collapsed && (
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="ml-auto pl-1"
            aria-expanded={isOpen}
            aria-label={isOpen ? `Cerrar ${item.name}` : `Abrir ${item.name}`}
          >
            <ChevronRight size={16} className={`transition-transform duration-200 ${isOpen ? 'transform rotate-90' : ''}`} />
          </button>
        )}
      </div>
      
      {/* Submenú desplegable con animación */}
      {item.submenu && (
        <div 
          className={`
            ml-6 space-y-1 overflow-hidden transition-all duration-300 ease-in-out
            ${isOpen ? 'max-h-60 opacity-100 mt-1' : 'max-h-0 opacity-0'}
          `}
        >
          {item.submenu.map((subItem, subIdx) => (
            <Link 
              key={subIdx} 
              href={subItem.href}
              className={`
                flex items-center px-3 py-1.5 text-sm rounded-md transition-colors duration-200
                ${pathname === subItem.href 
                  ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/20 dark:text-blue-200' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50/40 dark:text-gray-400 dark:hover:text-gray-200'}
              `}
            >
              <span className="h-1 w-1 bg-gray-400 rounded-full mr-2"></span>
              {subItem.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
