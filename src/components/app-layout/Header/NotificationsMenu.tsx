'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Clock, Inbox } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useTaskReminders } from '@/lib/hooks/useTaskReminders';
import { TaskReminders } from './TaskReminders';
import { useRouter } from 'next/navigation';

interface Notification {
  id: string;
  organization_id: number;
  recipient_user_id?: string;
  channel: string;
  payload: {
    type: string;
    title: string;
    content: string;
    [key: string]: any; // Para cualquier campo adicional en payload
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
        // Consultar notificaciones de la organización actual para el usuario
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('recipient_user_id', userId)
          .in('channel', ['app', 'all']) // Solo notificaciones para la app
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (error) throw error;
        
        // Actualizar estado con las notificaciones
        if (data) {
          setNotifications(data as Notification[]);
          // Calcular notificaciones no leídas
          const unread = data.filter((n: Notification) => n.read_at === null).length;
          setUnreadCount(unread);
        }
      } catch (error) {
        console.error('Error al cargar notificaciones:', error);
      } finally {
        setLoading(false);
      }
    };

    if (organizationId && userId) {
      fetchNotifications();
      
      // Suscripción a cambios en notificaciones
      const notificationsSubscription = supabase
        .channel('notifications-changes')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'notifications', 
            filter: `organization_id=eq.${organizationId} AND recipient_user_id=eq.${userId}` 
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
            
            {/* Botón marcar todo como leído - solo para notificaciones */}
            {activeTab === 'notifications' && notifications.length > 0 && unreadCount > 0 && (
              <div className="mt-3 flex justify-end">
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      // Marcar todas las notificaciones como leídas
                      const now = new Date().toISOString();
                      if (userId && organizationId) {
                        const { error } = await supabase
                          .from('notifications')
                          .update({ read_at: now })
                          .eq('organization_id', organizationId)
                          .eq('recipient_user_id', userId)
                          .is('read_at', null);
                          
                        if (error) throw error;
                        
                        // Actualizar estado local
                        setNotifications(notifications.map(n => ({ ...n, read_at: now })));
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
              loading ? (
                <div className="p-6 sm:p-4 text-center text-base sm:text-sm text-gray-500 dark:text-gray-400">
                  Cargando...
                </div>
              ) : notifications.length > 0 ? (
                notifications.map(notification => (
                  <div 
                    key={notification.id} 
                    className={`px-4 py-4 sm:py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 cursor-pointer transition-colors ${
                      !notification.read_at ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                    onClick={() => markAsRead(notification.id)}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <p className="text-base sm:text-sm font-medium text-gray-900 dark:text-gray-100 flex-1">{notification.payload.title}</p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {new Date(notification.created_at).toLocaleString('es', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-sm sm:text-xs mt-2 sm:mt-1 text-gray-600 dark:text-gray-300 line-clamp-2">
                      {notification.payload.content}
                    </p>
                    {!notification.read_at && (
                      <div className="mt-2 sm:mt-1 flex justify-end">
                        <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 sm:p-4 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 sm:w-12 sm:h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3 sm:mb-2">
                    <Inbox className="h-8 w-8 sm:h-6 sm:w-6 text-gray-400" />
                  </div>
                  <p className="text-base sm:text-sm text-gray-500 dark:text-gray-400 font-medium">
                    No hay notificaciones
                  </p>
                </div>
              )
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
    </div>
  );
};

export default NotificationsMenu;
