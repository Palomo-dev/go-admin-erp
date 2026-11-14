'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Clock, RotateCcw, User, UserCheck, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clasesBoton } from '@/components/kit';
import { SelectorAgente } from './SelectorAgente';
import { EtiquetasConversacion } from './EtiquetasConversacion';
import { DialogoBloquearContacto } from '../DialogoBloquearContacto';
import type { ConversacionControl } from '../useConversacion';

const ESTADOS = ['open', 'pending', 'closed'] as const;
const PRIORIDADES = ['low', 'normal', 'high', 'urgent'] as const;

/**
 * Pestaña «Acciones» (Figma 91-chat-02 y 91-chat-16): estado, prioridad,
 * asignación y etiquetas. En la hoja del celular (`conFicha`) también «Abrir
 * ficha» y «Bloquear / Desbloquear contacto», que allí no tienen menú ⋯.
 */
export function PestanaAcciones({ c, conFicha = false }: { c: ConversacionControl; conFicha?: boolean }) {
  const t = useTranslations('chatBandeja.acciones');
  const tb = useTranslations('chatBandejaPendientes.bloqueo');
  const [confirmarBloqueo, setConfirmarBloqueo] = React.useState(false);
  const te = useTranslations('chatUi.estado');
  const tp = useTranslations('chatUi.prioridad');
  const d = c.detalle;
  if (!d) return null;
  const cerrada = d.status === 'closed' || (d.status as string) === 'archived';
  const movil = conFicha;
  const tamano = movil ? 'lg' : 'md';
  const icono = movil ? 'size-5' : 'size-4';

  return (
    <div className={movil ? 'space-y-4 p-4' : 'space-y-5 p-4'}>
      <section className="space-y-3">
        {/* Hoja del celular (Figma 91-chat-16 y 94-chat-recuperado-14/15): sin títulos de sección ni ayudas. */}
        {movil ? null : <h3 className="text-xs font-semibold text-fg-secondary">{t('estadoYPrioridad')}</h3>}
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
        <h3 className={movil ? 'text-sm font-medium text-fg' : 'text-xs font-semibold text-fg-secondary'}>{t('asignadoA')}</h3>
        <SelectorAgente agentes={c.agentes} asignado={d.assigned_member_id} onAsignar={c.asignar} />
        {movil ? null : <p className="text-xs text-fg-muted">{t('ayudaAsignar')}</p>}
      </section>

      <section className="space-y-2">
        <h3 className={movil ? 'text-sm font-medium text-fg' : 'text-xs font-semibold text-fg-secondary'}>{t('etiquetas')}</h3>
        <EtiquetasConversacion
          actuales={d.tags ?? []}
          disponibles={c.etiquetas}
          onAgregar={(id) => void c.agregarEtiqueta(id)}
          onQuitar={(id) => void c.quitarEtiqueta(id)}
        />
      </section>

      <div className={movil ? 'space-y-3 pt-1' : 'space-y-2'}>
        {cerrada ? (
          <button type="button" onClick={() => void c.cambiarEstado('open')} className={clasesBoton({ anchoCompleto: true, tamano })}>
            <RotateCcw aria-hidden="true" className={icono} />
            {t('reabrir')}
          </button>
        ) : (
          <button type="button" onClick={() => void c.cambiarEstado('closed')} className={clasesBoton({ anchoCompleto: true, tamano })}>
            <Check aria-hidden="true" className={icono} />
            {t('resolver')}
          </button>
        )}
        {/* En el celular «Pendiente» se elige en el selector de Estado. */}
        {d.status === 'open' && !movil ? (
          <button type="button" onClick={() => void c.cambiarEstado('pending')} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
            <Clock aria-hidden="true" className={icono} />
            {t('pendiente')}
          </button>
        ) : null}
        {conFicha ? (
          <Link href={`/app/clientes/${d.customer_id}`} className={clasesBoton({ variante: 'secundario', anchoCompleto: true, tamano })}>
            <User aria-hidden="true" className={icono} />
            {t('abrirFicha')}
          </Link>
        ) : null}
        {conFicha ? (
          c.bloqueo ? (
            <button type="button" onClick={() => void c.desbloquearContacto()} className={clasesBoton({ variante: 'secundario', anchoCompleto: true, tamano })}>
              <UserCheck aria-hidden="true" className={icono} />
              {tb('menuDesbloquear')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmarBloqueo(true)}
              className={clasesBoton({ variante: 'secundario', anchoCompleto: true, tamano, className: 'text-danger-text' })}
            >
              <UserX aria-hidden="true" className={icono} />
              {tb('menuBloquear')}
            </button>
          )
        ) : null}
      </div>
      {conFicha ? <DialogoBloquearContacto c={c} abierto={confirmarBloqueo} onAbiertoChange={setConfirmarBloqueo} /> : null}
    </div>
  );
}
