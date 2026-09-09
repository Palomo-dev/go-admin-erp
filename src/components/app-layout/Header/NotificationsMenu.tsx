'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Clock, Inbox, Mail, Smartphone, MessageSquare, User, Users, FolderKanban, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { useTaskReminders } from '@/lib/hooks/useTaskReminders';
import { TaskReminders } from './TaskReminders';
import { useRouter } from 'next/navigation';
import { NotificationDetailSheet } from '@/components/notificaciones/NotificationDetailSheet';
import { useOptimizedModules } from '@/hooks/useOptimizedModules';

// Tipos de notificación relacionados con tareas del módulo PM
const TASK_NOTIFICATION_TYPES = new Set([
  'task_assigned',
  'task_completed',
  'task_agent',
  'task_rescheduled',
  'task_reschedule_summary',
]);

// Verifica si una notificación pertenece al módulo de tareas (PM)
const isTaskNotification = (notification: Notification): boolean => {
  const type = notification.payload?.type;
  return !!type && TASK_NOTIFICATION_TYPES.has(type);
};

interface Notification {
  id: string;
  organization_id: number;
  recipient_user_id?: string;
  channel: string;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  payload: {
    type?: string;
    title?: string;
    content?: string;
    [key: string]: any;
  };
  status: string;
  read_at: string | null; // Deprecado: usar is_read_by_me
  is_read_by_me?: boolean; // true si el usuario actual tiene fila en notification_reads
  created_at: string;
}

interface NotificationsMenuProps {
  organizationId: string | null;
}

export const NotificationsMenu = ({ organizationId }: NotificationsMenuProps) => {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'notifications' | 'tasks'>('notifications');
  const [notifSubTab, setNotifSubTab] = useState<'mine' | 'all'>('mine');
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [allUnreadCount, setAllUnreadCount] = useState(0);
  const [myUnreadCount, setMyUnreadCount] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Verificar si el módulo PM (tareas) está activo para la organización
  const { canAccessModule } = useOptimizedModules(
    organizationId ? parseInt(organizationId, 10) : undefined
  );
  const isPmActive = canAccessModule('pm');
  
  // Obtener ID del usuario actual
  const [userId, setUserId] = useState<string | null>(null);
  
  // Hook para recordatorios de tareas
  const { taskReminders, loading: taskRemindersLoading } = useTaskReminders(organizationId);

  // Ref para mantener la versión más reciente de fetchNotifications accesible
  // desde el callback de Realtime sin que el useEffect de suscripción dependa
  // de isPmActive (lo que cancelaría la suscripción en cada cambio de módulo).
  const fetchNotificationsRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});
  
  useEffect(() => {
    // Obtener el usuario actual
    const fetchCurrentUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user && !error) {
        setUserId(user.id);
      }
    };
    
    fetchCurrentUser();
  }, []);

  // Cargar notificaciones
  useEffect(() => {
    // `silent` evita el flash de "Cargando..." cuando el refetch lo dispara
    // Realtime (insert de notificación nueva). Solo la carga inicial muestra
    // el spinner; los refetchs en vivo actualizan la lista en su lugar.
    const fetchNotifications = async (silent = false) => {
      if (!organizationId || !userId) return;

      if (!silent) setLoading(true);
      try {
        // Si el módulo PM no está activo, excluir notificaciones de tareas en la
        // query (no en el cliente) para que el limit aplique solo sobre las que
        // se van a mostrar. Si se filtra en el cliente, las notificaciones no-tarea
        // quedan enterradas bajo las de tareas y fuera del limit, causando
        // discrepancia entre el badge (que cuenta todas) y la lista (que muestra 0).
        const taskTypesFilter = '("task_assigned","task_completed","task_agent","task_rescheduled","task_reschedule_summary")';

        // 1. Mis notificaciones (dirigidas al usuario)
        let myQuery = supabase
          .from('notifications')
          .select('*')
          .eq('organization_id', organizationId)
          .neq('status', 'deleted')
          .eq('recipient_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(15);

        if (!isPmActive) {
          myQuery = myQuery.not('payload->>type', 'in', taskTypesFilter);
        }

        const { data: myData, error: myError } = await myQuery;

        if (myError) throw myError;

        // 2. Todas las notificaciones de la org
        let allQuery = supabase
          .from('notifications')
          .select('*')
          .eq('organization_id', organizationId)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false })
          .limit(20);

        if (!isPmActive) {
          allQuery = allQuery.not('payload->>type', 'in', taskTypesFilter);
        }

        const { data: allData, error: allError } = await allQuery;

        if (allError) throw allError;

        // 3. Conteos de no leídas (per-user via RPC)
        const { data: myUnreadRpc } = await supabase.rpc('get_unread_notifications_count', {
          p_organization_id: parseInt(organizationId, 10),
          p_scope: 'mine',
          p_exclude_task_types: !isPmActive,
        });
        const { data: allUnreadRpc } = await supabase.rpc('get_unread_notifications_count', {
          p_organization_id: parseInt(organizationId, 10),
          p_scope: 'all',
          p_exclude_task_types: !isPmActive,
        });

        const finalMyUnread = (myUnreadRpc as unknown as number) ?? 0;
        const finalAllUnread = (allUnreadRpc as unknown as number) ?? 0;

        // 4. Merge is_read_by_me desde notification_reads (per-user)
        const allNotifIds = [
          ...(myData || []).map(n => n.id),
          ...(allData || []).map(n => n.id),
        ];
        let readIds = new Set<string>();
        if (allNotifIds.length > 0) {
          const { data: readData } = await supabase
            .from('notification_reads')
            .select('notification_id')
            .eq('user_id', userId)
            .in('notification_id', allNotifIds);
          readIds = new Set((readData || []).map(r => r.notification_id));
        }

        const myNotifsWithRead = (myData || []).map(n => ({ ...n, is_read_by_me: readIds.has(n.id) ?? false }) as Notification);
        const allNotifsWithRead = (allData || []).map(n => ({ ...n, is_read_by_me: readIds.has(n.id) ?? false }) as Notification);

        // Actualizar estados
        setNotifications(myNotifsWithRead);
        setAllNotifications(allNotifsWithRead);
        setMyUnreadCount(finalMyUnread);
        setAllUnreadCount(finalAllUnread);
        setUnreadCount(finalMyUnread);
      } catch (error) {
        console.error('Error al cargar notificaciones:', error);
      } finally {
        setLoading(false);
      }
    };

    // Mantener el ref actualizado para que el callback de Realtime use siempre
    // la versión más reciente de fetchNotifications (con los filtros de PM correctos).
    fetchNotificationsRef.current = fetchNotifications;

    if (organizationId && userId) {
      fetchNotifications();
    }
  }, [organizationId, userId, isPmActive]);  // Incluimos isPmActive para recalcular conteos si cambia el módulo PM

  // ── Suscripción a Realtime (separada del useEffect de carga) ──
  // Si se deja dentro del useEffect anterior, cualquier cambio en
  // `isPmActive` desuscribe y vuelve a suscribir antes de que la conexión
  // WebSocket se estabilice, haciendo que las notificaciones en vivo nunca
  // lleguen al cliente. Separándola, la suscripción solo se recrea si cambian
  // `organizationId` o `userId` (eventos que sí requieren una nueva suscripción).
  //
  // El nombre del canal incluye organizationId para evitar colisiones cuando
  // el usuario cambia de organización: si se reusa el mismo nombre, el canal
  // anterior puede seguir vivo y entregar eventos de la org equivocada.
  //
  // NO limpiar el estado (setNotifications([])) aquí: este useEffect se
  // ejecuta cuando userId pasa de null → uuid (al cargar la sesión), lo que
  // vaciaría las notificaciones DESPUÉS de que el useEffect de carga las
  // llenó. El canal único por org + el refetch silencioso son suficientes
  // para evitar datos stale sin necesidad de limpiar manualmente.
  useEffect(() => {
    if (!organizationId || !userId) return;

    let isActive = true;

    const channel = supabase
      .channel(`notifications-changes-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (!isActive) return;
          // Refetch silencioso: actualiza la lista sin flash de "Cargando..."
          fetchNotificationsRef.current(true);
        }
      )
      .subscribe((status) => {
        if (!isActive) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[NotificationsMenu] Realtime error:', status);
        }
      });

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [organizationId, userId]);

  // ── Suscripción a Realtime para notification_reads (per-user) ──
  // Reacciona cuando se inserta un read desde otro dispositivo/session.
  useEffect(() => {
    if (!organizationId || !userId) return;

    let isActive = true;

    const readsChannel = supabase
      .channel(`notification-reads-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_reads',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (!isActive) return;
          fetchNotificationsRef.current(true);
        }
      )
      .subscribe((status) => {
        if (!isActive) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[NotificationsMenu] notification_reads Realtime error:', status);
        }
      });

    return () => {
      isActive = false;
      supabase.removeChannel(readsChannel);
    };
  }, [organizationId, userId]);

  // Cerrar el menú cuando se hace clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Abrir panel de detalle
  const handleNotificationClick = async (notification: Notification) => {
    const wasUnread = !notification.is_read_by_me;

    // Mostrar la notificación con is_read_by_me actualizado inmediatamente
    setSelectedNotification({ ...notification, is_read_by_me: true });

    // Marcar como leída en BD (per-user: INSERT en notification_reads) y actualizar listas
    if (wasUnread && userId) {
      try {
        const { error } = await supabase
          .from('notification_reads')
          .insert({ notification_id: notification.id, user_id: userId });

        if (!error || error.code === '23505') {
          setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read_by_me: true } : n));
          setAllNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read_by_me: true } : n));
          setMyUnreadCount(prev => Math.max(0, prev - 1));
          setAllUnreadCount(prev => Math.max(0, prev - 1));
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.error('Error al marcar como leída:', err);
      }
    }
  };

  // Marcar notificación como leída (per-user: INSERT en notification_reads)
  const markAsRead = async (id: string) => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('notification_reads')
        .insert({ notification_id: id, user_id: userId });

      if (error && error.code !== '23505') throw error;

      // Actualizar estado local en ambas listas
      setNotifications(notifications.map(n =>
        n.id === id ? { ...n, is_read_by_me: true } : n
      ));
      setAllNotifications(prev => prev.map(n =>
        n.id === id ? { ...n, is_read_by_me: true } : n
      ));
      setMyUnreadCount(prev => Math.max(0, prev - 1));
      setAllUnreadCount(prev => Math.max(0, prev - 1));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error al marcar como leída:', error);
    }
  };

  // Descartar (ocultar) una notificación del panel marcándola como 'deleted'
  const dismissNotification = async (id: string, wasUnread: boolean) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ status: 'deleted' })
        .eq('id', id);

      if (error) throw error;

      // Remover de ambas listas y ajustar conteos si era no leída
      setNotifications(prev => prev.filter(n => n.id !== id));
      setAllNotifications(prev => prev.filter(n => n.id !== id));
      if (wasUnread) {
        setMyUnreadCount(prev => Math.max(0, prev - 1));
        setAllUnreadCount(prev => Math.max(0, prev - 1));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error al descartar notificación:', err);
    }
  };

  return (
    <div className="relative" ref={notificationMenuRef}>
      <button
        onClick={() => setNotificationsOpen(!notificationsOpen)}
        className="p-2.5 rounded-md text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 dark:active:bg-gray-600 focus:outline-none relative transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Ver notificaciones"
        aria-expanded={notificationsOpen}
        aria-haspopup="menu"
      >
        <Bell className="h-5 w-5" />
        {(allUnreadCount > 0 || (isPmActive && taskReminders.length > 0)) && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
            {allUnreadCount + (isPmActive ? taskReminders.length : 0)}
          </span>
        )}
      </button>

      {notificationsOpen && (
        <div
          className="fixed sm:absolute left-0 right-0 sm:left-auto sm:right-0 top-[60px] sm:top-auto mt-0 sm:mt-2 w-full sm:w-96 max-w-full sm:max-w-md rounded-none sm:rounded-lg shadow-xl bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50 max-h-[calc(100vh-60px)] sm:max-h-[600px] flex flex-col"
          role="menu"
          aria-orientation="vertical"
        >
          {/* Header con pestañas */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base sm:text-sm font-semibold sm:font-medium text-gray-900 dark:text-gray-100">Notificaciones y Recordatorios</h3>
              {(allUnreadCount > 0 || (isPmActive && taskReminders.length > 0)) && (
                <span className="text-sm sm:text-xs font-medium text-gray-600 dark:text-gray-400">
                  {allUnreadCount + (isPmActive ? taskReminders.length : 0)} pendiente{(allUnreadCount + (isPmActive ? taskReminders.length : 0)) !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            
            {/* Pestañas */}
            <div className="flex gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('notifications')}
                className={`flex-1 flex items-center justify-center px-3 py-2 sm:py-1.5 text-sm sm:text-xs font-medium rounded-md transition-colors min-h-[40px] sm:min-h-0 ${
                  activeTab === 'notifications'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 active:bg-gray-200 dark:active:bg-gray-600'
                }`}
              >
                <Inbox className="h-4 w-4 sm:h-3 sm:w-3 mr-1.5 sm:mr-1" />
                <span className="truncate">Notificaciones</span>
                {myUnreadCount > 0 && (
                  <span className="ml-1.5 sm:ml-1 bg-red-500 text-white rounded-full px-2 sm:px-1.5 py-0.5 text-xs font-bold">
                    {myUnreadCount}
                  </span>
                )}
              </button>
              {isPmActive && (
                <button
                  onClick={() => setActiveTab('tasks')}
                  className={`flex-1 flex items-center justify-center px-3 py-2 sm:py-1.5 text-sm sm:text-xs font-medium rounded-md transition-colors min-h-[40px] sm:min-h-0 ${
                    activeTab === 'tasks'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 active:bg-gray-200 dark:active:bg-gray-600'
                  }`}
                >
                  <Clock className="h-4 w-4 sm:h-3 sm:w-3 mr-1.5 sm:mr-1" />
                  <span className="truncate">Tareas</span>
                  {taskReminders.length > 0 && (
                    <span className="ml-1.5 sm:ml-1 bg-orange-500 text-white rounded-full px-2 sm:px-1.5 py-0.5 text-xs font-bold">
                      {taskReminders.length}
                    </span>
                  )}
                </button>
              )}
            </div>
            
            {/* Sub-tabs: Mías / Todas (solo visible en tab Notificaciones) */}
            {activeTab === 'notifications' && (
              <div className="flex gap-1 mt-2 bg-gray-100 dark:bg-gray-700/50 rounded-md p-1">
                <button
                  onClick={() => setNotifSubTab('mine')}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    notifSubTab === 'mine'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <User className="h-3 w-3" />
                  Mías
                  {myUnreadCount > 0 && (
                    <span className="bg-blue-500 text-white rounded-full px-1.5 py-0 text-[10px] font-bold">{myUnreadCount}</span>
                  )}
                </button>
                <button
                  onClick={() => setNotifSubTab('all')}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    notifSubTab === 'all'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Users className="h-3 w-3" />
                  Todas
                  {allUnreadCount > 0 && (
                    <span className="bg-gray-500 dark:bg-gray-600 text-white rounded-full px-1.5 py-0 text-[10px] font-bold">{allUnreadCount}</span>
                  )}
                </button>
              </div>
            )}

            {/* Botón marcar todo como leído - solo para notificaciones */}
            {activeTab === 'notifications' && (notifSubTab === 'mine' ? notifications : allNotifications).length > 0 && (notifSubTab === 'mine' ? myUnreadCount : allUnreadCount) > 0 && (
              <div className="mt-3 flex justify-end">
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      if (userId && organizationId) {
                        // RPC server-side: INSERT ... SELECT ... ON CONFLICT DO NOTHING
                        // Atomico, sin limite de 1000 filas de PostgREST, sin race conditions.
                        // auth.uid() dentro de la funcion es la fuente de usuario (no p_user_id).
                        const { data: rpcData, error: rpcErr } = await supabase.rpc('mark_all_notifications_as_read', {
                          p_organization_id: parseInt(organizationId, 10),
                          p_scope: notifSubTab === 'mine' ? 'mine' : 'all',
                        });

                        if (rpcErr) throw rpcErr;

                        const inserted = (rpcData as unknown as number) ?? 0;

                        // Actualizar estado local
                        if (notifSubTab === 'mine') {
                          setNotifications(notifications.map(n => ({ ...n, is_read_by_me: true })));
                          setMyUnreadCount(0);
                          // Decrementar allUnreadCount (badge) por la cantidad insertada
                          setAllUnreadCount(prev => Math.max(0, prev - inserted));
                        } else {
                          setAllNotifications(allNotifications.map(n => ({ ...n, is_read_by_me: true })));
                          setNotifications(notifications.map(n => ({ ...n, is_read_by_me: true })));
                          setAllUnreadCount(0);
                          setMyUnreadCount(0);
                        }
                        setUnreadCount(0);
                      }
                    } catch (error) {
                      console.error('Error al marcar todas como leídas:', error);
                    }
                  }}
                  className="text-sm sm:text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium min-h-[40px] sm:min-h-0 flex items-center"
                >
                  Marcar todo como leído
                </button>
              </div>
            )}
          </div>
          
          {/* Contenido de las pestañas */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {activeTab === 'notifications' ? (
              // Contenido de notificaciones
              (() => {
                const rawNotifs = notifSubTab === 'mine' ? notifications : allNotifications;
                // Ocultar notificaciones de tareas si el módulo PM no está activo
                const displayNotifs = isPmActive
                  ? rawNotifs
                  : rawNotifs.filter(n => !isTaskNotification(n));
                return loading ? (
                  <div className="p-6 sm:p-4 text-center text-base sm:text-sm text-gray-500 dark:text-gray-400">
                    Cargando...
                  </div>
                ) : displayNotifs.length > 0 ? (
                  displayNotifs.map(notification => {
                  const title = notification.payload?.title || notification.payload?.type || 'Notificación';
                  const content = notification.payload?.content || notification.recipient_email || '';
                  const ChannelIcon = notification.channel === 'email' ? Mail : notification.channel === 'sms' ? Smartphone : notification.channel === 'whatsapp' ? MessageSquare : Bell;

                  return (
                    <div 
                      key={notification.id} 
                      className={`px-4 py-4 sm:py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 cursor-pointer transition-colors ${
                        !notification.is_read_by_me ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <ChannelIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <p className="text-base sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{title}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(notification.created_at).toLocaleString('es', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotification(notification.id, !notification.is_read_by_me);
                            }}
                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 dark:hover:text-gray-200 dark:hover:bg-gray-600 transition-colors"
                            aria-label="Descartar notificación"
                            title="Descartar notificación"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {content && (
                        <p className="text-sm sm:text-xs mt-2 sm:mt-1 text-gray-600 dark:text-gray-300 line-clamp-2 pl-6">
                          {content}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1 pl-6">
                        <span className="text-xs text-gray-400 capitalize">{notification.channel}</span>
                        {!notification.is_read_by_me && (
                          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                        )}
                      </div>
                    </div>
                  );
                })
                ) : (
                  <div className="p-8 sm:p-4 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 sm:w-12 sm:h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3 sm:mb-2">
                      <Inbox className="h-8 w-8 sm:h-6 sm:w-6 text-gray-400" />
                    </div>
                    <p className="text-base sm:text-sm text-gray-500 dark:text-gray-400 font-medium">
                      {notifSubTab === 'mine' ? 'No tienes notificaciones' : 'No hay notificaciones'}
                    </p>
                  </div>
                );
              })()
            ) : (
              // Contenido de recordatorios de tareas
              <TaskReminders
                taskReminders={taskReminders}
                loading={taskRemindersLoading}
                onTaskClick={(reminder) => {
                  setNotificationsOpen(false);
                  router.push(`/app/pm/tareas?taskId=${reminder.id}`);
                }}
              />
            )}
          </div>
          
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            {activeTab === 'notifications' ? (
              <a 
                href="/app/notificaciones" 
                className="text-sm sm:text-xs text-blue-600 dark:text-blue-400 hover:underline block text-center font-medium min-h-[44px] sm:min-h-0 flex items-center justify-center"
              >
                Ver todas las notificaciones
              </a>
            ) : (
              <button
                onClick={() => {
                  setNotificationsOpen(false);
                  router.push('/app/pm/tareas');
                }}
                className="text-sm sm:text-xs text-blue-600 dark:text-blue-400 hover:underline block text-center w-full font-medium min-h-[44px] sm:min-h-0 flex items-center justify-center"
              >
                Ver gestor de tareas
              </button>
            )}
          </div>
        </div>
      )}
      {/* Sheet de detalle de notificación */}
      <NotificationDetailSheet
        notification={selectedNotification}
        open={!!selectedNotification}
        onOpenChange={(open) => { if (!open) setSelectedNotification(null); }}
        onNavigate={(url) => { setSelectedNotification(null); setNotificationsOpen(false); router.push(url); }}
      />
    </div>
  );
};

export default NotificationsMenu;
