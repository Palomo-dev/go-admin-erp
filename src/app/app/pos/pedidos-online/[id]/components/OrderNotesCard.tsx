'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Loader2, Pencil } from 'lucide-react';
import { useState } from 'react';
import { clasesBoton } from '@/components/kit';
import { notasInternasVisibles } from '@/components/pos/pedidos-online/notasPedido';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderNotesCardProps {
  order: WebOrder;
  /** Comanda de cocina del pedido (`kitchen_tickets.id`), si ya salió. */
  comandaId?: number | null;
  /** Guarda la nota del equipo (`internal_notes`, con la marca del sitio intacta). */
  onGuardarNotaInterna?: (texto: string) => Promise<boolean>;
}

export function OrderNotesCard({ order, comandaId = null, onGuardarNotaInterna }: OrderNotesCardProps) {
  const t = useTranslations('pedidoWeb');
  const notasInternas = notasInternasVisibles(order.internal_notes);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(notasInternas);
  const [guardando, setGuardando] = useState(false);
  // «Para cocina» (Figma 1981:175699): las notas de línea que salen en la comanda.
  const paraCocina = (order.items ?? [])
    .filter((item) => item.notes?.trim())
    .map((item) => `${item.product_name} ${item.notes?.trim()}`);

  if (!order.customer_notes && !notasInternas && paraCocina.length === 0 && !onGuardarNotaInterna) {
    return null;
  }

  const guardar = async () => {
    if (!onGuardarNotaInterna) return;
    setGuardando(true);
    const ok = await onGuardarNotaInterna(borrador);
    setGuardando(false);
    if (ok) setEditando(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-5" aria-hidden="true" strokeWidth={1.5} />
          {t('ficha.notas')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {order.customer_notes && (
          <p className="rounded-lg bg-warning-subtle px-3 py-2.5 text-[13px] text-warning-text">
            <span className="sr-only">{t('ficha.notaCliente')}: </span>
            {order.customer_notes}
          </p>
        )}
        {paraCocina.length > 0 && (
          <p className="rounded-lg bg-subtle px-3 py-2.5 text-[13px] text-fg">
            {comandaId ? t('notas.paraCocinaComanda', { comanda: comandaId }) : t('notas.paraCocina')}: {paraCocina.join(' · ')}.
          </p>
        )}
        {(notasInternas || onGuardarNotaInterna) && (
          <div className="rounded-lg bg-subtle px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-secondary">{t('ficha.notaInterna')}</span>
              {onGuardarNotaInterna && !editando && (
                <button
                  type="button"
                  onClick={() => {
                    setBorrador(notasInternas);
                    setEditando(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Pencil className="size-4" aria-hidden="true" strokeWidth={1.5} />
                  {t('ficha.editar')}
                </button>
              )}
            </div>
            {editando ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={borrador}
                  onChange={(e) => setBorrador(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  aria-label={t('ficha.notaInterna')}
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setEditando(false)} disabled={guardando}>
                    {t('ficha.cancelar')}
                  </button>
                  <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} onClick={() => void guardar()} disabled={guardando}>
                    {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    {t('ficha.guardar')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 whitespace-pre-line text-[13px] text-fg">{notasInternas || t('ficha.sinNotaInterna')}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
