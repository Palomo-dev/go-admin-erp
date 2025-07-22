'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { NotificationsProps, Notification } from './types';
import { NotificationService } from './NotificationService';
import { NotificationsList } from './NotificationsList';
import { NotificationsHeader } from './NotificationsHeader';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';

/**
 * Menú principal de notificaciones
 * Muestra un botón con contador de notificaciones no leídas
 * y un menú desplegable con la lista de notificaciones
 */
export const NotificationsMenu = ({ organizationId }: NotificationsProps) => {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Obtener el usuario actual
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user && !error) {
        setUserId(user.id);
      }
    };
    
    fetchCurrentUser();
  }, []);

  // Función para cargar notificaciones
  const fetchNotifications = async () => {
    if (!organizationId || !userId) return;
    
    setLoading(true);
    try {
      const { notifications, unreadCount } = await NotificationService.getNotifications(
        organizationId, 
        userId
      );
      
      setNotifications(notifications);
      setUnreadCount(unreadCount);
    } catch (error) {
      console.error('Error al cargar notificaciones:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las notificaciones",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Configurar la suscripción a cambios en notificaciones
  useEffect(() => {
    if (organizationId && userId) {
      fetchNotifications();
      
      // Suscripción a cambios en notificaciones
      const subscription = NotificationService.subscribeToChanges(
        organizationId, 
        userId, 
        fetchNotifications
      );
      
      return () => {
        if (subscription) {
          subscription.unsubscribe();
        }
      };
    }
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
          <NotificationsHeader
            unreadCount={unreadCount}
            hasNotifications={notifications.length > 0}
            organizationId={organizationId}
            userId={userId}
            onUpdate={fetchNotifications}
          />
          
          <NotificationsList
            notifications={notifications}
            loading={loading}
            onUpdate={fetchNotifications}
          />
          
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
