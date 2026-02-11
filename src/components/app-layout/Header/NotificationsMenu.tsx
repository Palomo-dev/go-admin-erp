'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Clock, Inbox, Mail, Smartphone, MessageSquare, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { useTaskReminders } from '@/lib/hooks/useTaskReminders';
import { TaskReminders } from './TaskReminders';
import { useRouter } from 'next/navigation';
import { NotificationDetailSheet } from '@/components/notificaciones/NotificationDetailSheet';

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
  read_at: string | null;
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
  
  // Obtener ID del usuario actual
  const [userId, setUserId] = useState<string | null>(null);
  
  // Hook para recordatorios de tareas
  const { taskReminders, loading: taskRemindersLoading } = useTaskReminders(organizationId);
  
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
    const fetchNotifications = async () => {
      if (!organizationId || !userId) return;
      
      setLoading(true);
      try {
        // 1. Mis notificaciones (dirigidas al usuario)
        const { data: myData, error: myError } = await supabase
          .from('notifications')
          .select('*')
          .eq('organization_id', organizationId)
          .neq('status', 'deleted')
          .eq('recipient_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(15);

        if (myError) throw myError;

        // 2. Todas las notificaciones de la org
        const { data: allData, error: allError } = await supabase
          .from('notifications')
          .select('*')
          .eq('organization_id', organizationId)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false })
          .limit(20);

        if (allError) throw allError;

        // 3. Conteos de no leídas
        const { count: myUnread } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .neq('status', 'deleted')
          .eq('recipient_user_id', userId)
          .is('read_at', null);

        const { count: totalUnread } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .neq('status', 'deleted')
          .is('read_at', null);

        // Actualizar estados
        setNotifications((myData || []) as Notification[]);
        setAllNotifications((allData || []) as Notification[]);
        setMyUnreadCount(myUnread ?? 0);
        setAllUnreadCount(totalUnread ?? 0);
        setUnreadCount((myUnread ?? 0) + (totalUnread ?? 0));
      } catch (error) {
        console.error('Error al cargar notificaciones:', error);
      } finally {
        setLoading(false);
      }
    };

    if (organizationId && userId) {
      fetchNotifications();
      
      // Suscripción a cambios en notificaciones de la organización
      const notificationsSubscription = supabase
        .channel('notifications-changes')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'notifications', 
            filter: `organization_id=eq.${organizationId}` 
          },
          () => fetchNotifications()
        )
        .subscribe();
      
      return () => {
        notificationsSubscription.unsubscribe();
      };
    }
  }, [organizationId, userId]);  // Agregamos userId como dependencia

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
    const now = new Date().toISOString();
    const wasUnread = !notification.read_at;

    // Mostrar la notificación con read_at actualizado inmediatamente
    setSelectedNotification({ ...notification, read_at: notification.read_at || now });

    // Marcar como leída en BD y actualizar listas
    if (wasUnread) {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: now })
          .eq('id', notification.id);

        if (!error) {
          setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read_at: now } : n));
          setAllNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read_at: now } : n));
          setMyUnreadCount(prev => Math.max(0, prev - 1));
          setAllUnreadCount(prev => Math.max(0, prev - 1));
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.error('Error al marcar como leída:', err);
      }
    }
  };

  // Marcar notificación como leída
  const markAsRead = async (id: string) => {
    try {
      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('id', id);
      
      if (error) throw error;
      
      // Actualizar estado local
      setNotifications(notifications.map(n => 
        n.id === id ? { ...n, read_at: now } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error al marcar como leída:', error);
    }
  };

  return (
    <div className="relative" ref={notificationMenuRef}>
      <button
        onClick={() => setNotificationsOpen(!notificationsOpen)}
        className="p-2.5 rounded-md text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 dark:active:bg-gray-600 focus:outline-none relative transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Ver notificaciones"
      >
        <Bell className="h-5 w-5" />
        {(unreadCount > 0 || taskReminders.length > 0) && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
            {unreadCount + taskReminders.length}
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
              {(unreadCount > 0 || taskReminders.length > 0) && (
                <span className="text-sm sm:text-xs font-medium text-gray-600 dark:text-gray-400">
                  {unreadCount + taskReminders.length} pendiente{(unreadCount + taskReminders.length) !== 1 ? 's' : ''}
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
                {unreadCount > 0 && (
                  <span className="ml-1.5 sm:ml-1 bg-red-500 text-white rounded-full px-2 sm:px-1.5 py-0.5 text-xs font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>
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
            </div>
            
            {/* Sub-tabs: Mías / Todas (solo visible en tab Notificaciones) */}
            {activeTab === 'notifications' && (
              <div className="flex gap-1 mt-2 bg-gray-50 dark:bg-gray-750 rounded-md p-0.5">
                <button
                  onClick={() => setNotifSubTab('mine')}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                    notifSubTab === 'mine'
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
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
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                    notifSubTab === 'all'
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  <Users className="h-3 w-3" />
                  Todas
                  {allUnreadCount > 0 && (
                    <span className="bg-gray-500 text-white rounded-full px-1.5 py-0 text-[10px] font-bold">{allUnreadCount}</span>
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
                      const now = new Date().toISOString();
                      if (userId && organizationId) {
                        let query = supabase
                          .from('notifications')
                          .update({ read_at: now })
                          .eq('organization_id', organizationId)
                          .neq('status', 'deleted')
                          .is('read_at', null);

                        // Si estamos en "Mías", solo marcar las del usuario
                        if (notifSubTab === 'mine') {
                          query = query.eq('recipient_user_id', userId);
                        }

                        const { error } = await query;
                        if (error) throw error;
                        
                        // Actualizar estado local
                        if (notifSubTab === 'mine') {
                          setNotifications(notifications.map(n => ({ ...n, read_at: now })));
                          setMyUnreadCount(0);
                        } else {
                          setAllNotifications(allNotifications.map(n => ({ ...n, read_at: now })));
                          setNotifications(notifications.map(n => ({ ...n, read_at: now })));
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
                const displayNotifs = notifSubTab === 'mine' ? notifications : allNotifications;
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
                        !notification.read_at ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <ChannelIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <p className="text-base sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{title}</p>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {new Date(notification.created_at).toLocaleString('es', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      {content && (
                        <p className="text-sm sm:text-xs mt-2 sm:mt-1 text-gray-600 dark:text-gray-300 line-clamp-2 pl-6">
                          {content}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1 pl-6">
                        <span className="text-xs text-gray-400 capitalize">{notification.channel}</span>
                        {!notification.read_at && (
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
                onTaskClick={(taskId) => {
                  setNotificationsOpen(false);
                  router.push(`/app/crm/tareas?taskId=${taskId}`);
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
                  router.push('/app/crm/tareas');
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
