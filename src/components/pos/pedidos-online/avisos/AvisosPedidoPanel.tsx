'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/utils/Utils';
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

/** Avisos del pedido y «Reenviar» (el servidor decide y registra). */
export function useAvisosPedido(orderId: string, version?: string | null) {
  const t = useTranslations('posAvisosCliente.historial');
  const { toast } = useToast();
  const [avisos, setAvisos] = React.useState<AvisoDePedido[]>([]);
  const [reenviando, setReenviando] = React.useState<CanalAviso | null>(null);
  const cargar = React.useCallback(() => {
    leerAvisosPedido(orderId).then((r) => setAvisos(r.avisos)).catch(() => setAvisos([]));
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
  return { avisos, reenviando, reenviar };
}

/** Línea compacta bajo un paso del historial: «Correo · 12:05 · Entregado «Recibimos tu pedido»». */
export function ChipsAvisos({
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
  const t = useTranslations('posAvisosCliente');
  return (
    <ul className="space-y-1">
      {avisos.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn('rounded-full border px-1.5 text-[11px] font-medium leading-5', TONO[a.status])}>
            {t('historial.linea', {
              canal: t(`historial.canal.${a.channel}`),
              hora: a.status === 'no_data' ? '—' : formatTimeInTz(a.created_at, timezone),
              estado: t(`historial.estado.${a.status}`),
            })}
          </span>
          <span className="text-[11px] text-fg-muted">
            {a.status === 'failed' || a.status === 'no_data'
              ? a.detail && t.has(`historial.detalle.${a.detail}`) ? t(`historial.detalle.${a.detail}`) : t(`historial.ayuda.${a.status}`)
              : t(`momentos.${a.moment}.plantilla`)}
          </span>
          {(a.status === 'failed' || a.status === 'no_data') && (
            <button
              type="button"
              disabled={reenviando !== null}
              onClick={() => onReenviar(a.channel)}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
            >
              {reenviando === a.channel ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
              {t('historial.reenviar')}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
