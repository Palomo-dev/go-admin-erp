'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import ICalService from '@/lib/services/icalService';
import ChannelManagerService, {
  type ChannelManagerStats,
  type SpaceChannelSummary,
} from '@/lib/services/channelManagerService';
import { useRouter } from 'next/navigation';
import {
  ChannelManagerHeader,
  AddConnectionDialog,
  SpaceConnectionsList,
  BookingSyncStatusCard,
  ExpediaSyncStatusCard,
} from '@/components/pms/channel-manager';
import { supabase } from '@/lib/supabase/config';
import { Loader2 } from 'lucide-react';

export default function ChannelManagerPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [stats, setStats] = useState<ChannelManagerStats | null>(null);
  const [summaries, setSummaries] = useState<SpaceChannelSummary[]>([]);
  const [spaces, setSpaces] = useState<Array<{ id: string; label: string; space_type?: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingConnectionId, setSyncingConnectionId] = useState<string | null>(null);

  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [preselectedSpaceId, setPreselectedSpaceId] = useState<string | undefined>();
  const [bookingConnections, setBookingConnections] = useState<Array<{
    connectionId: string;
    hotelId: string;
    name: string;
  }>>([]);
  const [expediaConnections, setExpediaConnections] = useState<Array<{
    connectionId: string;
    propertyId: string;
    name: string;
  }>>([]);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);

    // Cargar stats (no crítico)
    try {
      const statsData = await ChannelManagerService.getStats(organization.id);
      setStats(statsData);
    } catch (err: any) {
      console.warn('[ChannelManager] Error cargando stats:', err?.message || err?.code || err);
    }

    // Cargar summaries (no crítico)
    try {
      const summariesData = await ChannelManagerService.getSpaceChannelSummaries(organization.id);
      setSummaries(summariesData);
    } catch (err: any) {
      console.warn('[ChannelManager] Error cargando summaries:', err?.message || err?.code || err);
    }

    // Cargar espacios para el selector del dialog (spaces usa branch_id, no organization_id)
    try {
      const { data: branchesData } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', organization.id);

      const branchIds = (branchesData || []).map(b => b.id);

      const { data: spacesData, error: spacesErr } = branchIds.length > 0
        ? await supabase
            .from('spaces')
            .select('id, label, space_types ( name )')
            .in('branch_id', branchIds)
            .order('label')
        : { data: [] as any[], error: null };

      if (spacesErr) {
        console.warn('[ChannelManager] Error cargando espacios:', spacesErr.message);
      } else if (spacesData) {
        setSpaces(
          spacesData.map(s => {
            const spaceType = Array.isArray(s.space_types)
              ? s.space_types[0]?.name
              : (s.space_types as any)?.name;
            return {
              id: s.id,
              label: s.label,
              space_type: spaceType || undefined,
            };
          })
        );
      }
    } catch (err: any) {
      console.warn('[ChannelManager] Error inesperado cargando espacios:', err?.message || err);
    }

    // Cargar conexiones API de Booking.com
    try {
      const res = await fetch(`/api/integrations/booking/list-connections?organizationId=${organization.id}`);
      if (res.ok) {
        const data = await res.json();
        setBookingConnections((data.connections || []).map((c: any) => ({
          connectionId: c.connectionId,
          hotelId: c.hotelId,
          name: c.name,
        })));
      }
    } catch (err: any) {
      console.warn('[ChannelManager] Error cargando Booking API connections:', err?.message || err);
    }

    // Cargar conexiones API de Expedia Group
    try {
      const res = await fetch(`/api/integrations/expedia/list-connections?organizationId=${organization.id}`);
      if (res.ok) {
        const data = await res.json();
        setExpediaConnections((data.connections || []).map((c: any) => ({
          connectionId: c.connectionId,
          propertyId: c.propertyId,
          name: c.name,
        })));
      }
    } catch (err: any) {
      console.warn('[ChannelManager] Error cargando Expedia API connections:', err?.message || err);
    }

    setIsLoading(false);
  }, [organization?.id]);

  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id, loadData]);

  const handleRefresh = async () => {
    await loadData();
    toast({
      title: 'Actualizado',
      description: 'Los datos han sido actualizados',
    });
  };

  const handleSyncAll = async () => {
    if (!organization?.id) return;

    setIsSyncing(true);
    try {
      const response = await fetch('/api/pms/ical/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organization.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error en sincronización');
      }

      toast({
        title: 'Sincronización Completada',
        description: data.message,
      });

      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Error sincronizando canales',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncConnection = async (connectionId: string) => {
    if (!organization?.id) return;

    setSyncingConnectionId(connectionId);
    try {
      const response = await fetch('/api/pms/ical/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organization.id,
          connection_id: connectionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error en sincronización');
      }

      const result = data.results?.[0];
      if (result) {
        toast({
          title: result.status === 'success' ? 'Sincronización Exitosa' : 'Sincronización con Errores',
          description: `Encontrados: ${result.events_found}, Creados: ${result.events_created}, Actualizados: ${result.events_updated}, Eliminados: ${result.events_deleted}`,
          variant: result.status === 'error' ? 'destructive' : 'default',
        });
      }

      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Error sincronizando conexión',
        variant: 'destructive',
      });
    } finally {
      setSyncingConnectionId(null);
    }
  };

  const handleAddConnection = (spaceId?: string) => {
    setPreselectedSpaceId(spaceId);
    setShowAddDialog(true);
  };

  const handleSubmitConnection = async (data: {
    space_id: string;
    channel: string;
    ical_import_url?: string;
    commission_percent?: number;
    notes?: string;
  }) => {
    if (!organization?.id) return;

    try {
      await ICalService.createConnection({
        organization_id: organization.id,
        space_id: data.space_id,
        channel: data.channel,
        ical_import_url: data.ical_import_url,
        commission_percent: data.commission_percent,
        notes: data.notes,
      });

      toast({
        title: 'Conexión Creada',
        description: `Canal conectado exitosamente. ${data.ical_import_url ? 'Se sincronizará automáticamente.' : 'Configura la URL de importación para sincronizar.'}`,
      });

      await loadData();

      // Si tiene URL de importación, sincronizar inmediatamente
      if (data.ical_import_url) {
        const connections = await ICalService.getConnectionsBySpace(data.space_id);
        const newConn = connections.find(
          c => c.channel === data.channel && c.space_id === data.space_id
        );
        if (newConn) {
          handleSyncConnection(newConn.id);
        }
      }
    } catch (error: any) {
      const isDuplicate = error.message?.includes('duplicate') || error.code === '23505';
      toast({
        title: 'Error',
        description: isDuplicate
          ? 'Ya existe una conexión para este espacio y canal'
          : error.message || 'No se pudo crear la conexión',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDeleteConnection = async (connectionId: string) => {
    try {
      await ICalService.deleteConnection(connectionId);
      toast({
        title: 'Conexión Eliminada',
        description: 'La conexión de canal ha sido eliminada',
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar la conexión',
        variant: 'destructive',
      });
    }
  };

  const handleCopyExportUrl = (exportToken: string) => {
    const url = ChannelManagerService.getExportUrl(exportToken);
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: 'URL Copiada',
        description: 'La URL del calendario iCal ha sido copiada al portapapeles. Pégala en Airbnb, Booking.com u otro canal.',
      });
    }).catch(() => {
      // Fallback si clipboard no disponible
      toast({
        title: 'URL de Export',
        description: url,
      });
    });
  };

  if (isLoading && !stats) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Cargando channel manager...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <ChannelManagerHeader
          stats={stats}
          isLoading={isLoading}
          isSyncing={isSyncing}
          onSyncAll={handleSyncAll}
          onRefresh={handleRefresh}
          onAddConnection={() => handleAddConnection()}
          onConnectBookingApi={() => router.push('/app/integraciones/conexiones/nueva?provider=d379fcab-12ad-41c7-80f9-91c66373d72f')}
          onConnectExpediaApi={() => router.push('/app/integraciones/conexiones/nueva?provider=11d341a0-bf31-4288-abba-9033050061dc')}
        />

        {/* Booking.com API Connections */}
        {bookingConnections.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Booking.com — Connectivity API
            </h2>
            {bookingConnections.map(conn => (
              <BookingSyncStatusCard
                key={conn.connectionId}
                connectionId={conn.connectionId}
                hotelId={conn.hotelId}
                connectionName={conn.name}
              />
            ))}
          </div>
        )}

        {/* Expedia Group API Connections */}
        {expediaConnections.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Expedia Group — Lodging API
            </h2>
            {expediaConnections.map(conn => (
              <ExpediaSyncStatusCard
                key={conn.connectionId}
                connectionId={conn.connectionId}
                propertyId={conn.propertyId}
                connectionName={conn.name}
              />
            ))}
          </div>
        )}

        <SpaceConnectionsList
          summaries={summaries}
          isLoading={isLoading}
          syncingConnectionId={syncingConnectionId}
          onAddConnection={handleAddConnection}
          onSyncConnection={handleSyncConnection}
          onDeleteConnection={handleDeleteConnection}
          onCopyExportUrl={handleCopyExportUrl}
        />
      </div>

      <AddConnectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        spaces={spaces}
        onSubmit={handleSubmitConnection}
        preselectedSpaceId={preselectedSpaceId}
      />

    </div>
  );
}
