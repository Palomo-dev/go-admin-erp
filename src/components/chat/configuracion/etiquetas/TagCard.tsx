'use client';

import { MoreVertical, Edit, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ConversationTag } from '@/lib/services/inboxConfigService';

interface TagCardProps {
  tag: ConversationTag;
  onEdit: (tag: ConversationTag) => void;
  onDelete: (tag: ConversationTag) => void;
}

export default function TagCard({ tag, onEdit, onDelete }: TagCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: tag.color }}
          />
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              {tag.name}
            </h3>
            {tag.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {tag.description}
              </p>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(tag)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(tag)}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <MessageSquare className="h-4 w-4" />
        <span>
          {tag.usage_count || 0} conversación{(tag.usage_count || 0) !== 1 ? 'es' : ''}
        </span>
      </div>
    </div>
  );
}
