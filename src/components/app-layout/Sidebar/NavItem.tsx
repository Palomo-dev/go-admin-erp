'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, FileText, Settings, Users, LogOut, Plus, List, Home, User, CreditCard, BarChart2 } from 'lucide-react';
import { NavItemComponentProps } from '../types';

// Importamos los componentes de Dropdown Menu de shadcn-ui
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

// Importamos los componentes de Tooltip de Radix UI
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

// Mapa de iconos para los submenús
const getSubmenuIcon = (name: string) => {
  const iconMap: {[key: string]: React.ReactNode} = {
    'Inicio': <Home size={16} />,
    'Perfil': <User size={16} />,
    'Usuarios': <Users size={16} />,
    'Configuración': <Settings size={16} />,
    'Reportes': <BarChart2 size={16} />,
    'Facturas': <FileText size={16} />,
    'Pagos': <CreditCard size={16} />,
    'Lista': <List size={16} />,
    'Agregar': <Plus size={16} />,
    'Salir': <LogOut size={16} />
  };
  
  return iconMap[name] || <FileText size={16} />; // Icono por defecto
};

// Componente para elemento de navegación con posible submenú
export const NavItem = ({ item, collapsed, onNavigate }: NavItemComponentProps) => {
  // Estados separados para móvil y desktop
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDesktopOpen, setIsDesktopOpen] = useState(false);
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
  
  // Ya no abrimos automáticamente el submenú cuando la sección está activa
  // Solo se abrirá cuando el usuario haga clic explícitamente
  // useEffect(() => {
  //   if (isActive && item.submenu) {
  //     setIsMobileOpen(true);
  //     setIsDesktopOpen(true);
  //   }
  // }, [isActive, item.submenu]);
  
  // Cerrar el menú desplegable cuando se navega a una página
  useEffect(() => {
    // Al cambiar la ruta, cerrar el menú desplegable
    setIsDesktopOpen(false);
    setIsMobileOpen(false);
  }, [pathname]);
  
  // Manejadores separados para móvil y desktop
  const handleMobileClick = () => {
    if (item.submenu) {
      setIsMobileOpen(!isMobileOpen);
    }
  };
  
  // Específico para el DropdownMenu de desktop
  const handleDesktopOpenChange = (open: boolean) => {
    setIsDesktopOpen(open);
  };
  
  // Separamos lógica para móvil y desktop con clases CSS
  return (
    <TooltipProvider>
      <div className="relative">
        {item.submenu ? (
        // Sistema dual: submenú clásico para móvil, DropdownMenu para desktop
        <>
          {/* VERSIÓN MÓVIL - Submenú clásico desplegable */}
          <div className="md:hidden">
            <div 
              onClick={handleMobileClick}
              className={`
                flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium w-full min-h-[44px]
                ${isActive 
                  ? 'bg-blue-50 text-blue-600 dark:bg-gray-700 dark:text-blue-300 font-semibold' 
                  : 'text-gray-700 hover:bg-blue-50/50 hover:text-blue-600 active:bg-blue-100 dark:text-gray-300 dark:hover:bg-gray-700/50 dark:active:bg-gray-700'
                }
                transition-all duration-200 cursor-pointer
              `}
            >
              <div className="flex items-center flex-grow">
                <span className={`
                    inline-block mr-3 transition-colors duration-200
                    ${isActive ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}
                  `}>
                  {item.icon}
                </span>
                <span>{item.name}</span>
              </div>
              <ChevronDown 
                size={16} 
                className={`transition-transform duration-200 ${isMobileOpen ? 'transform rotate-180' : ''}`} 
              />
            </div>

            {/* Submenú desplegable para móvil */}
            <div
              className={`overflow-hidden transition-all duration-300 ${isMobileOpen ? 'max-h-60' : 'max-h-0'}`}
            >
              <div className="pl-7 py-1 space-y-1">
                {item.submenu.map((subItem, subIdx) => (
                  <Link
                    key={subIdx}
                    href={subItem.href}
                    onClick={onNavigate}
                    className={`
                      flex items-center px-3 py-1.5 text-sm rounded-md min-h-[40px]
                      ${pathname === subItem.href
                        ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/20 dark:text-blue-200'
                        : 'text-gray-600 hover:text-blue-600 active:bg-blue-50 dark:text-gray-400 dark:hover:text-gray-200 dark:active:bg-gray-700'}
                    `}
                  >
                    <span className="mr-2.5 text-gray-500 dark:text-gray-400">
                      {getSubmenuIcon(subItem.name)}
                    </span>
                    <span className="truncate">{subItem.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Versión desktop: DropdownMenu con iconos y mejor posicionamiento */}
          <div className="hidden md:block">
            <DropdownMenu open={isDesktopOpen} onOpenChange={handleDesktopOpenChange}>
              <DropdownMenuTrigger asChild>
                <div 
                  className={`
                    flex items-center justify-between ${collapsed ? 'lg:justify-center' : ''} px-3 py-2 rounded-md text-sm font-medium w-full
                    ${isActive 
                      ? 'bg-blue-50 text-blue-600 dark:bg-gray-700 dark:text-blue-300 font-semibold' 
                      : 'text-gray-700 hover:bg-blue-100 hover:text-blue-600 dark:text-gray-300 dark:hover:bg-gray-700/70 dark:hover:text-blue-300'}
                    transition-all duration-150 ease-in-out cursor-pointer
                    ${collapsed ? 'lg:relative lg:group' : ''}
                  `}>
                  <div className={`flex items-center ${collapsed ? 'lg:justify-center lg:w-full' : 'flex-grow'}`}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`
                            inline-block ${collapsed ? 'lg:mr-0' : 'mr-3'} transition-colors duration-200
                            ${isActive ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}
                          `}>
                            {item.icon}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={10} className="bg-white text-gray-900 dark:bg-gray-100 dark:text-gray-800 border border-gray-200 rounded-lg py-1 px-2 shadow-md">
                          {item.name}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className={`
                        inline-block mr-3 transition-colors duration-200
                        ${isActive ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}
                      `}>
                        {item.icon}
                      </span>
                    )}
                    {!collapsed && <span>{item.name}</span>}
                    {collapsed && <span className="lg:hidden">{item.name}</span>}
                  </div>
                  {!collapsed && (
                    <ChevronRight 
                      size={16} 
                      className={`transition-transform duration-200 ${isDesktopOpen ? 'transform rotate-90' : ''}`} 
                    />
                  )}
                </div>
              </DropdownMenuTrigger>
              
              <DropdownMenuContent 
                side="right"
                align="start"
                sideOffset={10}
                alignOffset={0}
                className="w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-md py-1.5"
              >
                {item.submenu.map((subItem, subIdx) => (
                  <DropdownMenuItem key={subIdx} asChild>
                    <Link 
                      href={subItem.href}
                      onClick={onNavigate}
                      className={`
                        flex items-center px-3 py-2 text-sm w-full cursor-default
                        ${pathname === subItem.href 
                          ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/20 dark:text-blue-200' 
                          : 'text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-gray-200'}
                      `}
                    >
                      <span className="mr-2.5 text-gray-500 dark:text-gray-400">
                        {getSubmenuIcon(subItem.name)}
                      </span>
                      <span className="truncate">{subItem.name}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      ) : (
        // Si no tiene submenú, simplemente renderiza un enlace
        <Link
          href={item.href}
          onClick={onNavigate}
          className={`
            flex items-center ${collapsed ? 'lg:justify-center' : ''} px-3 py-2 rounded-md text-sm font-medium min-h-[44px]
            ${isActive 
              ? 'bg-blue-50 text-blue-600 dark:bg-gray-700 dark:text-blue-300 font-semibold' 
              : 'text-gray-700 hover:bg-blue-50/50 hover:text-blue-600 active:bg-blue-100 dark:text-gray-300 dark:hover:bg-gray-700/50 dark:active:bg-gray-700'}
            transition-all duration-200 cursor-pointer
            ${collapsed ? 'lg:relative lg:group' : ''}
          `}
        >
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`
                  inline-block ${collapsed ? 'lg:mr-0' : 'mr-3'} transition-colors duration-200
                  ${isActive ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}
                `}>
                  {item.icon}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10} className="bg-white text-gray-900 dark:bg-gray-100 dark:text-gray-800 border border-gray-200 rounded-lg py-1 px-2 shadow-md">
                {item.name}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className={`
              inline-block mr-3 transition-colors duration-200
              ${isActive ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}
            `}>
              {item.icon}
            </span>
          )}
          {!collapsed && <span>{item.name}</span>}
          {collapsed && <span className="lg:hidden">{item.name}</span>}
        </Link>
        )}
      </div>
    </TooltipProvider>
  );
}
