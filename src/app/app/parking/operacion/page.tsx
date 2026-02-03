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
import type { SearchResult } from '@/components/parking/operacion/VehicleSearch';
import parkingPaymentService, {
  type OrganizationPaymentMethod,
} from '@/lib/services/parkingPaymentService';
import parkingFinanceService from '@/lib/services/parkingFinanceService';
import parkingTicketService, { type EntryTicketData } from '@/lib/services/parkingTicketService';

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
  const [paymentMethods, setPaymentMethods] = useState<OrganizationPaymentMethod[]>([]);
  const [hasInvoicing, setHasInvoicing] = useState(false);
  const [branchData, setBranchData] = useState<{ name: string; address?: string; phone?: string } | null>(null);
  const [organizationData, setOrganizationData] = useState<{ name: string; nit?: string; phone?: string; address?: string } | null>(null);
  const [passInfo, setPassInfo] = useState<PassInfo | null>(null);
  const [searchedPlate, setSearchedPlate] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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
      const [sessionsResult, ratesResult, spacesResult, methodsResult] = await Promise.all([
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

        // Métodos de pago
        parkingPaymentService.getPaymentMethods(organization.id),
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

      setPaymentMethods(methodsResult || []);

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
            is_pass_holder: passData && passData.length > 0 ? true : undefined,
          };
        })
      );

      setActiveSessions(processedSessions);
      setRates(ratesResult.data || []);
      setSpaces(spacesResult.data || []);

      // Verificar facturación
      const invoicingEnabled = await parkingFinanceService.hasInvoicingEnabled(organization.id, branchId);
      setHasInvoicing(invoicingEnabled);

      // Cargar datos de la sucursal para tickets
      const { data: branch } = await supabase
        .from('branches')
        .select('name, address, phone')
        .eq('id', branchId)
        .single();
      setBranchData(branch);

      // Cargar datos de la organización para tickets
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name, nit, phone, address')
        .eq('id', organization.id)
        .single();
      setOrganizationData(orgData);
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

  // Buscar vehículo (búsqueda parcial)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSearch = useCallback(async (query: string, _type: 'plate' | 'qr' | 'ticket') => {
    if (!organization?.id || !branchId || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Buscar sesiones activas que coincidan parcialmente con la placa
      const { data: sessions } = await supabase
        .from('parking_sessions')
        .select(`
          id,
          vehicle_plate,
          vehicle_type,
          entry_at,
          parking_space_id,
          status
        `)
        .eq('branch_id', branchId)
        .ilike('vehicle_plate', `%${query}%`)
        .order('entry_at', { ascending: false })
        .limit(10);

      if (sessions) {
        const results: SearchResult[] = sessions.map((session) => {
          const space = spaces.find((s) => s.id === session.parking_space_id);
          return {
            id: session.id,
            vehicle_plate: session.vehicle_plate,
            vehicle_type: session.vehicle_type,
            entry_at: session.entry_at,
            space_label: space?.label,
            is_active: session.status === 'open',
          };
        });
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error buscando vehículos:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [organization?.id, branchId, spaces]);

  // Seleccionar resultado de búsqueda (abrir diálogo de salida)
  const handleSelectSearchResult = useCallback((result: SearchResult) => {
    const session = activeSessions.find((s) => s.id === result.id);
    if (session) {
      setSelectedSession(session);
      setExitDialogOpen(true);
    }
  }, [activeSessions]);

  // Nueva entrada desde búsqueda
  const handleNewEntryFromSearch = useCallback((plate: string) => {
    setSearchedPlate(plate);
    setPassInfo(null);
    setEntryDialogOpen(true);
  }, []);

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

    const entryAt = new Date().toISOString();

    const { data: newSession, error } = await supabase
      .from('parking_sessions')
      .insert({
        branch_id: branchId,
        vehicle_plate: data.vehicle_plate,
        vehicle_type: data.vehicle_type,
        parking_space_id: data.parking_space_id || null,
        rate_id: applicableRate?.id || null,
        status: 'open',
        entry_at: entryAt,
      })
      .select('id')
      .single();

    if (error || !newSession) {
      console.error('Error registrando entrada:', error);
      toast({
        title: 'Error',
        description: 'No se pudo registrar la entrada.',
        variant: 'destructive',
      });
      throw error;
    }

    // Actualizar estado del espacio si se asignó
    let spaceLabel: string | undefined;
    let zoneName: string | undefined;
    if (data.parking_space_id) {
      await supabase
        .from('parking_spaces')
        .update({ state: 'occupied' })
        .eq('id', data.parking_space_id);

      const space = spaces.find((s) => s.id === data.parking_space_id);
      spaceLabel = space?.label;
      zoneName = space?.zone;
    }

    // Imprimir ticket de entrada
    const ticketData: EntryTicketData = {
      organization_name: organizationData?.name || organization.name || 'Parqueadero',
      organization_nit: organizationData?.nit || undefined,
      organization_phone: organizationData?.phone || undefined,
      organization_address: organizationData?.address || undefined,
      branch_name: branchData?.name || 'Sucursal Principal',
      branch_address: branchData?.address || undefined,
      branch_phone: branchData?.phone || undefined,
      session_id: newSession.id,
      vehicle_plate: data.vehicle_plate,
      vehicle_type: data.vehicle_type,
      entry_at: entryAt,
      space_label: spaceLabel,
      zone_name: zoneName,
      ticket_message: 'Conserve este ticket para la salida',
      show_qr: false,
    };

    parkingTicketService.printEntryTicket(ticketData);

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
    generate_invoice?: boolean;
    is_credit?: boolean;
    customer_id?: string;
    due_days?: number;
  }) => {
    const session = activeSessions.find((s) => s.id === data.session_id);
    if (!session || !organization?.id || !branchId) return;

    try {
      // Si es crédito, usar servicio de finanzas
      if (data.is_credit && data.customer_id) {
        await parkingFinanceService.registerParkingExitOnCredit({
          organization_id: organization.id,
          branch_id: branchId,
          source_type: 'parking_session',
          source_id: data.session_id,
          amount: data.amount,
          customer_id: data.customer_id,
          due_days: data.due_days || 30,
          vehicle_plate: session.vehicle_plate,
          generate_invoice: data.generate_invoice,
        });

        toast({
          title: 'Salida registrada a crédito',
          description: `Vehículo ${session.vehicle_plate}. Cuenta por cobrar: $${data.amount.toLocaleString()}`,
        });
      } 
      // Si hay que generar factura
      else if (data.generate_invoice && data.amount > 0) {
        await parkingFinanceService.registerParkingPaymentWithInvoice({
          organization_id: organization.id,
          branch_id: branchId,
          source_type: 'parking_session',
          source_id: data.session_id,
          amount: data.amount,
          payment_method_code: data.payment_method || 'cash',
          vehicle_plate: session.vehicle_plate,
          generate_invoice: true,
        });

        toast({
          title: 'Salida registrada con factura',
          description: `Vehículo ${session.vehicle_plate}. Cobro: $${data.amount.toLocaleString()}`,
        });
      }
      // Flujo normal sin factura
      else {
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

        if (error) throw error;

        // Registrar pago si hay monto
        if (data.amount > 0 && data.payment_method) {
          await supabase.from('payments').insert({
            organization_id: organization.id,
            branch_id: branchId,
            source: 'parking_session',
            source_id: data.session_id,
            method: data.payment_method,
            amount: data.amount,
            currency: 'COP',
            status: 'completed',
          });
        }

        toast({
          title: 'Salida registrada',
          description: `Vehículo ${session.vehicle_plate} salió. ${
            data.amount > 0 ? `Cobro: $${data.amount.toLocaleString()}` : ''
          }`,
        });
      }

      // Liberar espacio si tenía uno asignado
      if (session.parking_space_id) {
        await supabase
          .from('parking_spaces')
          .update({ state: 'free' })
          .eq('id', session.parking_space_id);
      }
    } catch (error) {
      console.error('Error registrando salida:', error);
      toast({
        title: 'Error',
        description: 'No se pudo registrar la salida.',
        variant: 'destructive',
      });
      throw error;
    }

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
            onSelectResult={handleSelectSearchResult}
            onNewEntry={handleNewEntryFromSearch}
            searchResults={searchResults}
            isSearching={isSearching}
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
        paymentMethods={paymentMethods}
        organizationId={organization?.id}
        hasInvoicing={hasInvoicing}
        onSubmit={handleExit}
        isLoading={isLoading}
      />
    </div>
  );
}
