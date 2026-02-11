'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Radio } from 'lucide-react';
import {
  CanalesHeader,
  CanalCard,
  CanalEditorDialog,
  LinkConnectionDialog,
  CanalesService,
} from '@/components/notificaciones/canales';
import type {
  NotificationChannel,
  ChannelFormData,
  LinkedConnection,
} from '@/components/notificaciones/canales';

export default function CanalesPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [logsMap, setLogsMap] = useState<Record<string, any[]>>({});
  const [availableConnections, setAvailableConnections] = useState<LinkedConnection[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkingChannel, setLinkingChannel] = useState<NotificationChannel | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUserId().then((id) => setUserId(id));
  }, []);

  useEffect(() => {
    if (!organizationId || !userId) return;

    const checkAdmin = async () => {
      const { supabase } = await import('@/lib/supabase/config');
      const { data } = await supabase
        .from('organization_members')
        .select('is_super_admin, role_id, roles(name)')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single();

      if (data) {
        const roleName = (data as any).roles?.name?.toLowerCase() || '';
        setIsAdmin(data.is_super_admin || roleName === 'admin' || roleName === 'owner' || roleName === 'manager');
      }
    };

    checkAdmin();
  }, [organizationId, userId]);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [channelsData, connections] = await Promise.all([
        CanalesService.getChannels(organizationId),
        CanalesService.getAvailableConnections(organizationId),
      ]);
      setChannels(channelsData);
      setAvailableConnections(connections);

      const logs: Record<string, any[]> = {};
      await Promise.all(
        channelsData.map(async (ch) => {
          logs[ch.code] = await CanalesService.getRecentLogs(organizationId, ch.code, 3);
        })
      );
      setLogsMap(logs);
    } catch (error) {
      console.error('Error cargando canales:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los canales.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      loadData();
    }
  }, [organizationId, loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleSave = async (data: ChannelFormData, id?: string): Promise<boolean> => {
    if (!id) return false;

    const ok = await CanalesService.updateChannel(id, data);
    if (ok) {
      toast({ title: 'Guardado', description: `Canal "${data.provider_name}" actualizado.` });
      loadData();
      return true;
    }
    toast({ title: 'Error', description: 'No se pudo guardar.', variant: 'destructive' });
    return false;
  };

  const handleToggle = async (ch: NotificationChannel) => {
    setTogglingId(ch.id);
    const ok = await CanalesService.toggleActive(ch.id, !ch.is_active);
    if (ok) {
      toast({ title: ch.is_active ? 'Desactivado' : 'Activado', description: `${ch.provider_name} ${ch.is_active ? 'desactivado' : 'activado'}.` });
      loadData();
    }
    setTogglingId(null);
  };

  const handleDelete = async (ch: NotificationChannel) => {
    if (!confirm(`¿Eliminar canal "${ch.provider_name}"?`)) return;
    const ok = await CanalesService.deleteChannel(ch.id);
    if (ok) {
      toast({ title: 'Eliminado', description: 'Canal eliminado.' });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo eliminar.', variant: 'destructive' });
    }
  };

  const handleTest = async (ch: NotificationChannel) => {
    if (!organizationId) return;
    const ok = await CanalesService.testChannel(organizationId, ch);
    if (ok) {
      toast({ title: 'Prueba enviada', description: `Notificación de prueba creada para ${ch.code}.` });
      setTimeout(() => loadData(), 2000);
    } else {
      toast({ title: 'Error', description: 'No se pudo enviar la prueba.', variant: 'destructive' });
    }
  };

  const handleLink = async (channelId: string, connectionId: string, providerName: string): Promise<boolean> => {
    const ok = await CanalesService.linkConnection(channelId, connectionId, providerName);
    if (ok) {
      toast({ title: 'Vinculado', description: `Integración vinculada al canal.` });
      loadData();
      return true;
    }
    toast({ title: 'Error', description: 'No se pudo vincular.', variant: 'destructive' });
    return false;
  };

  const handleUnlink = async (ch: NotificationChannel) => {
    const ok = await CanalesService.linkConnection(ch.id, null);
    if (ok) {
      toast({ title: 'Desvinculado', description: `Integración desvinculada de ${ch.code}.` });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo desvincular.', variant: 'destructive' });
    }
  };

  const handleExport = () => {
    const exportData = channels.map((ch) => ({
      code: ch.code,
      provider_name: ch.provider_name,
      config_json: ch.config_json,
      is_active: ch.is_active,
      connection_id: ch.connection_id,
    }));
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canales-${organization?.slug || organizationId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: `${channels.length} canales exportados.` });
  };

  const activeCount = channels.filter((c) => c.is_active).length;
  const linkedCount = channels.filter((c) => c.connection_id).length;

  if (!organizationId || !userId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando canales...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <CanalesHeader
        totalChannels={channels.length}
        activeCount={activeCount}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        isAdmin={isAdmin}
        onRefresh={handleRefresh}
        onCreateNew={() => {}}
        onExport={handleExport}
        onImport={() => {}}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <Radio className="h-12 w-12 mb-3" />
            <p className="text-base font-medium">No hay canales configurados</p>
            <p className="text-sm">Los canales se crean automáticamente durante el onboarding</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {channels.map((ch) => (
              <CanalCard
                key={ch.id}
                channel={ch}
                isAdmin={isAdmin}
                recentLogs={logsMap[ch.code] || []}
                onEdit={() => { setEditingChannel(ch); setEditorOpen(true); }}
                onDelete={() => handleDelete(ch)}
                onTest={() => handleTest(ch)}
                onToggle={() => handleToggle(ch)}
                onLink={() => { setLinkingChannel(ch); setLinkOpen(true); }}
                onUnlink={() => handleUnlink(ch)}
                isToggling={togglingId === ch.id}
              />
            ))}
          </div>
        )}
      </div>

      <CanalEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        channel={editingChannel}
        onSave={handleSave}
      />

      <LinkConnectionDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        channel={linkingChannel}
        availableConnections={availableConnections}
        onLink={handleLink}
      />
    </div>
  );
}
