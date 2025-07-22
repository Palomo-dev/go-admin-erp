'use client';

import { AppHeaderProps } from '../types';
import { Moon, Sun, Menu } from 'lucide-react';
import UserMenu from '../ProfileDropdownMenu';
import BranchSelectorWrapper from './BranchSelectorWrapper';
import GlobalSearch from './GlobalSearch';
import NotificationsMenu from './Notifications';

export const AppHeader = ({
  theme,
  toggleTheme,
  userData,
  orgId,
  handleSignOut,
  loading,
  setSidebarOpen
}: AppHeaderProps) => {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="flex justify-between items-center px-4 py-2">
        {/* Botón de menú hamburguesa para móvil */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setSidebarOpen?.(true)}
            className="lg:hidden p-2 rounded-md bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
            aria-label="Abrir menú"
            title="Abrir menú"
          >
            <Menu size={18} />
          </button>
        </div>
        
        {/* Buscador global en el centro */}
        <div className="flex-1 flex justify-center">
          <GlobalSearch />
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Branch Selector en el lado derecho */}
          <BranchSelectorWrapper orgId={orgId} />
          
          {/* Botón para cambiar tema */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            aria-label="Cambiar tema"
            title={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
          >
            {theme === 'light' ? (
              <Moon size={18} className="text-gray-700" />
            ) : (
              <Sun size={18} className="text-yellow-400" />
            )}
          </button>
          
          {/* Componente de notificaciones */}
          <NotificationsMenu organizationId={orgId} />

          {/* Perfil de usuario con menú desplegable */}
          <UserMenu 
            userData={userData} 
            handleSignOut={handleSignOut}
            loading={loading}
            isSidebar={false}
          />
        </div>
      </div>
    </div>
  );
};
