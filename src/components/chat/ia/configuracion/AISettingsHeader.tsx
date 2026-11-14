'use client';

/**
 * Cabecera de Configuración › Chat › IA: estado de la IA, accesos al
 * Laboratorio y a Trabajos, interruptor y actualizar. Textos en
 * `chatConfig.ia` (es/en/fr/pt) y colores por tokens.
 */
import { Bot, RefreshCw, Briefcase, FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface AISettingsHeaderProps {
  isActive: boolean;
  loading: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onViewJobs?: () => void;
  onViewLab?: () => void;
}

export default function AISettingsHeader({
  isActive,
  loading,
  onToggle,
  onRefresh,
  onViewJobs,
  onViewLab
}: AISettingsHeaderProps) {
  const t = useTranslations('chatConfig.ia');
  const tc = useTranslations('chatConfig.comun');
  return (
    <div className="border-b border-line bg-surface">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="rounded-xl bg-brand-tint p-3">
              <Bot aria-hidden="true" className="h-8 w-8 text-brand" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold text-fg sm:text-2xl">{t('titulo')}</h2>
                <Badge tono={isActive ? 'exito' : 'neutro'} tamano="sm">
                  {isActive ? t('activa') : t('inactiva')}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-fg-muted">{t('descripcion')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {onViewLab && (
              <Button variant="outline" onClick={onViewLab} className="gap-2" aria-label={t('laboratorio')}>
                <FlaskConical aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">{t('laboratorio')}</span>
              </Button>
            )}
            {onViewJobs && (
              <Button variant="outline" onClick={onViewJobs} className="gap-2" aria-label={t('trabajos')}>
                <Briefcase aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">{t('trabajos')}</span>
              </Button>
            )}
            <label className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 sm:gap-3 sm:px-4">
              <span className="text-xs font-medium text-fg-secondary sm:text-sm">
                {isActive ? t('iaActivada') : t('iaDesactivada')}
              </span>
              <Switch checked={isActive} onCheckedChange={onToggle} disabled={loading} />
            </label>
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
          </div>
        </div>
      </div>
    </div>
  );
}
