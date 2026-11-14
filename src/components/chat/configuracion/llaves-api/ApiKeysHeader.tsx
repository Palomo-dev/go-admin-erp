'use client';

/** Cabecera de Llaves de API. Textos en `chatConfig` (es/en/fr/pt), colores por tokens. */
import { Key, Plus, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface ApiKeysHeaderProps {
  totalKeys: number;
  activeKeys: number;
  loading: boolean;
  onRefresh: () => void;
  onCreate: () => void;
}

export default function ApiKeysHeader({ totalKeys, activeKeys, loading, onRefresh, onCreate }: ApiKeysHeaderProps) {
  const t = useTranslations('chatConfig.llaves');
  const tc = useTranslations('chatConfig.comun');
  return (
    <div className="border-b border-line bg-surface">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand-tint p-3">
              <Key aria-hidden="true" className="h-8 w-8 text-brand" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-fg sm:text-2xl">{t('titulo')}</h2>
              <p className="mt-1 text-sm text-fg-muted">{t('conteo', { activas: activeKeys, total: totalKeys })}</p>
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
