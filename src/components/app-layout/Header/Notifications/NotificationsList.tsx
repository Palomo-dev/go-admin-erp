'use client';

import { Notification } from './types';
import { NotificationItem } from './NotificationItem';

interface NotificationsListProps {
  notifications: Notification[];
  loading: boolean;
  onUpdate: () => void;
}

/**
 * Componente que muestra la lista de notificaciones
 */
export const NotificationsList = ({ 
  notifications, 
  loading, 
  onUpdate 
}: NotificationsListProps) => {
  
  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        Cargando...
      </div>
    );
  }
  
  if (notifications.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        No hay notificaciones
      </div>
    );
  }
  
  return (
    <div className="max-h-60 overflow-y-auto">
      {notifications.map(notification => (
        <NotificationItem 
          key={notification.id} 
          notification={notification} 
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
};
