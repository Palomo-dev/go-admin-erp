'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  NotificacionesDashboardService,
  type NotificacionesKPIs as KPIsType,
  type SystemAlert,
  type AlertRule,
  type NotificationChannel,
  type NotificationRow,
} from '@/lib/services/notificacionesDashboardService';
import {
  PageHeaderSkeleton,
  StatsSkeleton,
  CardListSkeleton,
} from '@/components/common/PageSkeletons';
import {
  NotificacionesHeader,
  NotificacionesKPIs,
  AlertasCriticas,
  TopReglas,
  EstadoCanales,
  UltimasNotificaciones,
} from '@/components/notificaciones';

export default function NotificacionesPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();
  const router = useRouter();

  // Estado principal
  const [kpis, setKpis] = useState<KPIsType | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  // Verificar rol del usuario
  useEffect(() => {
    const checkRole = async () => {
      const userId = await getCurrentUserId();
      if (!userId || !organizationId) {
        setCheckingRole(false);
        return;
      }

      try {
        const { supabase } = await import('@/lib/supabase/config');
        const { data } = await supabase
          .from('organization_members')
          .select('is_super_admin, role_id, roles(name)')
          .eq('organization_id', organizationId)
          .eq('user_id', userId)
          .single();

        if (data) {
          const roleName = (data as any).roles?.name?.toLowerCase() || '';
          const admin = data.is_super_admin || roleName === 'admin' || roleName === 'owner' || roleName === 'super admin' || roleName === 'admin de organización';
          setIsAdmin(admin);
          if (!admin) {
            router.replace('/app/notificaciones/bandeja');
            return;
          }
        }
      } catch (error) {
        console.error('Error verificando rol:', error);
      }
      setCheckingRole(false);
    };
    checkRole();
  }, [organizationId, router]);

  // Cargar todos los datos
  const loadData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [kpisData, alertsData, rulesData, channelsData, notifsData] = await Promise.all([
        NotificacionesDashboardService.getKPIs(organizationId),
        NotificacionesDashboardService.getRecentAlerts(organizationId),
        NotificacionesDashboardService.getTopRules(organizationId),
        NotificacionesDashboardService.getChannels(organizationId),
        NotificacionesDashboardService.getLatestNotifications(organizationId, 100),
      ]);

      setKpis(kpisData);
      setAlerts(alertsData);
      setRules(rulesData);
      setChannels(channelsData);
      setNotifications(notifsData);
    } catch (error) {
      console.error('Error cargando datos del dashboard:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del dashboard',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refrescar
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  // Reconocer alerta
  const handleAcknowledge = async (alertId: string) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      toast({ title: 'Error', description: 'No se pudo obtener el usuario actual', variant: 'destructive' });
      return;
    }

    const success = await NotificacionesDashboardService.acknowledgeAlert(alertId, userId);
    if (success) {
      toast({ title: 'Alerta reconocida', description: 'La alerta ha sido marcada como reconocida' });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo reconocer la alerta', variant: 'destructive' });
    }
  };

  // Toggle regla
  const handleToggleRule = async (ruleId: string, active: boolean) => {
    const success = await NotificacionesDashboardService.toggleRule(ruleId, active);
    if (success) {
      toast({
        title: active ? 'Regla activada' : 'Regla desactivada',
        description: `La regla ha sido ${active ? 'activada' : 'desactivada'}`,
      });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo actualizar la regla', variant: 'destructive' });
    }
  };

  // Toggle canal
  const handleToggleChannel = async (channelId: string, isActive: boolean) => {
    const success = await NotificacionesDashboardService.toggleChannel(channelId, isActive);
    if (success) {
      toast({
        title: isActive ? 'Canal activado' : 'Canal desactivado',
        description: `El canal ha sido ${isActive ? 'activado' : 'desactivado'}`,
      });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo actualizar el canal', variant: 'destructive' });
    }
  };

  // Reintentar envío
  const handleRetry = async (notificationId: string) => {
    const success = await NotificacionesDashboardService.retryFailedNotification(notificationId);
    if (success) {
      toast({ title: 'Reintentando', description: 'La notificación ha sido puesta en cola para reenvío' });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo reintentar el envío', variant: 'destructive' });
    }
  };

  // Loading mientras verifica rol
  if (checkingRole) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  // Si no es admin, no renderizar el dashboard (ya fue redirigido)
  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <NotificacionesHeader onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 space-y-6">
          {/* KPIs */}
          <NotificacionesKPIs kpis={kpis} isLoading={isLoading} />

          {/* Alertas + Top Reglas (2 columnas) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AlertasCriticas
              alerts={alerts}
              isLoading={isLoading}
              onAcknowledge={handleAcknowledge}
            />
            <TopReglas
              rules={rules}
              isLoading={isLoading}
              onToggleRule={handleToggleRule}
            />
          </div>

          {/* Estado de Canales */}
          <EstadoCanales
            channels={channels}
            isLoading={isLoading}
            onToggleChannel={handleToggleChannel}
            onNavigate={(url) => router.push(url)}
          />

          {/* Últimas Notificaciones */}
          <UltimasNotificaciones
            notifications={notifications}
            isLoading={isLoading}
            onRetry={handleRetry}
            onNavigate={(url) => router.push(url)}
            onDataChange={loadData}
          />
        </div>
      </div>
    </div>
  );
}
