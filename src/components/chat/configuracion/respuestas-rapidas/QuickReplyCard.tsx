'use client';

/** Tarjeta de una respuesta rápida. Textos en `chatConfig` (es/en/fr/pt), colores por tokens. */
import { MoreVertical, Edit, Trash2, Copy, Hash, Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('chatConfig.respuestas');
  const tc = useTranslations('chatConfig.comun');
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reply.content);
    toast({ title: tc('copiado'), description: t('copiadoDesc') });
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-fg">{reply.title}</h3>
            {!reply.is_active && (
              <Badge tono="neutro" tamano="sm">
                {t('inactiva')}
              </Badge>
            )}
          </div>
          {reply.shortcut && (
            <div className="mt-1 flex items-center gap-1 text-sm text-brand">
              <Hash aria-hidden="true" className="h-3 w-3" />
              <span className="font-mono">{reply.shortcut}</span>
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={tc('masAcciones', { nombre: reply.title })}>
              <MoreVertical aria-hidden="true" className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopy}>
              <Copy aria-hidden="true" className="mr-2 h-4 w-4" />
              {t('copiar')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(reply)}>
              <Edit aria-hidden="true" className="mr-2 h-4 w-4" />
              {tc('editar')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(reply)} className="text-danger-text">
              <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
              {tc('eliminar')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mt-3 line-clamp-3 text-sm text-fg-secondary">{reply.content}</p>

      {reply.tags && reply.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {reply.tags.map((tag, index) => (
            <span key={index} className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-xs text-fg-secondary">
              <Tag aria-hidden="true" className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-fg-muted">
        <span>{t('usos', { n: reply.usage_count || 0 })}</span>
      </div>
    </div>
  );
}
