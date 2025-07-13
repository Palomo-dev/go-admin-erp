'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { SidebarProps } from '../types';
import { NavSection } from './NavSection';
import { Building2, CreditCard, LogOut, User } from 'lucide-react';

/**
 * Componente Sidebar - Contenedor principal de la barra lateral
 * 
 * Gestiona la visualización de las secciones de navegación, perfil de usuario,
 * botones de suscripción y cierre de sesión
 */
export const Sidebar = ({
  navSections,
  userData,
  orgName,
  collapsed,
  handleSignOut,
  loading
}: SidebarProps) => {
  return (
    <div className="space-y-1 transition-all duration-300">
      {/* Secciones de navegación */}
      {navSections.map((section, idx) => (
        <NavSection
          key={idx}
          title={section.title}
          items={section.items}
          collapsed={collapsed}
          sectionIdx={idx}
        />
      ))}
      
      {/* Sección de perfil */}
      <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
        {/* Información de perfil del usuario */}
        <Link href="/app/perfil" className={`block px-3 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors rounded-md ${collapsed ? 'lg:px-2 lg:text-center lg:relative lg:group' : ''}`}>
          <div className={`flex ${collapsed ? 'lg:justify-center' : ''} items-center`}>
            {/* Avatar del usuario */}
            <div className="flex-shrink-0 relative w-10 h-10 overflow-hidden rounded-full">
              {userData?.avatar ? (
                <Image 
                  src={userData.avatar} 
                  alt="Foto de perfil" 
                  width={40} 
                  height={40} 
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                  <User size={20} />
                </div>
              )}
            </div>

            {/* Información del usuario - visible solo cuando no está contraído */}
            {!collapsed && (
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {userData?.name || 'Usuario'}
                </p>
                <div className="flex flex-col space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {userData?.role && (
                    <p className="truncate">{userData.role}</p>
                  )}
                  {userData?.email && (
                    <p className="truncate">{userData.email}</p>
                  )}
                </div>
              </div>
            )}

            {/* Información del usuario en móvil */}
            {collapsed && (
              <div className="ml-3 overflow-hidden lg:hidden">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {userData?.name || 'Usuario'}
                </p>
                <div className="flex flex-col space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {userData?.role && (
                    <p className="truncate">{userData.role}</p>
                  )}
                  {userData?.email && (
                    <p className="truncate">{userData.email}</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Tooltip para mostrar la información de usuario cuando está contraído */}
            {collapsed && (
              <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
                <div className="bg-gray-800 text-white text-sm py-2 px-3 rounded shadow-lg min-w-[200px]">
                  <div className="font-medium mb-1">{userData?.name || 'Usuario'}</div>
                  {userData?.role && (
                    <div className="text-xs text-gray-300">{userData.role}</div>
                  )}
                  {userData?.email && (
                    <div className="text-xs text-gray-300 truncate">{userData.email}</div>
                  )}
                  {orgName && (
                    <div className="text-xs text-gray-300 mt-1 flex items-center">
                      <Building2 size={12} className="mr-1" />
                      <span className="truncate">{orgName}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Organización (visible cuando no está contraído) */}
            {!collapsed && orgName && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center">
                <Building2 size={12} className="mr-1" />
                <span className="truncate">{orgName}</span>
              </div>
            )}
            
            {/* Organización (visible en móvil) */}
            {collapsed && orgName && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center lg:hidden">
                <Building2 size={12} className="mr-1" />
                <span className="truncate">{orgName}</span>
              </div>
            )}
          </div>
        </Link>

        {/* Espacio adicional */}
        <div className="mb-3"></div>
        
        {/* Botón de suscripción destacado */}
        <Link 
          href="/app/suscripcion" 
          className={`w-full flex items-center justify-center px-3 py-2 mb-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-sm hover:shadow transition-all duration-200 border border-blue-500 ${collapsed ? 'lg:relative lg:group' : ''}`}
        >
          <CreditCard size={16} className={collapsed ? 'lg:mr-0' : 'mr-2'} />
          {!collapsed && <span>Mi Suscripción</span>}
          {collapsed && <span className="lg:hidden">Mi Suscripción</span>}
          
          {/* Tooltip para el botón de suscripción */}
          {collapsed && (
            <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
              <div className="bg-gray-800 text-white text-sm py-1 px-3 rounded shadow-lg">
                Mi Suscripción
              </div>
            </div>
          )}
        </Link>
        
        {/* Botón de cerrar sesión */}
        <button
          onClick={handleSignOut}
          disabled={loading}
          className={`w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors ${collapsed ? 'lg:relative lg:group' : ''}`}
        >
          <LogOut size={16} className={collapsed ? 'lg:mr-0' : 'mr-2'} />
          {!collapsed && <span>{loading ? 'Cerrando...' : 'Cerrar Sesión'}</span>}
          {collapsed && <span className="lg:hidden">{loading ? 'Cerrando...' : 'Cerrar Sesión'}</span>}
          
          {/* Tooltip para el botón de cerrar sesión */}
          {collapsed && (
            <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
              <div className="bg-gray-800 text-white text-sm py-1 px-3 rounded shadow-lg">
                {loading ? 'Cerrando...' : 'Cerrar Sesión'}
              </div>
            </div>
          )}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
