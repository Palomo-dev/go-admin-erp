'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import {
  BandejaHeader,
  NotificationFilters,
  NotificationList,
  CreateNotificationDialog,
  BandejaService,
} from '@/components/notificaciones/bandeja';
import type {
  BandejaFilters,
  BandejaStats,
  BandejaNotification,
  OrgMember,
  CreateNotificationPayload,
} from '@/components/notificaciones/bandeja';
import { DEFAULT_FILTERS } from '@/components/notificaciones/bandeja/types';

export default function BandejaPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  // Estado
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState<BandejaStats | null>(null);
  const [notifications, setNotifications] = useState<BandejaNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<BandejaFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Obtener usuario actual
  useEffect(() => {
    getCurrentUserId().then((id) => setUserId(id));
  }, []);

  // Verificar si es admin
  useEffect(() => {
    if (!organizationId || !userId) return;

    const checkAdmin = async () => {
      const { data } = await (await import('@/lib/supabase/config')).supabase
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

  // Cargar datos iniciales
  const loadData = useCallback(async () => {
    if (!organizationId || !userId) return;

    try {
      const [statsData, notifsData, typesData] = await Promise.all([
        BandejaService.getStats(organizationId, userId),
        BandejaService.getNotifications(organizationId, userId, filters, page),
        BandejaService.getDistinctTypes(organizationId),
      ]);

      setStats(statsData);
      setNotifications(notifsData.data);
      setTotal(notifsData.total);
      setAvailableTypes(typesData);
    } catch (error) {
      console.error('Error cargando bandeja:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las notificaciones.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, userId, filters, page, toast]);

  useEffect(() => {
    if (organizationId && userId) {
      setIsLoading(true);
      loadData();
    }
  }, [organizationId, userId, loadData]);

  // Refrescar
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  // Marcar todo como leído
  const handleMarkAllRead = async () => {
    if (!organizationId || !userId) return;

    const success = await BandejaService.markAllAsRead(organizationId, userId);
    if (success) {
      toast({ title: 'Listo', description: 'Todas las notificaciones marcadas como leídas.' });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo completar la acción.', variant: 'destructive' });
    }
  };

  // Marcar una como leída
  const handleMarkRead = async (id: string) => {
    const success = await BandejaService.markAsRead(id);
    if (success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      if (stats) setStats({ ...stats, unread: Math.max(0, stats.unread - 1) });
    }
  };

  // Marcar como no leída
  const handleMarkUnread = async (id: string) => {
    const success = await BandejaService.markAsUnread(id);
    if (success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: null } : n))
      );
      if (stats) setStats({ ...stats, unread: stats.unread + 1 });
    }
  };

  // Reenviar
  const handleResend = async (id: string) => {
    if (!organizationId) return;
    const success = await BandejaService.resendNotification(id, organizationId);
    if (success) {
      toast({ title: 'Reenviada', description: 'Notificación duplicada como nueva.' });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo reenviar.', variant: 'destructive' });
    }
  };

  // Crear notificación manual
  const handleCreateNotification = async (payload: CreateNotificationPayload): Promise<boolean> => {
    if (!organizationId) return false;

    const success = await BandejaService.createNotification(organizationId, payload);
    if (success) {
      toast({ title: 'Enviada', description: 'Notificación creada correctamente.' });
      loadData();
      return true;
    } else {
      toast({ title: 'Error', description: 'No se pudo crear la notificación.', variant: 'destructive' });
      return false;
    }
  };

  // Cambio de filtros → reset paginación
  const handleFiltersChange = (newFilters: BandejaFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  // Cargar miembros cuando se abre el dialog
  const handleOpenCreateDialog = async () => {
    if (!organizationId) return;
    if (members.length === 0) {
      const membersData = await BandejaService.getOrgMembers(organizationId);
      setMembers(membersData);
    }
    setCreateDialogOpen(true);
  };

  // Loading inicial
  if (!organizationId || !userId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando bandeja...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <BandejaHeader
        stats={stats}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        isAdmin={isAdmin}
        onRefresh={handleRefresh}
        onMarkAllRead={handleMarkAllRead}
        onCreateNew={handleOpenCreateDialog}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Filtros */}
        <NotificationFilters
          filters={filters}
          onChange={handleFiltersChange}
          availableTypes={availableTypes}
        />

        {/* Lista */}
        <NotificationList
          notifications={notifications}
          total={total}
          page={page}
          pageSize={BandejaService.PAGE_SIZE}
          isLoading={isLoading}
          onPageChange={setPage}
          onMarkRead={handleMarkRead}
          onMarkUnread={handleMarkUnread}
          onResend={handleResend}
          onNavigate={(url) => router.push(url)}
        />
      </div>

      {/* Dialog crear notificación (solo admin) */}
      <CreateNotificationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        members={members}
        onSubmit={handleCreateNotification}
      />
    </div>
  );
}
