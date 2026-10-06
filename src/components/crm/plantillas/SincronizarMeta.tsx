'use client';

/**
 * Botón «Sincronizar con Meta» del `PageHeader` de Plantillas → WhatsApp, con
 * estados honestos: sin canal activo, sin permiso (solo admin) y error del
 * proveedor con el mensaje que devolvió Meta/Twilio. Al terminar avisa a la
 * pestaña (`EVENTO_PLANTILLAS_SINCRONIZADAS`) para que recargue la lista.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { clasesBoton } from '@/components/kit/botonClases';
import { waApi, ApiError } from '@/components/crm/whatsapp/api';
import { EVENTO_PLANTILLAS_SINCRONIZADAS, errorSincronizacion, estadoSincronizacion } from './sincronizacionMetaLogica';

export function SincronizarMeta() {
  const t = useTranslations('crm.plantillas.sincronizar');
  const [datos, setDatos] = useState<{ canales: { status: string }[]; puedeGestionar: boolean } | null>(null);
  const [fallo, setFallo] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    let vivo = true;
    waApi
      .channels()
      .then((r) => vivo && setDatos({ canales: r.data, puedeGestionar: r.can_manage === true }))
      .catch(() => vivo && setFallo(true));
    return () => {
      vivo = false;
    };
  }, []);

  const estado = fallo ? 'lista' : estadoSincronizacion(datos);
  const motivo = estado === 'sinCanal' ? t('sinCanal') : estado === 'sinPermiso' ? t('sinPermiso') : undefined;

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await waApi.syncTemplates();
      toast({ title: t('ok'), description: t('resumen', { nuevas: r.created, actualizadas: r.updated, total: r.total }) });
      window.dispatchEvent(new Event(EVENTO_PLANTILLAS_SINCRONIZADAS));
    } catch (e) {
      const tipo = errorSincronizacion(e instanceof ApiError ? e : null);
      toast({ title: t(`errores.${tipo}`), description: tipo === 'proveedor' && e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        className={clasesBoton({ variante: 'secundario' })}
        onClick={() => void sincronizar()}
        disabled={sincronizando || estado !== 'lista'}
        aria-describedby={motivo ? 'sincronizar-meta-motivo' : undefined}
      >
        {sincronizando || estado === 'cargando' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />}
        {sincronizando ? t('sincronizando') : t('boton')}
      </button>
      {motivo && (
        <span id="sincronizar-meta-motivo" className="text-xs text-fg-secondary">
          {motivo}
        </span>
      )}
    </span>
  );
}
