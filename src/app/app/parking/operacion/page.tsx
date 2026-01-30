'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Loader2, Building2, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  OperacionHeader,
  VehicleSearch,
  ActiveSessionsPanel,
  RatesPanel,
  EntryDialog,
  ExitDialog,
  type ActiveSession,
  type ParkingRate,
} from '@/components/parking/operacion';

interface ParkingSpace {
  id: string;
  label: string;
  zone?: string;
  type: string;
  state: string;
}

interface PassInfo {
  isActive: boolean;
  planName: string;
  endDate: string;
}

export default function ParkingOperacionPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [isLoading, setIsLoading] = useState(true);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [rates, setRates] = useState<ParkingRate[]>([]);
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [passInfo, setPassInfo] = useState<PassInfo | null>(null);
  const [searchedPlate, setSearchedPlate] = useState<string>('');

  // Diálogos
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ActiveSession | null>(null);

  // Obtener branch de la organización
  useEffect(() => {
    async function fetchBranch() {
      if (!organization?.id) return;

      const { data, error } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', organization.id)
        .order('id', { ascending: true })
        .limit(1);

      if (error) {
        console.error('Error obteniendo branch:', error);
        setIsLoading(false);
        return;
      }

      const firstBranch = data?.[0];
      setBranchId(firstBranch?.id || null);

      if (!firstBranch?.id) {
        setIsLoading(false);
      }
    }

    setBranchId(null);
    setActiveSessions([]);
    setRates([]);
    fetchBranch();
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organization?.id || !branchId) return;

    setIsLoading(true);
    try {
      const [sessionsResult, ratesResult, spacesResult] = await Promise.all([
        // Sesiones activas
        supabase
          .from('parking_sessions')
          .select(`
            id,
            vehicle_plate,
            vehicle_type,
            entry_at,
            parking_space_id,
            rate_id
          `)
          .eq('branch_id', branchId)
          .eq('status', 'open')
          .order('entry_at', { ascending: false }),

        // Tarifas
        supabase
          .from('parking_rates')
          .select('*')
          .eq('organization_id', organization.id),

        // Espacios
        supabase
          .from('parking_spaces')
          .select('id, label, zone, type, state')
          .eq('branch_id', branchId),
      ]);

      if (sessionsResult.error) {
        console.error('Error cargando sesiones:', sessionsResult.error);
      }
      if (ratesResult.error) {
        console.error('Error cargando tarifas:', ratesResult.error);
      }
      if (spacesResult.error) {
        console.error('Error cargando espacios:', spacesResult.error);
      }

      // Procesar sesiones con información adicional
      const sessions = sessionsResult.data || [];
      const processedSessions: ActiveSession[] = await Promise.all(
        sessions.map(async (session) => {
          // Verificar si tiene pase activo
          const { data: passData } = await supabase
            .from('parking_passes')
            .select('id, plan_name, end_date, status')
            .eq('vehicle_plate', session.vehicle_plate)
            .eq('organization_id', organization.id)
            .eq('status', 'active')
            .gte('end_date', new Date().toISOString().split('T')[0])
            .limit(1);

          const space = spacesResult.data?.find(
            (s) => s.id === session.parking_space_id
          );
          const rate = ratesResult.data?.find((r) => r.id === session.rate_id);

          return {
            ...session,
            space_label: space?.label,
            rate_name: rate?.rate_name,
            rate_price: rate?.price,
            is_pass_holder: passData && passData.length > 0,
          };
        })
      );

      setActiveSessions(processedSessions);
      setRates(ratesResult.data || []);
      setSpaces(spacesResult.data || []);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de operación.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, branchId, toast]);

  useEffect(() => {
    if (organization && branchId) {
      loadData();
    }
  }, [organization, branchId, loadData]);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      if (organization && branchId && !isLoading) {
        loadData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [organization, branchId, isLoading, loadData]);

  // Buscar vehículo
  const handleSearch = async (query: string, type: 'plate' | 'qr' | 'ticket') => {
    if (!organization?.id) return;

    setSearchedPlate(query);
    setPassInfo(null);

    // Verificar si tiene pase activo
    const { data: passData } = await supabase
      .from('parking_passes')
      .select('id, plan_name, end_date, status')
      .eq('vehicle_plate', query)
      .eq('organization_id', organization.id)
      .limit(1);

    if (passData && passData.length > 0) {
      const pass = passData[0];
      const endDate = new Date(pass.end_date);
      const today = new Date();
      const isActive = pass.status === 'active' && endDate >= today;

      setPassInfo({
        isActive,
        planName: pass.plan_name,
        endDate: new Date(pass.end_date).toLocaleDateString('es-ES'),
      });
    }

    // Verificar si ya tiene sesión activa
    const existingSession = activeSessions.find(
      (s) => s.vehicle_plate === query
    );

    if (existingSession) {
      setSelectedSession(existingSession);
      setExitDialogOpen(true);
    } else {
      setEntryDialogOpen(true);
    }
  };

  // Registrar entrada
  const handleEntry = async (data: {
    vehicle_plate: string;
    vehicle_type: string;
    parking_space_id?: string;
    notes?: string;
  }) => {
    if (!branchId || !organization?.id) return;

    // Buscar tarifa aplicable
    const applicableRate = rates.find(
      (r) => r.vehicle_type.toLowerCase() === data.vehicle_type.toLowerCase()
    );

    const { error } = await supabase.from('parking_sessions').insert({
      branch_id: branchId,
      vehicle_plate: data.vehicle_plate,
      vehicle_type: data.vehicle_type,
      parking_space_id: data.parking_space_id || null,
      rate_id: applicableRate?.id || null,
      status: 'open',
      entry_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Error registrando entrada:', error);
      toast({
        title: 'Error',
        description: 'No se pudo registrar la entrada.',
        variant: 'destructive',
      });
      throw error;
    }

    // Actualizar estado del espacio si se asignó
    if (data.parking_space_id) {
      await supabase
        .from('parking_spaces')
        .update({ state: 'occupied' })
        .eq('id', data.parking_space_id);
    }

    toast({
      title: 'Entrada registrada',
      description: `Vehículo ${data.vehicle_plate} ingresó correctamente.`,
    });

    setSearchedPlate('');
    setPassInfo(null);
    loadData();
  };

  // Registrar salida
  const handleExit = async (data: {
    session_id: string;
    amount: number;
    payment_method?: string;
    is_lost_ticket?: boolean;
    is_exception?: boolean;
    exception_reason?: string;
  }) => {
    const session = activeSessions.find((s) => s.id === data.session_id);
    if (!session) return;

    const exitAt = new Date();
    const entryAt = new Date(session.entry_at);
    const durationMin = Math.floor(
      (exitAt.getTime() - entryAt.getTime()) / (1000 * 60)
    );

    const { error } = await supabase
      .from('parking_sessions')
      .update({
        status: 'closed',
        exit_at: exitAt.toISOString(),
        duration_min: durationMin,
        amount: data.amount,
      })
      .eq('id', data.session_id);

    if (error) {
      console.error('Error registrando salida:', error);
      toast({
        title: 'Error',
        description: 'No se pudo registrar la salida.',
        variant: 'destructive',
      });
      throw error;
    }

    // Liberar espacio si tenía uno asignado
    if (session.parking_space_id) {
      await supabase
        .from('parking_spaces')
        .update({ state: 'free' })
        .eq('id', session.parking_space_id);
    }

    toast({
      title: 'Salida registrada',
      description: `Vehículo ${session.vehicle_plate} salió. ${
        data.amount > 0 ? `Cobro: $${data.amount.toLocaleString()}` : ''
      }`,
    });

    setSelectedSession(null);
    loadData();
  };

  // Seleccionar sesión para salida
  const handleSelectSession = (session: ActiveSession) => {
    setSelectedSession(session);
    setExitDialogOpen(true);
  };

  // Si no hay branch
  if (organization && branchId === null && !isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardContent className="pt-6 text-center">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Sin sucursal configurada
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                La organización &quot;{organization.name}&quot; no tiene sucursales.
              </p>
              <Link href="/app/organizacion/sucursales">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Crear Sucursal
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading && activeSessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando operación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <OperacionHeader onRefresh={loadData} isLoading={isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda: Búsqueda y Tarifas */}
        <div className="space-y-6">
          <VehicleSearch
            onSearch={handleSearch}
            isLoading={isLoading}
            passInfo={passInfo}
          />

          <Button
            onClick={() => {
              setSearchedPlate('');
              setPassInfo(null);
              setEntryDialogOpen(true);
            }}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Entrada
          </Button>

          <RatesPanel rates={rates} isLoading={isLoading} />
        </div>

        {/* Columna derecha: Sesiones activas */}
        <div className="lg:col-span-2">
          <ActiveSessionsPanel
            sessions={activeSessions}
            onSelectSession={handleSelectSession}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Diálogos */}
      <EntryDialog
        open={entryDialogOpen}
        onOpenChange={setEntryDialogOpen}
        onSubmit={handleEntry}
        availableSpaces={spaces.filter((s) => s.state === 'free')}
        initialPlate={searchedPlate}
        isLoading={isLoading}
      />

      <ExitDialog
        open={exitDialogOpen}
        onOpenChange={setExitDialogOpen}
        session={selectedSession}
        rates={rates}
        onSubmit={handleExit}
        isLoading={isLoading}
      />
    </div>
  );
}
