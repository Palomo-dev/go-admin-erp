'use client';

/** Cabecera de Etiquetas de conversación. Textos en `chatConfig` (es/en/fr/pt), colores por tokens. */
import { Tags, Plus, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface TagsHeaderProps {
  totalTags: number;
  loading: boolean;
  onRefresh: () => void;
  onCreateTag: () => void;
}

export default function TagsHeader({ totalTags, loading, onRefresh, onCreateTag }: TagsHeaderProps) {
  const t = useTranslations('chatConfig.etiquetas');
  const tc = useTranslations('chatConfig.comun');
  return (
    <div className="border-b border-line bg-surface">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand-tint p-3">
              <Tags aria-hidden="true" className="h-8 w-8 text-brand" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-fg sm:text-2xl">{t('titulo')}</h2>
              <p className="mt-1 text-sm text-fg-muted">{t('conteo', { n: totalTags })}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
            <Button onClick={onCreateTag} className="gap-2">
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t('nueva')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
