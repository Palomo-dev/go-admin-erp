'use client';

import React, { Suspense } from 'react';
import { useNavigationProgress } from '@/hooks/useNavigationProgress';

/**
 * Componente interno que usa el hook
 */
function NavigationProgressBar() {
  const { isNavigating, progress } = useNavigationProgress();

  if (!isNavigating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-1 bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500 transition-all duration-150 ease-out shadow-lg shadow-blue-500/50"
        style={{
          width: `${progress}%`,
          boxShadow: '0 0 10px rgba(59, 130, 246, 0.7), 0 0 20px rgba(59, 130, 246, 0.5)',
        }}
      />
    </div>
  );
}

/**
 * Componente de barra de progreso para navegación
 * Muestra una barra animada en la parte superior durante cambios de ruta
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}

export default NavigationProgress;
