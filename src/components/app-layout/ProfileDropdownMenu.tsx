'use client';

import React, { useState, useEffect } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Building2, LogOut, CreditCard, X } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, User, Settings, Bell, ChevronRight } from 'lucide-react';
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
  const [isMobile, setIsMobile] = useState(false);
  
  // Detectar si estamos en móvil
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Renderizado condicional para header o sidebar
  if (isSidebar) {
    // En móvil, usar modal fullscreen en lugar de dropdown
    if (isMobile) {
      return (
        <div className="relative">
          {/* Botón trigger */}
          <button
            onClick={() => setOpen(!open)}
            className="block w-full px-3 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors rounded-md min-h-[60px]"
          >
            <div className="flex items-center">
              {/* Avatar del usuario */}
              <div className="flex-shrink-0 relative w-12 h-12 overflow-hidden rounded-full">
                {userData?.avatar && getAvatarUrl(userData.avatar) ? (
                  <Image 
                    src={getAvatarUrl(userData.avatar)} 
                    alt="Foto de perfil" 
                    width={48} 
                    height={48} 
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                    <User size={24} />
                  </div>
                )}
              </div>

              {/* Información del usuario */}
              <div className="ml-3 overflow-hidden flex-1">
                <p className="text-base font-medium text-gray-800 dark:text-gray-200 truncate">
                  {userData?.name || 'Usuario'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {userData?.role || 'Usuario'}
                </p>
              </div>
              
              {/* Icono chevron */}
              <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
            </div>
          </button>
          
          {/* Modal fullscreen para móvil */}
          {open && (
            <>
              {/* Overlay - con position fixed absoluto */}
              <div 
                className="fixed bg-black bg-opacity-50 z-[100] lg:hidden"
                onClick={() => setOpen(false)}
                style={{ 
                  position: 'fixed',
                  inset: 0,
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '100vw',
                  height: '100vh'
                }}
              />
              
              {/* Panel - con width viewport completo */}
              <div 
                className="fixed bottom-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl animate-slide-up max-h-[85vh] flex flex-col z-[101] lg:hidden"
                style={{ 
                  position: 'fixed',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: '100vw',
                  maxWidth: '100vw'
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Mi Cuenta</h3>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <X size={20} className="text-gray-500 dark:text-gray-400" />
                  </button>
                </div>
                
                {/* Contenido scrollable */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  {/* Info de usuario */}
                  <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 relative w-16 h-16 overflow-hidden rounded-full">
                        {userData?.avatar && getAvatarUrl(userData.avatar) ? (
                          <Image 
                            src={getAvatarUrl(userData.avatar)} 
                            alt="Foto de perfil" 
                            width={64} 
                            height={64} 
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                            <User size={32} />
                          </div>
                        )}
                      </div>
                      <div className="ml-4 flex-1">
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{userData?.name || 'Usuario'}</p>
                        {userData?.role && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">{userData.role}</p>
                        )}
                        {userData?.email && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">{userData.email}</p>
                        )}
                        {orgName && (
                          <div className="flex items-center mt-2 text-sm text-gray-600 dark:text-gray-400">
                            <Building2 size={16} className="mr-1.5" />
                            <span className="truncate">{orgName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Botón de facturación destacado */}
                  <div className="p-4">
                    <Link 
                      href="/app/suscripcion"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between w-full px-4 py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors min-h-[56px]"
                    >
                      <div className="flex items-center">
                        <CreditCard size={20} className="mr-3" />
                        <span className="font-medium">Facturación</span>
                      </div>
                      <ChevronRight size={20} />
                    </Link>
                  </div>
                  
                  {/* Opciones del menú */}
                  <div className="px-4 pb-4 space-y-2">
                    <Link 
                      href="/app/perfil"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between w-full px-4 py-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded-lg transition-colors min-h-[56px]"
                    >
                      <div className="flex items-center">
                        <User size={20} className="mr-3 text-gray-600 dark:text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Ver perfil</span>
                      </div>
                      <ChevronRight size={20} className="text-gray-400" />
                    </Link>
                    
                    <Link 
                      href="/app/configuraciones"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between w-full px-4 py-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded-lg transition-colors min-h-[56px]"
                    >
                      <div className="flex items-center">
                        <Settings size={20} className="mr-3 text-gray-600 dark:text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Configuraciones</span>
                      </div>
                      <ChevronRight size={20} className="text-gray-400" />
                    </Link>
                    
                    <Link 
                      href="/app/notificaciones"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between w-full px-4 py-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded-lg transition-colors min-h-[56px]"
                    >
                      <div className="flex items-center">
                        <Bell size={20} className="mr-3 text-gray-600 dark:text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Notificaciones</span>
                      </div>
                      <ChevronRight size={20} className="text-gray-400" />
                    </Link>
                    
                    {/* Botón cerrar sesión */}
                    <button
                      onClick={() => {
                        setOpen(false);
                        handleSignOut();
                      }}
                      disabled={loading}
                      className="flex items-center justify-between w-full px-4 py-4 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 active:bg-red-200 dark:active:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg transition-colors min-h-[56px] disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                    >
                      <div className="flex items-center">
                        <LogOut size={20} className="mr-3" />
                        <span className="font-medium">{loading ? 'Cerrando sesión...' : 'Cerrar sesión'}</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      );
    }
    
    // Versión desktop para sidebar
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
    // En móvil, usar modal fullscreen igual que en sidebar
    if (isMobile) {
      return (
        <div className="relative">
          {/* Botón trigger */}
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center space-x-2 p-2 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 text-gray-800 dark:text-gray-200 transition-colors min-h-[44px] min-w-[44px]"
          >
            <div className="h-9 w-9 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
              {userData?.avatar && getAvatarUrl(userData.avatar) ? (
                <Image 
                  src={getAvatarUrl(userData.avatar)} 
                  alt="Avatar" 
                  width={36} 
                  height={36} 
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                  <User size={22} />
                </div>
              )}
            </div>
          </button>
          
          {/* Modal fullscreen para móvil - mismo que en sidebar */}
          {open && (
            <>
              {/* Overlay */}
              <div 
                className="fixed bg-black bg-opacity-50 z-[100] lg:hidden"
                onClick={() => setOpen(false)}
                style={{ 
                  position: 'fixed',
                  inset: 0,
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '100vw',
                  height: '100vh'
                }}
              />
              
              {/* Panel */}
              <div 
                className="fixed bottom-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl animate-slide-up max-h-[85vh] flex flex-col z-[101] lg:hidden"
                style={{ 
                  position: 'fixed',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: '100vw',
                  maxWidth: '100vw'
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Mi Cuenta</h3>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <X size={20} className="text-gray-500 dark:text-gray-400" />
                  </button>
                </div>
                
                {/* Contenido scrollable */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  {/* Info de usuario */}
                  <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 relative w-16 h-16 overflow-hidden rounded-full">
                        {userData?.avatar && getAvatarUrl(userData.avatar) ? (
                          <Image 
                            src={getAvatarUrl(userData.avatar)} 
                            alt="Foto de perfil" 
                            width={64} 
                            height={64} 
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                            <User size={32} />
                          </div>
                        )}
                      </div>
                      <div className="ml-4 flex-1">
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{userData?.name || 'Usuario'}</p>
                        {userData?.role && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">{userData.role}</p>
                        )}
                        {userData?.email && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">{userData.email}</p>
                        )}
                        {orgName && (
                          <div className="flex items-center mt-2 text-sm text-gray-600 dark:text-gray-400">
                            <Building2 size={16} className="mr-1.5" />
                            <span className="truncate">{orgName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Botón de facturación destacado */}
                  <div className="p-4">
                    <Link 
                      href="/app/suscripcion"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between w-full px-4 py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors min-h-[56px]"
                    >
                      <div className="flex items-center">
                        <CreditCard size={20} className="mr-3" />
                        <span className="font-medium">Facturación</span>
                      </div>
                      <ChevronRight size={20} />
                    </Link>
                  </div>
                  
                  {/* Opciones del menú */}
                  <div className="px-4 pb-4 space-y-2">
                    <Link 
                      href="/app/perfil"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between w-full px-4 py-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded-lg transition-colors min-h-[56px]"
                    >
                      <div className="flex items-center">
                        <User size={20} className="mr-3 text-gray-600 dark:text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Ver perfil</span>
                      </div>
                      <ChevronRight size={20} className="text-gray-400" />
                    </Link>
                    
                    <Link 
                      href="/app/configuraciones"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between w-full px-4 py-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded-lg transition-colors min-h-[56px]"
                    >
                      <div className="flex items-center">
                        <Settings size={20} className="mr-3 text-gray-600 dark:text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Configuraciones</span>
                      </div>
                      <ChevronRight size={20} className="text-gray-400" />
                    </Link>
                    
                    <Link 
                      href="/app/notificaciones"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between w-full px-4 py-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded-lg transition-colors min-h-[56px]"
                    >
                      <div className="flex items-center">
                        <Bell size={20} className="mr-3 text-gray-600 dark:text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Notificaciones</span>
                      </div>
                      <ChevronRight size={20} className="text-gray-400" />
                    </Link>
                    
                    {/* Botón cerrar sesión */}
                    <button
                      onClick={() => {
                        setOpen(false);
                        handleSignOut();
                      }}
                      disabled={loading}
                      className="flex items-center justify-between w-full px-4 py-4 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 active:bg-red-200 dark:active:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg transition-colors min-h-[56px] disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                    >
                      <div className="flex items-center">
                        <LogOut size={20} className="mr-3" />
                        <span className="font-medium">{loading ? 'Cerrando sesión...' : 'Cerrar sesión'}</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      );
    }
    
    // Versión desktop para header (dropdown tradicional)
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
