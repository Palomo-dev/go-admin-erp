'use client';

import { AppHeaderProps } from '../types';
import { Moon, Sun, Menu, Bot } from 'lucide-react';
import UserMenu from '../ProfileDropdownMenu';
import BranchSelectorWrapper from './BranchSelectorWrapper';
import GlobalSearch from './GlobalSearch';
import { NotificationsMenu } from './NotificationsMenu';
import { TrialBanner } from './TrialBanner';

export const AppHeader = ({
  theme,
  toggleTheme,
  userData,
  orgId,
  handleSignOut,
  loading,
  setSidebarOpen,
  aiAssistantOpen,
  onToggleAIAssistant
}: AppHeaderProps) => {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
      <div className="flex justify-between items-center px-3 sm:px-4 py-2.5 min-h-[60px]">
        {/* Botón de menú hamburguesa para móvil */}
        <div className="flex items-center">
          <button 
            onClick={() => setSidebarOpen?.(true)}
            className="lg:hidden p-2.5 rounded-md bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Abrir menú"
            title="Abrir menú"
          >
            <Menu size={20} />
          </button>
        </div>
        
        {/* Buscador global en el centro */}
        <div className="flex-1 flex justify-center px-2 sm:px-4">
          <div className="w-full max-w-md">
            <GlobalSearch />
          </div>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Branch Selector en el lado derecho */}
          <BranchSelectorWrapper orgId={orgId} />
          
          {/* Botón de Asistente IA */}
          <button
            onClick={onToggleAIAssistant}
            className={`p-2.5 rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
              aiAssistantOpen 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
            }`}
            aria-label="Asistente IA"
            title="GO Assistant - Asistente de IA"
          >
            <Bot size={20} />
          </button>
          
          {/* Botón para cambiar tema */}
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-md text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Cambiar tema"
            title={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
          >
            {theme === 'light' ? (
              <Moon size={20} className="text-gray-700" />
            ) : (
              <Sun size={20} className="text-yellow-400" />
            )}
          </button>
          
          {/* Componente de notificaciones - visible en todos los tamaños */}
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
      <TrialBanner orgId={orgId} />
    </div>
  );
};
