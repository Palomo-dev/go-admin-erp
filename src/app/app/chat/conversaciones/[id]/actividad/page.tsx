'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useCapacidades } from '@/lib/navigation/useCapacidades';
import { useConversacion } from '@/components/chat/conversations/useConversacion';
import { CabeceraConversacion } from '@/components/chat/conversations/CabeceraConversacion';
import ConversationActivityService, {
  estadisticasActividad,
  type ActivityItem,
} from '@/lib/services/conversationActivityService';
import { ActivityHeader, ActivityList } from '@/components/chat/conversations/id/activity';

/** Conversación › Actividad (Figma 91-chat-11). */
export default function ConversationActivityPage() {
  const params = useParams();
  const conversationId = params?.id as string;
  const { toast } = useToast();
  const t = useTranslations('chatHilo.actividad');
  const tComun = useTranslations('chatHilo.comun');
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const c = useConversacion(organizationId, conversationId);
  const { getToday } = useFormatDate();
  // Exportar lo decide el servidor (`/api/me/capacidades`), nunca el nombre del rol.
  const { datos: capacidades } = useCapacidades();

  const loadData = useCallback(async () => {
    if (!organizationId || !conversationId) return;
    try {
      setLoading(true);
      // Una sola lectura: las cifras salen de la misma lista.
      setActivities(await new ConversationActivityService(organizationId).getAllActivities(conversationId));
    } catch (error) {
      console.error('Error cargando actividad:', error);
      toast({ title: tComun('error'), description: t('errorCarga'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organizationId, conversationId, toast, t, tComun]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = useMemo(() => (loading ? null : estadisticasActividad(activities)), [activities, loading]);

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <CabeceraConversacion c={c} seccion="actividad" conversationId={conversationId} contadores={{ actividad: stats?.totalActivities ?? null }} />
      <ActivityHeader stats={stats} loading={loading} />
      <div className="flex-1">
        <ActivityList
          activities={activities}
          loading={loading}
          agentes={c.agentes}
          canExport={capacidades.esAdmin}
          nombreCsv={`${t('csv.archivo')}_${conversationId}_${getToday()}`}
        />
      </div>
    </div>
  );
}
