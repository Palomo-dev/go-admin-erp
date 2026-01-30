'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Bot, Globe, Terminal, Clock, Hash, FileJson } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ChatAuditService, { type AuditLog } from '@/lib/services/chatAuditService';

interface AuditDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: AuditLog | null;
}

const ActorIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'member':
      return <User className="h-5 w-5" />;
    case 'system':
      return <Terminal className="h-5 w-5" />;
    case 'ai':
      return <Bot className="h-5 w-5" />;
    case 'api':
      return <Globe className="h-5 w-5" />;
    default:
      return <User className="h-5 w-5" />;
  }
};

const getActionColor = (action: string): string => {
  if (action.includes('create')) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (action.includes('update')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  if (action.includes('delete')) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (action.includes('revoke') || action.includes('block')) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
};

export default function AuditDetailDialog({
  open,
  onOpenChange,
  log
}: AuditDetailDialogProps) {
  if (!log) return null;

  const service = new ChatAuditService(log.organization_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <ActorIcon type={log.actor_type} />
            Detalle de Auditoría
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <Badge className={getActionColor(log.action)}>
              {service.getActionLabel(log.action)}
            </Badge>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {format(new Date(log.created_at), "d 'de' MMMM, yyyy HH:mm:ss", { locale: es })}
            </span>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Tipo de Actor</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1 flex items-center gap-2">
                <ActorIcon type={log.actor_type} />
                {service.getActorLabel(log.actor_type)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Tipo de Entidad</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                {service.getEntityLabel(log.entity_type)}
              </p>
            </div>
            {log.actor_id && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">ID del Actor</p>
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded mt-1 inline-block">
                  {log.actor_id}
                </code>
              </div>
            )}
            {log.entity_id && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">ID de Entidad</p>
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded mt-1 inline-block">
                  {log.entity_id}
                </code>
              </div>
            )}
          </div>

          <Separator />

          {log.changes && Object.keys(log.changes).length > 0 && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-2">
                <FileJson className="h-4 w-4" /> Cambios Realizados
              </p>
              <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto max-h-[200px]">
                {JSON.stringify(log.changes, null, 2)}
              </pre>
            </div>
          )}

          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-2">
                <Hash className="h-4 w-4" /> Metadata
              </p>
              <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto max-h-[150px]">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            {log.ip_address && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Dirección IP</p>
                <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded mt-1 inline-block">
                  {log.ip_address}
                </code>
              </div>
            )}

            {log.user_agent && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">User Agent</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded break-all">
                  {log.user_agent}
                </p>
              </div>
            )}
          </div>

          <Separator />

          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Clock className="h-4 w-4" />
            <span>Registro ID: {log.id}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
