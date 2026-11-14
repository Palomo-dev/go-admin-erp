'use client';

/** Cabecera de Respuestas rápidas. Textos en `chatConfig` (es/en/fr/pt), colores por tokens. */
import { MessageSquareText, Plus, RefreshCw, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface QuickRepliesHeaderProps {
  totalReplies: number;
  searchTerm: string;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
}

export default function QuickRepliesHeader({ totalReplies, searchTerm, loading, onSearchChange, onRefresh, onCreate }: QuickRepliesHeaderProps) {
  const t = useTranslations('chatConfig.respuestas');
  const tc = useTranslations('chatConfig.comun');
  return (
    <div className="border-b border-line bg-surface">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand-tint p-3">
              <MessageSquareText aria-hidden="true" className="h-8 w-8 text-brand" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-fg sm:text-2xl">{t('titulo')}</h2>
              <p className="mt-1 text-sm text-fg-muted">{t('conteo', { n: totalReplies })}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative flex-1 sm:flex-initial">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
              <Input
                type="search"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t('buscar')}
                aria-label={t('buscar')}
                className="w-full bg-surface pl-10 sm:w-[200px]"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              aria-label={tc('actualizar')}
              title={tc('actualizar')}
              className="flex-shrink-0"
            >
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={onCreate} className="gap-2">
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t('nueva')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
