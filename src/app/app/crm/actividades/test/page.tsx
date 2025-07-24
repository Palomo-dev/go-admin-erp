import React from 'react';
import { Metadata } from 'next';
import { ActividadesTest } from '@/components/crm/actividades/test/ActividadesTest';

export const metadata: Metadata = {
  title: 'Prueba de Actividades | CRM',
  description: 'Página de prueba para verificar componentes de actividades',
};

export default function ActividadesTestPage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <ActividadesTest />
    </div>
  );
}
