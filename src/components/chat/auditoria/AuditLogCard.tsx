'use client';

import { Eye, User, Bot, Globe, Terminal, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import ChatAuditService, { type AuditLog } from '@/lib/services/chatAuditService';

interface AuditLogCardProps {
  log: AuditLog;
  onViewDetails: (log: AuditLog) => void;
}

const ActorIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'member':
      return <User className="h-4 w-4" />;
    case 'system':
      return <Terminal className="h-4 w-4" />;
    case 'ai':
      return <Bot className="h-4 w-4" />;
    case 'api':
      return <Globe className="h-4 w-4" />;
    default:
      return <User className="h-4 w-4" />;
  }
};

const getActionColor = (action: string): string => {
  if (action.includes('create')) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (action.includes('update')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  if (action.includes('delete')) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (action.includes('revoke') || action.includes('block')) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
};

export default function AuditLogCard({ log, onViewDetails }: AuditLogCardProps) {
  const service = new ChatAuditService(log.organization_id);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={getActionColor(log.action)}>
              {service.getActionLabel(log.action)}
            </Badge>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              en {service.getEntityLabel(log.entity_type)}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <ActorIcon type={log.actor_type} />
              <span>{service.getActorLabel(log.actor_type)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span title={format(new Date(log.created_at), "d 'de' MMMM, yyyy HH:mm:ss", { locale: es })}>
                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: es })}
              </span>
            </div>
          </div>

          {log.entity_id && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
              ID: {log.entity_id.substring(0, 8)}...
            </p>
          )}

          {log.changes && Object.keys(log.changes).length > 0 && (
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="text-gray-500">Cambios: </span>
              {Object.keys(log.changes).slice(0, 3).join(', ')}
              {Object.keys(log.changes).length > 3 && '...'}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewDetails(log)}
          className="text-gray-500"
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>

      {log.ip_address && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
          IP: {log.ip_address}
        </div>
      )}
    </div>
  );
}
