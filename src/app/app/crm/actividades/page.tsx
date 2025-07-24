import React from 'react';
import { Metadata } from 'next';
import { ActividadesManager } from '@/components/crm/actividades/core/ActividadesManager';
import { VoipTestPanel } from '@/components/crm/actividades/VoipTestPanel';

export const metadata: Metadata = {
  title: 'Historial de Actividades | CRM',
  description: 'Registro completo de todas las actividades del CRM - llamadas, emails, reuniones y más',
};

export default function ActividadesPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Panel de pruebas VOIP - Solo en desarrollo */}
      {process.env.NODE_ENV === 'development' && (
        <VoipTestPanel />
      )}
      
      <ActividadesManager />
    </div>
  );
}
