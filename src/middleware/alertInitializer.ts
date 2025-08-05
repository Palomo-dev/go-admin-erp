/**
 * Middleware para inicializar automáticamente el sistema de alertas
 * Se ejecuta una sola vez al iniciar el servidor Next.js
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeAlertSystem } from '@/lib/automation/alertInit';

let isInitialized = false;

export function middleware(request: NextRequest) {
  // Solo inicializar una vez y solo en servidor
  if (!isInitialized && typeof window === 'undefined') {
    // Inicializar de manera asíncrona para no bloquear las requests
    setTimeout(() => {
      initializeAlertSystem();
    }, 100);
    
    isInitialized = true;
  }
  
  return NextResponse.next();
}

// Configuración del middleware - se ejecuta en todas las rutas de la API
export const config = {
  matcher: [
    '/api/:path*'
  ]
};
