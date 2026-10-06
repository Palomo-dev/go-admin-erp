'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Bell, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import type { CanalAviso, EstadoRegistroAviso } from '@/lib/pos/pedidosWeb/avisosCliente';
import { leerAvisosPedido, reenviarAviso, type AvisoDePedido } from './avisosClienteApi';

/**
 * «Avisos en el historial del pedido» (Figma 465:85608): una línea por aviso
 * con canal, hora y estado (encolado, enviado, entregado, fallido, sin datos)
 * y «Reenviar» cuando falló o faltaba el dato. «Reenviar» vuelve a pedir el
 * aviso al servidor, nunca lo manda el navegador.
 */
const TONO: Record<EstadoRegistroAviso, string> = {
  queued: 'border-line-strong text-fg-secondary',
  sent: 'border-line-strong text-fg-secondary',
  delivered: 'border-line-success text-success-text',
  failed: 'border-line-danger text-danger-text',
  no_data: 'border-line-warning text-warning-text',
};

export function ListaAvisos({
  avisos,
  timezone,
  reenviando,
  onReenviar,
}: {
  avisos: AvisoDePedido[];
  timezone: string;
  reenviando: CanalAviso | null;
  onReenviar: (canal: CanalAviso) => void;
}) {
  const t = useTranslations('posAvisosCliente.historial');
  return (
    <ul className="space-y-3">
      {avisos.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn('rounded-full border px-2 text-[13px] font-semibold leading-6', TONO[a.status])}>
            {t('linea', {
              canal: t(`canal.${a.channel}`),
              hora: a.status === 'no_data' ? '—' : formatTimeInTz(a.created_at, timezone),
              estado: t(`estado.${a.status}`),
            })}
          </span>
          <span className="text-xs text-fg-muted">
            {t(`momento.${a.moment}`)} · {a.detail ? t.has(`detalle.${a.detail}`) ? t(`detalle.${a.detail}`) : a.detail : t(`ayuda.${a.status}`)}
          </span>
          {(a.status === 'failed' || a.status === 'no_data') && (
            <button
              type="button"
              disabled={reenviando !== null}
              onClick={() => onReenviar(a.channel)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
            >
              {reenviando === a.channel ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />}
              {t('reenviar')}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AvisosPedidoPanel({ orderId, timezone, version }: { orderId: string; timezone: string; version?: string | null }) {
  const t = useTranslations('posAvisosCliente.historial');
  const { toast } = useToast();
  const [avisos, setAvisos] = React.useState<AvisoDePedido[] | null>(null);
  const [disponible, setDisponible] = React.useState(true);
  const [reenviando, setReenviando] = React.useState<CanalAviso | null>(null);

  const cargar = React.useCallback(() => {
    leerAvisosPedido(orderId)
      .then((r) => {
        setAvisos(r.avisos);
        setDisponible(r.disponible);
      })
      .catch(() => setAvisos([]));
  }, [orderId]);
  React.useEffect(cargar, [cargar, version]);

  const reenviar = async (canal: CanalAviso) => {
    setReenviando(canal);
    try {
      await reenviarAviso(orderId, canal);
      toast({ title: t('reenviado') });
      cargar();
    } catch {
      toast({ title: t('errorReenviar'), variant: 'destructive' });
    } finally {
      setReenviando(null);
    }
  };

  if (!disponible) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell aria-hidden="true" className="size-5" strokeWidth={1.5} />
          {t('titulo')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {avisos === null ? (
          <Loader2 aria-label={t('cargando')} className="size-5 animate-spin text-fg-muted" />
        ) : avisos.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('vacio')}</p>
        ) : (
          <ListaAvisos avisos={avisos} timezone={timezone} reenviando={reenviando} onReenviar={(c) => void reenviar(c)} />
        )}
        <p className="mt-4 rounded-lg bg-subtle px-3 py-2.5 text-xs text-fg-secondary">{t('nota')}</p>
      </CardContent>
    </Card>
  );
}
