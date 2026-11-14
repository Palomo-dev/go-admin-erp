'use client';

/** Tarjeta de una etiqueta de conversación. Textos en `chatConfig` (es/en/fr/pt), colores por tokens. */
import { MoreVertical, Edit, Trash2, MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('chatConfig.etiquetas');
  const tc = useTranslations('chatConfig.comun');
  return (
    <div className="rounded-lg border border-line bg-surface p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {/* El color es el dato de la etiqueta: se pinta tal cual. */}
          <div aria-hidden="true" className="h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
          <div className="min-w-0">
            <h3 className="truncate font-medium text-fg">{tag.name}</h3>
            {tag.description && <p className="mt-1 text-sm text-fg-muted">{tag.description}</p>}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={tc('masAcciones', { nombre: tag.name })}>
              <MoreVertical aria-hidden="true" className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(tag)}>
              <Edit aria-hidden="true" className="mr-2 h-4 w-4" />
              {tc('editar')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(tag)} className="text-danger-text">
              <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
              {tc('eliminar')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
        <MessageSquare aria-hidden="true" className="h-4 w-4" />
        <span>{t('conversaciones', { n: tag.usage_count || 0 })}</span>
      </div>
    </div>
  );
}
