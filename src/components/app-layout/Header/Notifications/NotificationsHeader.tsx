'use client';

import { NotificationService } from './NotificationService';

interface NotificationsHeaderProps {
  unreadCount: number;
  hasNotifications: boolean;
  organizationId: string | null;
  userId: string | null;
  onUpdate: () => void;
}

/**
 * Encabezado del menú de notificaciones
 */
export const NotificationsHeader = ({ 
  unreadCount, 
  hasNotifications,
  organizationId,
  userId,
  onUpdate 
}: NotificationsHeaderProps) => {
  
  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (unreadCount > 0 && userId && organizationId) {
      const success = await NotificationService.markAllAsRead(organizationId, userId);
      if (success) {
        onUpdate();
      }
    }
  };
  
  return (
    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
      <h3 className="text-sm font-medium">Notificaciones</h3>
      <div className="flex items-center gap-3">
        {unreadCount > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {unreadCount} sin leer
          </span>
        )}
        {hasNotifications && (
          <button 
            onClick={handleMarkAllAsRead}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Marcar todo como leído
          </button>
        )}
      </div>
    </div>
  );
};
