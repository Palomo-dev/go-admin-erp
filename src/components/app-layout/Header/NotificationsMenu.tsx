'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Clock, Inbox } from 'lucide-react';
import { useTaskReminders } from '@/lib/hooks/useTaskReminders';
import { useSharedNotifications } from '@/lib/hooks/useSharedNotifications';
import { TaskReminders } from './TaskReminders';
import { useRouter } from 'next/navigation';
import Logger from '@/lib/utils/logger';
import { translateNotification } from '@/utils/notificationTranslations';
import type { Notification } from '@/types/notification';

interface NotificationsMenuProps {
  organizationId: string | null;
}

export const NotificationsMenu = ({ organizationId }: NotificationsMenuProps) => {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'notifications' | 'tasks'>('notifications');
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  // Hook compartido para notificaciones (configurado para header)
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    refresh
  } = useSharedNotifications(true); // true = para header
  
  // Hook para recordatorios de tareas
  Logger.debug('NOTIFICATIONS', `OrganizationId recibido: ${organizationId}`);
  const { taskReminders, loading: taskRemindersLoading } = useTaskReminders(organizationId);

  // El hook compartido maneja toda la lógica de carga y tiempo real

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
        {(unreadCount > 0 || taskReminders.length > 0) && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount + taskReminders.length}
          </span>
        )}
      </button>

      {notificationsOpen && (
        <div
          className="origin-top-right absolute right-0 mt-2 w-96 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
          role="menu"
          aria-orientation="vertical"
        >
          {/* Header con pestañas */}
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Notificaciones y Recordatorios</h3>
              {(unreadCount > 0 || taskReminders.length > 0) && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {unreadCount + taskReminders.length} pendientes
                </span>
              )}
            </div>
            
            {/* Pestañas */}
            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('notifications')}
                className={`flex-1 flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'notifications'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <Inbox className="h-3 w-3 mr-1" />
                Notificaciones
                {unreadCount > 0 && (
                  <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-xs">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('tasks')}
                className={`flex-1 flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'tasks'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <Clock className="h-3 w-3 mr-1" />
                Tareas
                {taskReminders.length > 0 && (
                  <span className="ml-1 bg-orange-500 text-white rounded-full px-1.5 py-0.5 text-xs">
                    {taskReminders.length}
                  </span>
                )}
              </button>
            </div>
            
            {/* Botón marcar todo como leído - solo para notificaciones */}
            {activeTab === 'notifications' && notifications.length > 0 && unreadCount > 0 && (
              <div className="mt-2 flex justify-end">
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      // Marcar todas las notificaciones no leídas como leídas
                      const unreadNotifications = notifications.filter(n => n.read_at === null);
                      for (const notification of unreadNotifications) {
                        await markAsRead(notification.id);
                      }
                    } catch (error) {
                      console.error('Error al marcar todas como leídas:', error);
                    }
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Marcar todo como leído
                </button>
              </div>
            )}
          </div>
          
          {/* Contenido de las pestañas */}
          <div className="max-h-80 overflow-y-auto">
            {activeTab === 'notifications' ? (
              // Contenido de notificaciones
              loading ? (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  Cargando...
                </div>
              ) : notifications.length > 0 ? (
                notifications.map(notification => {
                  // Procesar notificación usando translateNotification (sin useMemo para evitar violación de reglas de hooks)
                  const translatedNotification = translateNotification(notification.payload);
                  
                  return (
                    <div 
                      key={notification.id} 
                      className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                        !notification.read_at ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-medium">{translatedNotification.title}</p>
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
                        {translatedNotification.message}
                      </p>
                      {!notification.read_at && (
                        <div className="mt-1 flex justify-end">
                          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  No hay notificaciones
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
          
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
            {activeTab === 'notifications' ? (
              <a href="/app/notificaciones" className="text-xs text-blue-600 dark:text-blue-400 hover:underline block text-center">
                Ver todas las notificaciones
              </a>
            ) : (
              <button
                onClick={() => {
                  setNotificationsOpen(false);
                  router.push('/app/crm/tareas');
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline block text-center w-full"
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
