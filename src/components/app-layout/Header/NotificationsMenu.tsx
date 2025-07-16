'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';

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
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  // Usamos la instancia de supabase ya configurada directamente desde la importación

  // Obtener ID del usuario actual
  const [userId, setUserId] = useState<string | null>(null);
  
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
    <div className="relative ml-3" ref={notificationMenuRef}>
      <button
        onClick={() => setNotificationsOpen(!notificationsOpen)}
        className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none relative"
        aria-label="Ver notificaciones"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {notificationsOpen && (
        <div
          className="origin-top-right absolute right-0 mt-2 w-80 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="text-sm font-medium">Notificaciones</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {unreadCount} sin leer
              </span>
            )}
            {notifications.length > 0 && (
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
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Marcar todo como leído
              </button>
            )}
          </div>
          
          <div className="max-h-60 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Cargando...
              </div>
            ) : notifications.length > 0 ? (
              notifications.map(notification => (
                <div 
                  key={notification.id} 
                  className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                    !notification.read_at ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium">{notification.payload.title}</p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(notification.created_at).toLocaleString('es', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="text-xs mt-1 text-gray-600 dark:text-gray-300">
                    {notification.payload.content}
                  </p>
                  {!notification.read_at && (
                    <div className="mt-1 flex justify-end">
                      <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No hay notificaciones
              </div>
            )}
          </div>
          
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
            <a href="/app/notificaciones" className="text-xs text-blue-600 dark:text-blue-400 hover:underline block text-center">
              Ver todas las notificaciones
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsMenu;
