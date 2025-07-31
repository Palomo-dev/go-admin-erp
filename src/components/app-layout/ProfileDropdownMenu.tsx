'use client';

import React, { useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Building2, LogOut, CreditCard } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, User, Settings, Bell } from 'lucide-react';
import { UserData } from './types';
import { getAvatarUrl } from '@/lib/supabase/imageUtils';

interface ProfileDropdownMenuProps {
  userData: UserData | null;
  handleSignOut: () => Promise<void>;
  loading?: boolean;
  isSidebar?: boolean;
  collapsed?: boolean;
  orgName?: string;
}

export const ProfileDropdownMenu = ({ userData, handleSignOut, loading, isSidebar = false, collapsed = false, orgName }: ProfileDropdownMenuProps) => {
  const [open, setOpen] = useState(false);
  
  // Renderizado condicional para header o sidebar
  if (isSidebar) {
    // Versión para sidebar
    return (
      <div className="relative">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <div className={`block px-3 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors rounded-md ${collapsed ? 'lg:px-2 lg:text-center lg:relative lg:group' : ''}`}>
              <div className={`flex ${collapsed ? 'lg:justify-center' : ''} items-center`}>
                {/* Avatar del usuario */}
                <div className="flex-shrink-0 relative w-10 h-10 overflow-hidden rounded-full">
                  {userData?.avatar && getAvatarUrl(userData.avatar) ? (
                    <Image 
                      src={getAvatarUrl(userData.avatar)} 
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
                    <div className="flex flex-col space-y-1 text-xs text-gray-500 dark:text-gray-300">
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
                    <div className="flex flex-col space-y-1 text-xs text-gray-500 dark:text-gray-300">
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
                    <div className="bg-gray-800 dark:bg-gray-900 text-white text-sm py-2 px-3 rounded shadow-lg min-w-[200px]">
                      <div className="font-medium mb-1 text-white">{userData?.name || 'Usuario'}</div>
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
            </div>
          </DropdownMenuTrigger>
          
          {/* Menú desplegable - mismo contenido en ambas versiones */}
          <DropdownMenuContent 
            side="right" 
            align="start" 
            sideOffset={10} 
            alignOffset={0} 
            className="w-60 p-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          >
            {/* Contenido común - extraído a función para mantener DRY */}
            {renderDropdownContent(userData, handleSignOut, loading)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  } else {
    // Versión para header
    return (
      <div className="relative">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <div className="flex items-center space-x-2 p-1 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200">
              <div className="h-8 w-8 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                {userData?.avatar && getAvatarUrl(userData.avatar) ? (
                  <Image 
                    src={getAvatarUrl(userData.avatar)} 
                    alt="Avatar" 
                    width={32} 
                    height={32} 
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                    <User size={20} />
                  </div>
                )}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{userData?.name || 'Usuario'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{userData?.role || 'Usuario'}</p>
              </div>
              <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
            </div>
          </DropdownMenuTrigger>
          
          {/* Menú desplegable - mismo contenido en ambas versiones */}
          <DropdownMenuContent 
            side="bottom" 
            align="end" 
            sideOffset={5}
            className="w-60 p-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          >
            {/* Contenido común - extraído a función para mantener DRY */}
            {renderDropdownContent(userData, handleSignOut, loading)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
  
  // Función auxiliar para renderizar el contenido del menú desplegable
  // (es igual para ambas versiones, pero se mantiene dentro del componente para acceder a las props)
  function renderDropdownContent(userData: UserData | null, handleSignOut: () => Promise<void>, loading?: boolean) {
    return (
      <>
        {/* Información del usuario */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{userData?.name}</p>
          <div className="flex flex-col space-y-1 text-xs text-gray-500 dark:text-gray-300">
            {userData?.role && (
              <p className="truncate">{userData.role}</p>
            )}
            {userData?.email && (
              <p className="truncate">{userData.email}</p>
            )}
          </div>
        </div>
        
        {/* Botón de suscripción */}
        <DropdownMenuItem asChild>
          <Link href="/app/suscripcion" className="flex items-center bg-blue-600 hover:bg-blue-700 text-white hover:text-white w-full">
            <CreditCard size={14} className="mr-2" />
            Facturación
          </Link>
        </DropdownMenuItem>
        
        {/* Separador */}
        <DropdownMenuSeparator />
        
        {/* Opciones del menú */}
        <DropdownMenuItem asChild>
          <Link href="/app/perfil" className="flex items-center text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white w-full">
            <User size={14} className="mr-2" />
            Ver perfil
          </Link>
        </DropdownMenuItem>
        
        <DropdownMenuItem asChild>
          <Link href="/app/configuraciones" className="flex items-center text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white w-full">
            <Settings size={14} className="mr-2" />
            Configuraciones
          </Link>
        </DropdownMenuItem>
        
        <DropdownMenuItem asChild>
          <Link href="/app/notificaciones" className="flex items-center text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white w-full">
            <Bell size={14} className="mr-2" />
            Notificaciones
          </Link>
        </DropdownMenuItem>

        {/* Separador */}
        <DropdownMenuSeparator />
        
        {/* Botón de cierre de sesión */}
        <DropdownMenuItem 
          onClick={handleSignOut} 
          disabled={loading}
          className="flex items-center text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
        >
          <LogOut size={14} className="mr-2" />
          {loading ? 'Cerrando sesión...' : 'Cerrar sesión'}
        </DropdownMenuItem>
      </>
    );
  }
};

export default ProfileDropdownMenu;
