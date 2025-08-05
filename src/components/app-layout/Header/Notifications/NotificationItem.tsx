'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MoreHorizontal } from 'lucide-react';
import { Notification } from './types';
import { NotificationService } from './NotificationService';
import { 
  Popover, 
  PopoverTrigger, 
  PopoverContent 
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { translateNotification } from '@/utils/notificationTranslations';

interface NotificationItemProps {
  notification: Notification;
  onUpdate: () => void;
}

/**
 * Componente que muestra una notificación individual
 */
export const NotificationItem = ({ notification, onUpdate }: NotificationItemProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Procesar notificación usando el sistema de traducciones
  const processedNotification = useMemo(() => {
    const translated = translateNotification(notification.payload);
    
    return {
      title: translated.title,
      message: translated.message,
      category: translated.category,
      icon: translated.icon
    };
  }, [notification.payload]);

  const markAsRead = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    
    if (notification.read_at === null) {
      const success = await NotificationService.markAsRead(notification.id);
      if (success) {
        onUpdate();
      }
    }
  };

  // Función para formatear la fecha
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'dd MMM, HH:mm', { locale: es });
  };

  return (
    <div 
      className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
        !notification.read_at ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
      onClick={markAsRead}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 mr-2">
          <p className="text-sm font-medium">{processedNotification.title}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(notification.created_at)}
          </span>
          <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <PopoverTrigger asChild>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPopoverOpen(true);
                }}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <MoreHorizontal className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-t-md">
                <h4 className="font-medium">{processedNotification.title}</h4>
                <div className="flex justify-between items-center mt-1">
                  <Badge variant="outline" className="text-xs">
                    {processedNotification.category}
                  </Badge>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(notification.created_at)}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <div className="text-sm whitespace-pre-wrap">
                  {processedNotification.message}
                </div>
                
                {/* Mostrar datos adicionales si existen en el payload */}
                {Object.entries(notification.payload)
                  .filter(([key]) => !['type', 'title', 'content'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        {key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' ')}
                      </h5>
                      <p className="text-sm">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
                    </div>
                  ))
                }
              </div>
              <div className="p-2 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                <button
                  onClick={(e) => {
                    markAsRead(e);
                    setIsPopoverOpen(false);
                  }}
                  className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/30 rounded"
                >
                  {notification.read_at === null ? "Marcar como leída" : "Leída"}
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <p className="text-xs mt-1 text-gray-600 dark:text-gray-300 line-clamp-2">
        {processedNotification.message}
      </p>
      {!notification.read_at && (
        <div className="mt-1 flex justify-end">
          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
        </div>
      )}
    </div>
  );
};
