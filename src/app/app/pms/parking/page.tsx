'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { ParkingHeader, SessionsList, NewEntryDialog, ExitDialog, type EntryData } from '@/components/pms/parking';
import ParkingService, { type ParkingSession, type ParkingStats } from '@/lib/services/parkingService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';

export default function ParkingPage() {
  const { toast } = useToast();
  const { organization, branch_id } = useOrganization();

  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [stats, setStats] = useState<ParkingStats>({
    total_sessions: 0,
    active_sessions: 0,
    completed_today: 0,
    revenue_today: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showNewEntryDialog, setShowNewEntryDialog] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ParkingSession | null>(null);

  useEffect(() => {
    if (organization) {
      loadData();
    }
  }, [organization]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      // Usar branch_id del hook directamente
      const organizationId = organization?.id;
      
      if (!organizationId) {
        throw new Error('No se encontró el ID de la organización');
      }

      const [sessionsData, statsData] = await Promise.all([
        ParkingService.getSessions(branch_id || undefined, organizationId),
        ParkingService.getStats(branch_id || undefined, organizationId),
      ]);
      setSessions(sessionsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las sesiones de parking.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewEntry = () => {
    setShowNewEntryDialog(true);
  };

  const handleConfirmEntry = async (data: EntryData) => {
    try {
      if (!branch_id || !organization?.id) {
        throw new Error('No se encontró información de la sucursal u organización');
      }

      await ParkingService.createEntry(
        {
          branch_id: branch_id,
          vehicle_plate: data.vehicle_plate,
          vehicle_type: data.vehicle_type,
          parking_space_id: data.parking_space_id,
        },
        organization.id
      );

      toast({
        title: 'Entrada Registrada',
        description: `Vehículo ${data.vehicle_plate} ingresado correctamente`,
      });

      // Recargar datos
      loadData();
    } catch (error: any) {
      console.error('Error al registrar entrada:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo registrar la entrada',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleExit = (session: ParkingSession) => {
    setSelectedSession(session);
    setShowExitDialog(true);
  };

  const handleConfirmExit = () => {
    toast({
      title: 'Salida Registrada',
      description: `Vehículo ${selectedSession?.vehicle_plate} ha salido correctamente`,
    });
    
    // Recargar datos
    loadData();
    
    // Limpiar sesión seleccionada
    setSelectedSession(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando sesiones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <ParkingHeader onNewEntry={handleNewEntry} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Sesiones
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {stats.total_sessions}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Sesiones Activas
            </p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
              {stats.active_sessions}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Completadas Hoy
            </p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {stats.completed_today}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Ingresos Hoy
            </p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
              ${stats.revenue_today.toLocaleString()}
            </p>
          </div>
        </div>

        <SessionsList sessions={sessions} onExit={handleExit} />
      </div>

      <NewEntryDialog
        open={showNewEntryDialog}
        onOpenChange={setShowNewEntryDialog}
        onConfirm={handleConfirmEntry}
        branchId={branch_id || undefined}
      />

      <ExitDialog
        open={showExitDialog}
        onOpenChange={setShowExitDialog}
        session={selectedSession}
        organizationId={organization?.id}
        onConfirm={handleConfirmExit}
      />
    </div>
  );
}
