'use client';

import { MoreVertical, Edit, Trash2, Copy, Hash, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import type { QuickReply } from '@/lib/services/inboxConfigService';

interface QuickReplyCardProps {
  reply: QuickReply;
  onEdit: (reply: QuickReply) => void;
  onDelete: (reply: QuickReply) => void;
}

export default function QuickReplyCard({ reply, onEdit, onDelete }: QuickReplyCardProps) {
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reply.content);
    toast({
      title: 'Copiado',
      description: 'El contenido se copió al portapapeles'
    });
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 dark:text-white truncate">
              {reply.title}
            </h3>
            {!reply.is_active && (
              <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                Inactivo
              </Badge>
            )}
          </div>
          {reply.shortcut && (
            <div className="flex items-center gap-1 mt-1 text-sm text-blue-600 dark:text-blue-400">
              <Hash className="h-3 w-3" />
              <span className="font-mono">{reply.shortcut}</span>
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar contenido
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(reply)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(reply)}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
        {reply.content}
      </p>

      {reply.tags && reply.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {reply.tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Usado {reply.usage_count || 0} veces</span>
      </div>
    </div>
  );
}
