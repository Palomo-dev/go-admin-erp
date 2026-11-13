'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Clock, RotateCcw, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clasesBoton } from '@/components/kit';
import { SelectorAgente } from './SelectorAgente';
import { EtiquetasConversacion } from './EtiquetasConversacion';
import type { ConversacionControl } from '../useConversacion';

const ESTADOS = ['open', 'pending', 'closed'] as const;
const PRIORIDADES = ['low', 'normal', 'high', 'urgent'] as const;

/** Pestaña «Acciones» (Figma 91-chat-02 y 91-chat-16): estado, prioridad, asignación y etiquetas. */
export function PestanaAcciones({ c, conFicha = false }: { c: ConversacionControl; conFicha?: boolean }) {
  const t = useTranslations('chatBandeja.acciones');
  const te = useTranslations('chatUi.estado');
  const tp = useTranslations('chatUi.prioridad');
  const d = c.detalle;
  if (!d) return null;
  const cerrada = d.status === 'closed' || (d.status as string) === 'archived';

  return (
    <div className="space-y-5 p-4">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-fg-secondary">{t('estadoYPrioridad')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5 text-sm font-medium text-fg">
            <span className="block">{t('estado')}</span>
            <Select value={d.status} onValueChange={(v) => void c.cambiarEstado(v as (typeof ESTADOS)[number])}>
              <SelectTrigger aria-label={t('estado')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {te(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm font-medium text-fg">
            <span className="block">{t('prioridad')}</span>
            <Select value={d.priority ?? 'normal'} onValueChange={(v) => void c.cambiarPrioridad(v)}>
              <SelectTrigger aria-label={t('prioridad')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {tp(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold text-fg-secondary">{t('asignadoA')}</h3>
        <SelectorAgente agentes={c.agentes} asignado={d.assigned_member_id} onAsignar={c.asignar} />
        <p className="text-xs text-fg-muted">{t('ayudaAsignar')}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-fg-secondary">{t('etiquetas')}</h3>
        <EtiquetasConversacion
          actuales={d.tags ?? []}
          disponibles={c.etiquetas}
          onAgregar={(id) => void c.agregarEtiqueta(id)}
          onQuitar={(id) => void c.quitarEtiqueta(id)}
        />
      </section>

      <div className="space-y-2">
        {cerrada ? (
          <button type="button" onClick={() => void c.cambiarEstado('open')} className={clasesBoton({ anchoCompleto: true })}>
            <RotateCcw aria-hidden="true" className="size-4" />
            {t('reabrir')}
          </button>
        ) : (
          <button type="button" onClick={() => void c.cambiarEstado('closed')} className={clasesBoton({ anchoCompleto: true })}>
            <Check aria-hidden="true" className="size-4" />
            {t('resolver')}
          </button>
        )}
        {d.status === 'open' ? (
          <button type="button" onClick={() => void c.cambiarEstado('pending')} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
            <Clock aria-hidden="true" className="size-4" />
            {t('pendiente')}
          </button>
        ) : null}
        {conFicha ? (
          <Link href={`/app/clientes/${d.customer_id}`} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
            <User aria-hidden="true" className="size-4" />
            {t('abrirFicha')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
