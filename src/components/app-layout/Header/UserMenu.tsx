'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, LogOut, Settings, User } from 'lucide-react';
import { UserData } from '../types';

interface UserMenuProps {
  userData: UserData | null;
  handleSignOut: () => Promise<void>;
  loading?: boolean;
}

export const UserMenu = ({ userData, handleSignOut, loading }: UserMenuProps) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // Cerrar el menú cuando se hace clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative ml-3" ref={userMenuRef}>
      <div>
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center text-sm rounded-full focus:outline-none"
          id="user-menu"
          aria-haspopup="true"
          aria-expanded={userMenuOpen}
        >
          <span className="sr-only">Abrir menú de usuario</span>
          <div className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            {userData?.avatar ? (
              <Image
                className="h-8 w-8 rounded-full object-cover"
                src={userData.avatar}
                alt="Avatar del usuario"
                width={32}
                height={32}
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-green-600 flex items-center justify-center text-white">
                {userData?.name?.charAt(0) || 'U'}
              </div>
            )}
            <div className="hidden md:block text-left">
              <div className="text-sm font-semibold">{userData?.name || 'Usuario'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {userData?.role || 'Usuario'}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </div>
        </button>
      </div>

      {userMenuOpen && (
        <div
          className="origin-top-right absolute right-0 mt-2 w-60 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu"
        >
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium">{userData?.name || 'Usuario'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {userData?.email || 'usuario@correo.com'}
            </p>
          </div>
          
          <Link href="/app/perfil" className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <User className="mr-3 h-4 w-4" />
            Mi Perfil
          </Link>
          
          <Link href="/app/configuracion" className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Settings className="mr-3 h-4 w-4" />
            Configuración
          </Link>
          
          <button
            onClick={handleSignOut}
            className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            role="menuitem"
            disabled={loading}
          >
            <LogOut className="mr-3 h-4 w-4" />
            {loading ? 'Cerrando sesión...' : 'Cerrar Sesión'}
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
