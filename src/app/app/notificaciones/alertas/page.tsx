'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import {
  AlertasHeader,
  AlertaFilters,
  AlertaList,
  AlertaDetailSheet,
  CreateAlertDialog,
  AlertasService,
} from '@/components/notificaciones/alertas';
import type {
  AlertFilters,
  AlertStats,
  SystemAlert,
  CreateAlertPayload,
} from '@/components/notificaciones/alertas';
import { DEFAULT_ALERT_FILTERS } from '@/components/notificaciones/alertas/types';

export default function AlertasPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<AlertFilters>(DEFAULT_ALERT_FILTERS);
  const [page, setPage] = useState(1);
  const [availableModules, setAvailableModules] = useState<string[]>([]);
  const [channels, setChannels] = useState<{ code: string; provider_name: string }[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<SystemAlert | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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
        setIsAdmin(data.is_super_admin || [1, 2, 5].includes(data.role_id));
      }
    };

    checkAdmin();
  }, [organizationId, userId]);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [statsData, alertsData, modulesData, channelsData] = await Promise.all([
        AlertasService.getStats(organizationId),
        AlertasService.getAlerts(organizationId, filters, page),
        AlertasService.getDistinctModules(organizationId),
        AlertasService.getActiveChannels(organizationId),
      ]);

      setStats(statsData);
      setAlerts(alertsData.data);
      setTotal(alertsData.total);
      setAvailableModules(modulesData);
      setChannels(channelsData);
    } catch (error) {
      console.error('Error cargando alertas:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las alertas.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, filters, page, toast]);

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

  const handleFiltersChange = (newFilters: AlertFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleCreateAlert = async (payload: CreateAlertPayload): Promise<boolean> => {
    if (!organizationId) return false;
    const success = await AlertasService.createAlert(organizationId, payload);
    if (success) {
      toast({ title: 'Creada', description: 'Alerta creada correctamente.' });
      loadData();
      return true;
    } else {
      toast({ title: 'Error', description: 'No se pudo crear la alerta.', variant: 'destructive' });
      return false;
    }
  };

  if (!organizationId || !userId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando alertas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <AlertasHeader
        stats={stats}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        isAdmin={isAdmin}
        onRefresh={handleRefresh}
        onCreateNew={() => setCreateDialogOpen(true)}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <AlertaFilters
          filters={filters}
          onChange={handleFiltersChange}
          availableModules={availableModules}
        />

        <AlertaList
          alerts={alerts}
          total={total}
          page={page}
          pageSize={AlertasService.PAGE_SIZE}
          isLoading={isLoading}
          onPageChange={setPage}
          onSelect={setSelectedAlert}
        />
      </div>

      <AlertaDetailSheet
        alert={selectedAlert}
        open={!!selectedAlert}
        onOpenChange={(open) => { if (!open) setSelectedAlert(null); }}
        userId={userId}
        isAdmin={isAdmin}
        channels={channels}
        onStatusChanged={() => loadData()}
        onNavigate={(url) => router.push(url)}
      />

      <CreateAlertDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateAlert}
      />
    </div>
  );
}
