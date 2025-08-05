/**
 * Página de Alertas Automáticas
 * Ruta: /app/notificaciones/alertas
 */

import { Metadata } from 'next';
import { AlertsManager } from '@/components/notificaciones/alertas';

export const metadata: Metadata = {
  title: 'Alertas Automáticas | GO Admin ERP',
  description: 'Gestiona reglas de alerta y monitorea el estado del sistema',
};

export default function AlertasPage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <AlertsManager />
    </div>
  );
}
