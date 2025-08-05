import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import type { Activity } from '@/types/activity';

/**
 * Hook para manejar eventos de actividades en tiempo real
 */
export function useActivityRealtime() {
  const [newActivity, setNewActivity] = useState<Activity | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { organization } = useOrganization();

  useEffect(() => {
    const organizationId = organization?.id;
    if (!organizationId) return;

    console.log('🔄 Conectando a canal de actividades en tiempo real...')

    // Crear canal de Supabase Realtime
    const channel = supabase
      .channel('activities')
      .on('broadcast', { event: 'activity_created' }, (payload) => {
        console.log('📢 Nueva actividad recibida:', payload.payload)
        
        // Filtrar por organización para seguridad
        if (payload.payload.organization_id === organizationId) {
          const activity: Activity = {
            id: payload.payload.activity_id,
            organization_id: payload.payload.organization_id,
            activity_type: payload.payload.activity_type,
            user_id: payload.payload.user_id,
            notes: payload.payload.notes,
            related_type: payload.payload.related_type,
            related_id: payload.payload.related_id,
            occurred_at: payload.payload.occurred_at,
            created_at: payload.payload.occurred_at,
            updated_at: payload.payload.occurred_at,
            metadata: payload.payload.metadata,
            user_name: payload.payload.user_name,
            related_entity_name: payload.payload.related_entity_name
          }
          
          setNewActivity(activity)
          
          // Mostrar notificación según tipo de actividad
          showActivityNotification(activity)
        }
      })
      .on('broadcast', { event: 'call_activity_created' }, (payload) => {
        console.log('📞 Nueva actividad de llamada recibida:', payload.payload)
        
        if (payload.payload.organization_id === organizationId) {
          // Mostrar notificación específica para llamadas
          showCallNotification(payload.payload)
        }
      })
      .subscribe((status) => {
        console.log('🔗 Estado del canal:', status)
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      console.log('🔌 Desconectando canal de actividades...')
      channel.unsubscribe()
    }
  }, [organization?.id])

  /**
   * Muestra notificación para actividades generales
   */
  const showActivityNotification = (activity: Activity) => {
    if (!('Notification' in window)) return

    const getActivityIcon = (type: string) => {
      switch (type) {
        case 'call': return '📞'
        case 'email': return '📧'
        case 'whatsapp': return '📱'
        case 'visit': return '🏢'
        case 'note': return '📝'
        default: return '📋'
      }
    }

    const icon = getActivityIcon(activity.activity_type)
    const title = `${icon} Nueva actividad`
    const body = activity.notes || 'Actividad sin descripción'

    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: `activity-${activity.id}`
      })
    }
  }

  /**
   * Muestra notificación específica para llamadas
   */
  const showCallNotification = (payload: any) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const callType = payload.call_status === 'answered' ? 'contestada' : 'recibida'
    const direction = payload.metadata?.call_direction === 'inbound' ? 'entrante' : 'saliente'
    const phone = payload.phone_number || 'Número desconocido'

    const title = `📞 Llamada ${direction} ${callType}`
    const body = `${phone}`

    new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: `call-${payload.activity_id}`
    })
  }

  /**
   * Limpia la nueva actividad (útil después de procesarla en la UI)
   */
  const clearNewActivity = () => {
    setNewActivity(null)
  }

  /**
   * Solicita permisos de notificación
   */
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission()
      console.log('🔔 Permiso de notificación:', permission)
      return permission === 'granted'
    }
    return false
  }

  return {
    newActivity,
    isConnected,
    clearNewActivity,
    requestNotificationPermission
  }
}
