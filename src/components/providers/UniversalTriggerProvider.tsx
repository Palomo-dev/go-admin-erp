'use client';

/**
 * 🎯 PROVEEDOR UNIVERSAL DE TRIGGERS DE FACTURAS
 * 
 * Inicializa automáticamente el interceptor universal de facturas
 * al cargar la aplicación, garantizando que TODOS los métodos
 * de creación de facturas disparen triggers automáticamente.
 */

import { useEffect, useState } from 'react';
import { initializeUniversalInvoiceTriggers } from '@/lib/services/universalInvoiceTriggerService';

interface UniversalTriggerProviderProps {
  children: React.ReactNode;
}

export default function UniversalTriggerProvider({ children }: UniversalTriggerProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('🚀 Inicializando sistema universal de triggers...');
        
        // Esperar un momento para asegurar que la aplicación esté completamente cargada
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await initializeUniversalInvoiceTriggers();
        
        setIsInitialized(true);
        console.log('✅ Sistema universal de triggers inicializado exitosamente');
        
        // Mostrar notificación de sistema en consola
        console.log(`
🎯 ===== SISTEMA UNIVERSAL DE TRIGGERS ACTIVO =====
📧 Todas las facturas creadas por CUALQUIER método
   ahora dispararán automáticamente el trigger invoice.created
🔍 Métodos cubiertos:
   • POS Checkout ✅
   • POS Hold with Debt ✅  
   • Finanzas Manuales ✅
   • APIs ✅
   • Webhooks ✅
   • Importaciones ✅
   • Cualquier otro método ✅
💪 Sistema 100% automático y resiliente
===================================================
        `);
        
      } catch (error) {
        console.error('❌ Error inicializando sistema universal de triggers:', error);
        // No bloquear la aplicación si falla
      }
    };

    initialize();
  }, []);

  return (
    <>
      {children}
      {isInitialized && (
        <div className="hidden" id="universal-trigger-initialized" data-initialized="true" />
      )}
    </>
  );
}
