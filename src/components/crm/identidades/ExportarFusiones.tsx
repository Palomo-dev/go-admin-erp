'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { clasesBoton } from '@/components/kit/botonClases';

export function ExportarFusiones({ disabled }: { disabled: boolean }) {
  const locale = useLocale();
  const t = useTranslations('crm.identidades');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    let url: string | null = null;
    try {
      const response = await fetch(`/api/crm/customer-merges/export?${new URLSearchParams({ locale })}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('export_failed');
      url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'historial-fusiones.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError(true);
    } finally {
      if (url) URL.revokeObjectURL(url);
      setBusy(false);
    }
  };
  return <div className="flex flex-col gap-1">
    <button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario' })} disabled={disabled || busy} onClick={() => void download()}>
      <Download className="size-4" aria-hidden="true" />{t(busy ? 'exportando' : 'exportar')}
    </button>
    {error && <span role="alert" className="max-w-64 text-xs text-danger-text">{t('errorExportar')}</span>}
  </div>;
}
