'use client';

import { AppHeaderProps } from '../types';
import ThemeToggle from '../ThemeToggle';
import UserMenu from './UserMenu';
import NotificationsMenu from './NotificationsMenu';
import BranchSelectorWrapper from './BranchSelectorWrapper';

export const AppHeader = ({
  theme,
  toggleTheme,
  userData,
  orgId,
  handleSignOut,
  loading
}: AppHeaderProps) => {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between h-16 items-center">
        {/* Left header section with admin title */}
        <div className="flex items-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white hidden sm:block">
            Panel de Administración
          </h1>
        </div>
        
        {/* Center header section with branch selector */}
        <div className="flex-1 px-2 sm:px-4 flex justify-center">
          {!loading && (
            <BranchSelectorWrapper 
              orgId={orgId} 
              className="w-full max-w-md" 
            />
          )}
        </div>
        
        {/* Right header section with actions */}
        <div className="flex items-center space-x-4">
          {/* Theme toggle */}
          <ThemeToggle 
            theme={theme} 
            toggleTheme={toggleTheme} 
          />
          
          {/* Notifications */}
          <NotificationsMenu organizationId={orgId} />
          
          {/* Profile dropdown */}
          <UserMenu 
            userData={userData} 
            handleSignOut={handleSignOut} 
          />
        </div>
      </div>
    </header>
  );
};
