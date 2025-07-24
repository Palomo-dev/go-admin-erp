'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { 
  ExternalLink, 
  Paperclip, 
  Clock,
  User,
  Building2,
  Target
} from 'lucide-react';
import { cn, formatDate } from '@/utils/Utils';
import type { Activity } from '@/types/activity';
import { ACTIVITY_TYPE_CONFIG } from '@/types/activity';
import { ActividadIcon } from './ActividadIcon';
import { ActividadModal } from './ActividadModal';

interface ActividadItemProps {
  activity: Activity;
  isLast?: boolean;
  onOpenContext?: (activity: Activity) => void;
  className?: string;
}

export function ActividadItem({ 
  activity, 
  isLast = false,
  onOpenContext,
  className 
}: ActividadItemProps) {
  const [showModal, setShowModal] = useState(false);
  
  const config = ACTIVITY_TYPE_CONFIG[activity.activity_type];
  const hasAttachments = activity.metadata?.attachments?.length ? activity.metadata.attachments.length > 0 : false;
  const hasLinks = activity.metadata?.links?.length ? activity.metadata.links.length > 0 : false;

  const formatActivityDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      const minutes = Math.floor(diffInHours * 60);
      return `hace ${minutes} min`;
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours);
      return `hace ${hours}h`;
    } else if (diffInHours < 48) {
      return 'ayer';
    } else {
      return formatDate(date);
    }
  };

  const getContextUrl = () => {
    if (!activity.related_type || !activity.related_id) return null;
    
    switch (activity.related_type) {
      case 'customer':
        return `/app/clientes/${activity.related_id}`;
      case 'opportunity':
        return `/app/crm/pipeline?opportunity=${activity.related_id}`;
      case 'task':
        return `/app/crm/tareas?task=${activity.related_id}`;
      default:
        return null;
    }
  };

  const contextUrl = getContextUrl();

  return (
    <>
      <div className={cn(
        "p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
        !isLast && "border-b border-gray-200 dark:border-gray-700",
        className
      )}>
        <div className="flex items-start gap-4">
          {/* Icono de actividad */}
          <div className="flex-shrink-0 mt-1">
            <ActividadIcon 
              type={activity.activity_type}
              className="w-8 h-8"
            />
          </div>

          {/* Contenido principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Header con tipo y fecha */}
                <div className="flex items-center gap-2 mb-2">
                  <Badge 
                    variant="secondary"
                    className={cn("text-xs", config.color)}
                  >
                    {config.label}
                  </Badge>
                  
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="h-3 w-3" />
                    {formatActivityDate(activity.occurred_at)}
                  </div>
                </div>

                {/* Notas/Resumen */}
                {activity.notes && (
                  <p className="text-sm text-gray-900 dark:text-white mb-3 line-clamp-2">
                    {activity.notes}
                  </p>
                )}

                {/* Información adicional */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  {/* Usuario */}
                  {activity.user_name && (
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{activity.user_name}</span>
                    </div>
                  )}

                  {/* Entidad relacionada */}
                  {activity.related_entity_name && (
                    <div className="flex items-center gap-1">
                      {activity.related_type === 'customer' && <Building2 className="h-3 w-3" />}
                      {activity.related_type === 'opportunity' && <Target className="h-3 w-3" />}
                      <span>{activity.related_entity_name}</span>
                    </div>
                  )}

                  {/* Adjuntos */}
                  {hasAttachments && (
                    <div className="flex items-center gap-1">
                      <Paperclip className="h-3 w-3" />
                      <span>{activity.metadata.attachments?.length} adjunto(s)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Enlaces */}
                {hasLinks && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowModal(true)}
                    className="h-8 w-8 p-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}

                {/* Ver más (antes Contexto) */}
                {contextUrl && onOpenContext && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenContext(activity)}
                    className="text-xs"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Ver más
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de detalles */}
      {showModal && (
        <ActividadModal
          activity={activity}
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onOpenContext={onOpenContext}
        />
      )}
    </>
  );
}
