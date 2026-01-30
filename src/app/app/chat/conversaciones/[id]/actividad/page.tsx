'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
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
  const conversationId = params.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && conversationId) {
      loadData();
      checkUserRole();
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

  const checkUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from('organization_members')
        .select(`
          role_id,
          roles:role_id (name)
        `)
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .single();

      if (member?.roles) {
        const roleData = member.roles as any;
        setUserRole(roleData?.name || null);
      }
    } catch (error) {
      console.error('Error verificando rol:', error);
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
      link.setAttribute('download', `actividad_conversacion_${conversationId}_${new Date().toISOString().split('T')[0]}.csv`);
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

  const canExport = userRole === 'admin' || userRole === 'owner' || userRole === 'Administrador';

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <ActivityHeader
        conversationId={conversationId}
        stats={stats}
        loading={loading}
        onExport={handleExport}
        canExport={canExport}
      />

      <div className="flex-1 overflow-y-auto">
        <ActivityList
          activities={activities}
          loading={loading}
        />
      </div>
    </div>
  );
}
