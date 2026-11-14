'use client';

/**
 * Tarjeta de una llave de API del chat. Textos en `chatConfig.llaves`
 * (es/en/fr/pt), fechas relativas en el idioma de quien la ve (next-intl) y
 * colores por tokens.
 */
import { MoreVertical, RotateCcw, Ban, Copy, Check, Clock, Shield } from 'lucide-react';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import type { ChannelApiKey } from '@/lib/services/inboxConfigService';

interface ApiKeyCardProps {
  apiKey: ChannelApiKey;
  onRevoke: (key: ChannelApiKey) => void;
  onRotate: (key: ChannelApiKey) => void;
}

export default function ApiKeyCard({ apiKey, onRevoke, onRotate }: ApiKeyCardProps) {
  const t = useTranslations('chatConfig.llaves');
  const tc = useTranslations('chatConfig.comun');
  const formato = useFormatter();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopyPrefix = async () => {
    await navigator.clipboard.writeText(apiKey.key_prefix + '...');
    setCopied(true);
    toast({ title: tc('copiado'), description: t('prefijoCopiado') });
    setTimeout(() => setCopied(false), 2000);
  };

  const ahora = new Date();
  const isExpired = !!apiKey.expires_at && new Date(apiKey.expires_at) < ahora;
  const isRevoked = !!apiKey.revoked_at;
  const relativa = (valor: string) => formato.relativeTime(new Date(valor), ahora);

  return (
    <div className={`rounded-lg border bg-surface p-4 ${!apiKey.is_active || isExpired || isRevoked ? 'border-line-strong opacity-75' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium text-fg">{apiKey.name}</h3>
            {apiKey.is_active && !isExpired && !isRevoked ? (
              <Badge tono="exito" tamano="sm">{t('activa')}</Badge>
            ) : isRevoked ? (
              <Badge tono="peligro" tamano="sm">{t('revocada')}</Badge>
            ) : isExpired ? (
              <Badge tono="advertencia" tamano="sm">{t('expirada')}</Badge>
            ) : (
              <Badge tono="neutro" tamano="sm">{t('inactiva')}</Badge>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-subtle px-2 py-1 font-mono text-sm text-fg-secondary">{apiKey.key_prefix}...</code>
            <Button variant="ghost" size="sm" onClick={handleCopyPrefix} className="h-7 w-7 p-0" aria-label={t('copiarPrefijo')} title={t('copiarPrefijo')}>
              {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-success-text" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {apiKey.channel && (
            <p className="mt-2 text-sm text-fg-muted">{t('canal', { nombre: apiKey.channel.name, tipo: apiKey.channel.type })}</p>
          )}
        </div>

        {apiKey.is_active && !isRevoked && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={tc('masAcciones', { nombre: apiKey.name })}>
                <MoreVertical aria-hidden="true" className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRotate(apiKey)}>
                <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />
                {t('rotar')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRevoke(apiKey)} className="text-danger-text">
                <Ban aria-hidden="true" className="mr-2 h-4 w-4" />
                {t('revocar')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {apiKey.scopes && apiKey.scopes.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-1 text-xs text-fg-muted">
            <Shield aria-hidden="true" className="h-3 w-3" />
            {t('permisos')}
          </div>
          <div className="flex flex-wrap gap-1">
            {apiKey.scopes.map((scope) => (
              <span key={scope} className="rounded bg-brand-tint px-2 py-0.5 text-xs text-brand">
                {scope}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3 text-xs text-fg-muted">
        <div className="flex items-center gap-1">
          <Clock aria-hidden="true" className="h-3 w-3" />
          <span>{t('creada', { cuando: relativa(apiKey.created_at) })}</span>
        </div>
        {apiKey.last_used_at && <div>{t('ultimoUso', { cuando: relativa(apiKey.last_used_at) })}</div>}
        {apiKey.expires_at && (
          <div className={isExpired ? 'text-danger-text' : ''}>
            {t(isExpired ? 'expiro' : 'expira', { cuando: relativa(apiKey.expires_at) })}
          </div>
        )}
      </div>
    </div>
  );
}
