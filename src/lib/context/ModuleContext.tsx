'use client';

import React, { createContext, useContext, useCallback } from 'react';

interface ModuleContextType {
  refreshModules: () => void;
  registerRefreshCallback: (callback: () => void) => void;
  unregisterRefreshCallback: (callback: () => void) => void;
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined);

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  const refreshCallbacks = React.useRef<Set<() => void>>(new Set());

  const refreshModules = useCallback(() => {
    // Notificar a todos los componentes que usan módulos
    refreshCallbacks.current.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in module refresh callback:', error);
      }
    });
  }, []);

  const registerRefreshCallback = useCallback((callback: () => void) => {
    refreshCallbacks.current.add(callback);
  }, []);

  const unregisterRefreshCallback = useCallback((callback: () => void) => {
    refreshCallbacks.current.delete(callback);
  }, []);

  const value = React.useMemo(() => ({
    refreshModules,
    registerRefreshCallback,
    unregisterRefreshCallback
  }), [refreshModules, registerRefreshCallback, unregisterRefreshCallback]);

  return (
    <ModuleContext.Provider value={value}>
      {children}
    </ModuleContext.Provider>
  );
}

export function useModuleContext() {
  const context = useContext(ModuleContext);
  if (context === undefined) {
    throw new Error('useModuleContext must be used within a ModuleProvider');
  }
  return context;
}
