'use client';

/**
 * Crear una llave de API del chat y mostrarla una sola vez. Textos en
 * `chatConfig.llaves` (es/en/fr/pt) y colores por tokens.
 */
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import { API_SCOPES, type Channel } from '@/lib/services/inboxConfigService';

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: Channel[];
  onSave: (data: { name: string; channel_id?: string; scopes: string[]; expires_at?: string }) => Promise<{ rawKey: string } | void>;
}

/** Vigencias que se ofrecen (días; `never` = sin vencimiento). */
const EXPIRACIONES = ['never', '30', '90', '180', '365'] as const;

export default function ApiKeyDialog({ open, onOpenChange, channels, onSave }: ApiKeyDialogProps) {
  const t = useTranslations('chatConfig.llaves');
  const tc = useTranslations('chatConfig.comun');
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState<string>('all');
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresIn, setExpiresIn] = useState<string>('never');
  const [saving, setSaving] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setChannelId('all');
      setScopes([]);
      setExpiresIn('never');
      setGeneratedKey(null);
    }
  }, [open]);

  const handleSave = async () => {
    if (!name.trim() || scopes.length === 0) return;

    setSaving(true);
    try {
      let expiresAt: string | undefined;
      if (expiresIn !== 'never') {
        const days = parseInt(expiresIn);
        const date = new Date();
        date.setDate(date.getDate() + days);
        expiresAt = date.toISOString();
      }

      const result = await onSave({
        name: name.trim(),
        channel_id: channelId || undefined,
        scopes,
        expires_at: expiresAt
      });

      if (result && 'rawKey' in result) {
        setGeneratedKey(result.rawKey);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopyKey = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleScope = (scope: string) => {
    setScopes(scopes.includes(scope) ? scopes.filter((s) => s !== scope) : [...scopes, scope]);
  };

  const handleClose = () => {
    if (generatedKey) setGeneratedKey(null);
    onOpenChange(false);
  };

  /** Nombre y descripción del permiso en el idioma de quien edita (`messages:read` → `messages_read`). */
  const textoScope = (valor: string, campo: 'nombre' | 'descripcion', respaldo: string) => {
    const clave = `scopes.${valor.replace(':', '_')}.${campo}`;
    return t.has(clave) ? t(clave) : respaldo;
  };

  if (generatedKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('dialogo.creadaTitulo')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div role="alert" className="rounded-lg border border-line-warning bg-warning-subtle p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning-text" />
                <div>
                  <p className="text-sm font-medium text-warning-text">{t('dialogo.guardaAhora')}</p>
                  <p className="mt-1 text-sm text-fg-secondary">{t('dialogo.unicaVez')}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('dialogo.tuLlave')}</Label>
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-subtle p-3 font-mono text-sm text-fg">{generatedKey}</code>
                <Button variant="outline" size="icon" onClick={handleCopyKey} className="flex-shrink-0" aria-label={t('dialogo.copiarLlave')} title={t('dialogo.copiarLlave')}>
                  {copied ? <Check aria-hidden="true" className="h-4 w-4 text-success-text" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>{t('dialogo.entendido')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[500px] md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('dialogo.nuevaTitulo')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="llave-nombre">{t('dialogo.nombre')}</Label>
            <Input
              id="llave-nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('dialogo.nombrePlaceholder')}
              className="bg-surface"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="llave-canal">{t('dialogo.canal')}</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger id="llave-canal" aria-describedby="llave-canal-ayuda" className="bg-surface">
                <SelectValue placeholder={t('dialogo.todosCanales')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dialogo.todosCanales')}</SelectItem>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.name} ({ch.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="llave-canal-ayuda" className="text-xs text-fg-muted">{t('dialogo.canalAyuda')}</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">{t('dialogo.permisos')}</legend>
            <div className="max-h-[200px] space-y-2 overflow-y-auto rounded-lg bg-subtle p-3">
              {API_SCOPES.map((scope) => (
                <div key={scope.value} className="flex items-start gap-3">
                  <Checkbox
                    id={`llave-scope-${scope.value}`}
                    checked={scopes.includes(scope.value)}
                    onCheckedChange={() => toggleScope(scope.value)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <label htmlFor={`llave-scope-${scope.value}`} className="cursor-pointer text-sm font-medium text-fg">
                      {textoScope(scope.value, 'nombre', scope.label)}
                    </label>
                    <p className="text-xs text-fg-muted">{textoScope(scope.value, 'descripcion', scope.description)}</p>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="llave-expiracion">{t('dialogo.expiracion')}</Label>
            <Select value={expiresIn} onValueChange={setExpiresIn}>
              <SelectTrigger id="llave-expiracion" className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRACIONES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {t(`dialogo.expiraciones.${v === 'never' ? 'never' : `d${v}`}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tc('cancelar')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || scopes.length === 0 || saving}>
            {saving ? (
              <>
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                {t('dialogo.generando')}
              </>
            ) : (
              t('dialogo.crear')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
