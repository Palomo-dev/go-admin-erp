'use client';

/**
 * Diálogo de credenciales por proveedor. Inputs `type=password`; nunca muestra
 * valores existentes (solo "••••" si la clave ya está guardada). Enviar un
 * campo vacío conserva la clave actual; "Borrar" la elimina.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { CREDENTIAL_FIELDS, PROVIDER_LABELS, type CredentialField, type ProviderCategory } from '@/lib/crm/providerCatalog';

export interface ProviderCredentialFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: ProviderCategory;
  provider: string;
  /** Claves ya guardadas (sin valores). */
  existingKeys: string[];
  onSubmit: (creds: Record<string, string | null>) => Promise<void>;
}

export function ProviderCredentialForm({ open, onOpenChange, category, provider, existingKeys, onSubmit }: ProviderCredentialFormProps) {
  const t = useTranslations('configuracionTextos.providerCredentialForm');
  // Las etiquetas en español del catálogo se traducen aquí; las técnicas (API Key, SID…) quedan igual.
  const etiquetaCampo = (f: CredentialField) => (t.has(`campos.${f.key}`) ? t(`campos.${f.key}`) : f.label);
  const fields = useMemo(() => CREDENTIAL_FIELDS[provider] ?? [], [provider]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [clear, setClear] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues({});
      setClear({});
      setError(null);
    }
  }, [open, provider]);

  const missingRequired = fields.filter((f) => f.required && !existingKeys.includes(f.key) && !values[f.key]?.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missingRequired.length > 0) {
      setError(t('faltanObligatorios', { campos: missingRequired.map(etiquetaCampo).join(', ') }));
      return;
    }
    const payload: Record<string, string | null> = {};
    for (const f of fields) {
      if (clear[f.key]) payload[f.key] = null;
      else if (values[f.key]?.trim()) payload[f.key] = values[f.key].trim();
    }
    if (Object.keys(payload).length === 0) {
      setError(t('sinCambios'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorGuardar'));
    } finally {
      setSaving(false);
    }
  };

  const descId = `cred-form-desc-${category}-${provider}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby={descId}>
        <DialogHeader>
          <DialogTitle>{t('titulo', { proveedor: PROVIDER_LABELS[provider] ?? provider })}</DialogTitle>
          <DialogDescription id={descId}>
            {t('descripcion')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {fields.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('sinCredenciales')}</p>
          )}
          {fields.map((f) => {
            const saved = existingKeys.includes(f.key);
            const inputId = `cred-${category}-${provider}-${f.key}`;
            const hintId = `${inputId}-hint`;
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={inputId} className="text-gray-900 dark:text-gray-100">
                    {etiquetaCampo(f)}
                    {f.required && <span className="ml-1 text-red-600 dark:text-red-400" aria-hidden="true">*</span>}
                  </Label>
                  {saved && (
                    <button
                      type="button"
                      onClick={() => setClear((c) => ({ ...c, [f.key]: !c[f.key] }))}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                      aria-pressed={!!clear[f.key]}
                    >
                      {clear[f.key] ? t('noBorrar') : t('borrar')}
                    </button>
                  )}
                </div>
                <Input
                  id={inputId}
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  disabled={!!clear[f.key]}
                  placeholder={saved ? t('placeholderGuardada') : f.placeholder ?? ''}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  aria-describedby={hintId}
                  aria-required={f.required && !saved}
                  className="font-mono text-sm"
                />
                <p id={hintId} className="text-xs text-gray-500 dark:text-gray-400">
                  {clear[f.key]
                    ? t('pista.seEliminara')
                    : saved
                      ? t('pista.yaGuardada')
                      : t('pista.sinClavePropia')}
                </p>
              </div>
            );
          })}
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t('cancelar')}
            </Button>
            <Button type="submit" disabled={saving || fields.length === 0} aria-busy={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('guardar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
