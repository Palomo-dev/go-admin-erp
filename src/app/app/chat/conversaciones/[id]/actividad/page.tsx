'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useCapacidades } from '@/lib/navigation/useCapacidades';
import { useConversacion } from '@/components/chat/conversations/useConversacion';
import { CabeceraConversacion } from '@/components/chat/conversations/CabeceraConversacion';
import ConversationActivityService, {
  ActivityItem,
  ActivityStats
} from '@/lib/services/conversationActivityService';
import {
  ActivityHeader,
  ActivityList
} from '@/components/chat/conversations/id/activity';

export default function ConversationActivityPage() {
  const params = useParams();
  const conversationId = params?.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const c = useConversacion(organizationId, conversationId);
  const { getToday } = useFormatDate();
  // Exportar lo decide el servidor (`/api/me/capacidades`), nunca el nombre del rol.
  const { datos: capacidades } = useCapacidades();

  useEffect(() => {
    if (organizationId && conversationId) {
      loadData();
    }
  }, [organizationId, conversationId]);

  const loadData = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      const service = new ConversationActivityService(organizationId);

      const [activitiesData, statsData] = await Promise.all([
        service.getAllActivities(conversationId),
        service.getStats(conversationId)
      ]);

      setActivities(activitiesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando actividad:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la actividad',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!organizationId || activities.length === 0) return;

    try {
      const service = new ConversationActivityService(organizationId);
      const csvContent = service.exportToCSV(activities);
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `actividad_conversacion_${conversationId}_${getToday()}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Exportación completada',
        description: 'El archivo CSV ha sido descargado'
      });
    } catch (error) {
      console.error('Error exportando:', error);
      toast({
        title: 'Error',
        description: 'No se pudo exportar la actividad',
        variant: 'destructive'
      });
    }
  };

  const canExport = capacidades.esAdmin;

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <CabeceraConversacion c={c} seccion="actividad" conversationId={conversationId} contadores={{ actividad: stats?.totalActivities ?? null }} />
      <ActivityHeader
        stats={stats}
        loading={loading}
        onExport={handleExport}
        canExport={canExport}
      />

      <div className="flex-1">
        <ActivityList
          activities={activities}
          loading={loading}
        />
      </div>
    </div>
  );
}
