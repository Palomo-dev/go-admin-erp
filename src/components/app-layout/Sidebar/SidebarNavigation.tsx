'use client';
import React from 'react';

// Importamos los componentes de Tooltip de Radix UI
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { 
  Bell, 
  Building2, 
  Bus, 
  Calendar, 
  CalendarClock, 
  CreditCard, 
  FileText, 
  HomeIcon, 
  LogOut, 
  Package, 
  Settings, 
  ShoppingCart, 
  User, 
  Users, 
  BarChart3
} from 'lucide-react';
import ProfileDropdownMenu from '../ProfileDropdownMenu';
import { NavItem } from './NavItem';
import { NavSection } from './NavSection';
import { SidebarNavigationProps } from '../types';

// Componente para la navegación lateral
export const SidebarNavigation = ({ 
  handleSignOut, 
  loading, 
  userData, 
  orgName,
  collapsed
}: SidebarNavigationProps) => {
  const pathname = usePathname();
  
  // Definición de las secciones de navegación con submenús
  const navSections = [
    {
      title: "Principal",
      items: [
        { name: "Inicio", href: "/app/inicio", icon: <HomeIcon size={18} /> }
      ]
    },
    {
      title: "Gestión",
      items: [
        { 
          name: "CRM", 
          href: "/app/crm", 
          icon: <Users size={18} />,
          submenu: [
            { name: "Clientes", href: "/app/crm/clientes" },
            { name: "Pipelines", href: "/app/crm/pipelines" },
            { name: "Tareas", href: "/app/crm/tareas" }
          ]
        },
        /* HRM Menu - Temporalmente desactivado
        { 
          name: "HRM", 
          href: "/app/hrm", 
          icon: <Users size={18} />,
          submenu: [
            { name: "Empleados", href: "/app/hrm/empleados" },
            { name: "Nómina", href: "/app/hrm/nomina" }
          ]
        },
        */
        { 
          name: "Finanzas", 
          href: "/app/finanzas", 
          icon: <FileText size={18} />,
          submenu: [
            { name: "Facturas de venta", href: "/app/finanzas/facturas-venta" },
            { name: "Facturas de compra", href: "/app/finanzas/facturas-compra" },
            { name: "Cuentas por cobrar", href: "/app/finanzas/cuentas-por-cobrar" },
            { name: "Cuentas por pagar", href: "/app/finanzas/cuentas-por-pagar" },
            { name: "Impuestos", href: "/app/finanzas/impuestos" },
            { name: "Monedas", href: "/app/finanzas/monedas" },
            { name: "Métodos de pago", href: "/app/finanzas/metodos-pago" }
          ]
        },
        { 
          name: "Inventario", 
          href: "/app/inventario", 
          icon: <Package size={18} />,
          submenu: [
            { name: "Productos", href: "/app/inventario/productos" },
            { name: "Categorías", href: "/app/inventario/categorias" },
            { name: "Proveedores", href: "/app/inventario/proveedores" }
          ]
        },
      ]
    },
    {
      title: "Ventas",
      items: [
        { 
          name: "POS", 
          href: "/app/pos", 
          icon: <ShoppingCart size={18} />,
          submenu: [
            { name: "POS", href: "/app/pos" },
            { name: "Carritos", href: "/app/pos/carritos" },
            { name: "Cajas", href: "/app/pos/cajas" },
            { name: "Clientes Multiples", href: "/app/pos/clientes-multiples" },
            { name: "Cobro", href: "/app/pos/cobro" },
            { name: "Cuentas por Cobrar", href: "/app/pos/cuentas-por-cobrar" },
            { name: "Devoluciones", href: "/app/pos/devoluciones" },
            { name: "Pagos Pendientes", href: "/app/pos/pagos-pendientes" },
            /*{ name: "Reportes", href: "/app/pos/reportes" },
            { name: "Configuración", href: "/app/pos/configuración" },
            { name: "Mesas", href: "/app/pos/mesas" },
            { name: "Habitaciones", href: "/app/pos/habitaciones" },
            { name: "Comandas", href: "/app/pos/comandas" },*/  
          ]
        },
        /*{ 
          name: "PMS", 
          href: "/app/pms", 
          icon: <Building2 size={18} />,
          submenu: []
        }*/
      ]
    },
    {
      title: "Organización",
      items: [
        /*{ name: "Calendario", href: "/app/calendario", icon: <Calendar size={18} /> },*/
        { name: "Clientes", href: "/app/clientes", icon: <Users size={18} /> },
        { name: "Organización", href: "/app/organizacion", icon: <Building2 size={18} /> },
       /*{{ name: "Reportes", href: "/app/reportes", icon: <BarChart3 size={18} /> },
        { name: "Timeline", href: "/app/timeline", icon: <CalendarClock size={18} /> },
        { name: "Transporte", href: "/app/transporte", icon: <Bus size={18} /> }*/
      ]
    },
     /*{
      title: "Sistema",
      items: [
        { name: "Notificaciones", href: "/app/notificaciones", icon: <Bell size={18} /> },
        { name: "Integraciones", href: "/app/integraciones", icon: <Settings size={18} /> }
      ]
    }*/
  ];
  
  return (
    <div className="flex flex-col h-full justify-between transition-all duration-300">
      {/* Contenedor superior para las secciones de navegación */}
      <div className="space-y-1 flex-grow overflow-y-auto">
        {/* Secciones de navegación utilizando el componente NavSection */}
        {navSections.map((section, idx) => (
          <NavSection
            key={idx}
            title={section.title}
            items={section.items}
            collapsed={collapsed}
            sectionIdx={idx}
          />
        ))}
      </div>
      
      {/* Sección de perfil con el componente UserMenu compartido - siempre abajo */}
      <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800 pb-2">
        <ProfileDropdownMenu 
          userData={userData} 
          handleSignOut={handleSignOut} 
          loading={loading} 
          isSidebar={true} 
          collapsed={collapsed} 
          orgName={orgName || undefined} 
        />
        {/* Espacio adicional */}
        <div className="mb-3"></div>
        
        {/* Botón de suscripción destacado */}
        <TooltipProvider>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link 
                  href="/app/suscripcion" 
                  className="w-full flex items-center justify-center px-3 py-2 mb-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-sm hover:shadow transition-all duration-200 border border-blue-500"
                >
                  <CreditCard size={16} />
                  <span className="lg:hidden">Mi Suscripción</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent 
                side="right" 
                sideOffset={10} 
                className="bg-white text-gray-900 dark:bg-gray-100 dark:text-gray-800 border border-gray-200 rounded-lg py-1 px-2 shadow-md"
              >
                Mi Suscripción
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link 
              href="/app/suscripcion" 
              className="w-full flex items-center justify-center px-3 py-2 mb-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-sm hover:shadow transition-all duration-200 border border-blue-500"
            >
              <CreditCard size={16} className="mr-2" />
              <span>Mi Suscripción</span>
            </Link>
          )}
        </TooltipProvider>
        
        {/* Botón de cerrar sesión */}
        <TooltipProvider>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  disabled={loading}
                  className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                >
                  <LogOut size={16} />
                  <span className="lg:hidden">{loading ? 'Cerrando...' : 'Cerrar Sesión'}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent 
                side="right" 
                sideOffset={10} 
                className="bg-white text-gray-900 dark:bg-gray-100 dark:text-gray-800 border border-gray-200 rounded-lg py-1 px-2 shadow-md"
              >
                {loading ? 'Cerrando...' : 'Cerrar Sesión'}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
            >
              <LogOut size={16} className="mr-2" />
              <span>{loading ? 'Cerrando...' : 'Cerrar Sesión'}</span>
            </button>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
};
