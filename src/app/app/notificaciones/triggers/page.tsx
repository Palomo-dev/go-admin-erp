/**
 * Página principal de triggers de eventos
 * Ruta: /app/notificaciones/triggers
 */

import React from 'react';
import { Metadata } from 'next';
import { TriggersManager } from '@/components/notificaciones/triggers/core/TriggersManager';

export const metadata: Metadata = {
  title: 'Triggers de Eventos | GO Admin ERP',
  description: 'Configura acciones automáticas basadas en eventos del sistema',
};

export default function TriggersPage() {
  return (
    <div className="container mx-auto p-6">
      <TriggersManager />
    </div>
  );
}
