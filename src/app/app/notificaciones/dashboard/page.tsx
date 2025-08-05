/**
 * Página del Dashboard de Estado de Notificaciones
 */

'use client';

import { useRouter } from 'next/navigation';
import MigrationStatusDashboard from '@/components/notificaciones/dashboard/MigrationStatusDashboard';

export default function DashboardPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Notificaciones</h1>
          <p className="text-muted-foreground mt-2">
            Monitoreo del estado del sistema de notificaciones en tiempo real
          </p>
        </div>
      </div>

      <MigrationStatusDashboard 
        onViewTriggers={() => {
          router.push('/app/notificaciones/triggers');
        }}
        onViewNotifications={() => {
          router.push('/app/notificaciones');
        }}
      />
    </div>
  );
}
