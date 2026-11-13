'use client';

import * as React from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { agenteAsignado, type AgenteChat } from '@/lib/services/chat/agentesChat';
import { Skeleton } from '@/components/kit';
import { Burbuja, autorDeMensaje } from '@/components/chat/ui/Burbuja';
import { ContenidoMensaje, type MensajeContenido } from '@/components/chat/ui/ContenidoMensaje';
import { cn } from '@/utils/Utils';
import { elementosHilo, fechaLargaDia, relacionDia, type NotaHilo } from './hiloLogica';

const PAGINA = 30;

interface FilaMensaje extends MensajeContenido {
  id: string;
  created_at: string;
  role: string;
  direction: string;
  is_read: boolean | null;
  sender_member_id: number | null;
  metadata?: (MensajeContenido['metadata'] & { reviewed_by_member_id?: number | null }) | null;
}

export interface HiloConversacionProps {
  conversationId: string;
  notas: readonly NotaHilo[];
  agentes: readonly AgenteChat[];
  /** Canal para «Conversación iniciada desde WhatsApp». */
  nombreCanal?: string | null;
  inicioConversacion?: string | null;
  className?: string;
}

/**
 * Hilo de una conversación (Figma 91-chat-01/10/15): mensajes paginados hacia
 * arriba, en tiempo real, con las notas internas intercaladas y un separador
 * por día en la zona de la organización. Lo usan la Bandeja y la vista completa.
 */
export function HiloConversacion({ conversationId, notas, agentes, nombreCanal, inicioConversacion, className }: HiloConversacionProps) {
  const t = useTranslations('chatBandeja.hilo');
  const locale = useLocale();
  const { formatTime, timezone, getToday } = useFormatDate();
  const [mensajes, setMensajes] = React.useState<FilaMensaje[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [cargandoMas, setCargandoMas] = React.useState(false);
  const [hayMas, setHayMas] = React.useState(true);
  const [lejosDelFinal, setLejosDelFinal] = React.useState(false);
  const contenedor = React.useRef<HTMLDivElement>(null);
  const final = React.useRef<HTMLDivElement>(null);
  const tope = React.useRef<HTMLDivElement>(null);

  const alFinal = React.useCallback((comportamiento: ScrollBehavior = 'smooth') => final.current?.scrollIntoView({ behavior: comportamiento, block: 'end' }), []);

  // Carga inicial y tiempo real
  React.useEffect(() => {
    let vivo = true;
    setCargando(true);
    setMensajes([]);
    setHayMas(true);
    void supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(PAGINA)
      .then(({ data }) => {
        if (!vivo) return;
        const filas = ((data ?? []) as FilaMensaje[]).reverse();
        setMensajes(filas);
        setHayMas(filas.length >= PAGINA);
        setCargando(false);
        requestAnimationFrame(() => alFinal('auto'));
      });
    const canal = supabase
      .channel(`chat-hilo-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (p) => {
        const nuevo = p.new as FilaMensaje;
        setMensajes((prev) => (prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (p) => {
        const act = p.new as FilaMensaje;
        setMensajes((prev) => prev.map((m) => (m.id === act.id ? { ...m, ...act } : m)));
      })
      .subscribe();
    return () => {
      vivo = false;
      void supabase.removeChannel(canal);
    };
  }, [conversationId, alFinal]);

  const cargarMas = React.useCallback(async () => {
    if (cargandoMas || !hayMas || mensajes.length === 0) return;
    const caja = contenedor.current;
    const altoAntes = caja?.scrollHeight ?? 0;
    setCargandoMas(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .lt('created_at', mensajes[0].created_at)
      .order('created_at', { ascending: false })
      .limit(PAGINA);
    const viejos = ((data ?? []) as FilaMensaje[]).reverse();
    setMensajes((prev) => [...viejos.filter((v) => !prev.some((m) => m.id === v.id)), ...prev]);
    setHayMas(viejos.length >= PAGINA);
    setCargandoMas(false);
    requestAnimationFrame(() => {
      if (caja) caja.scrollTop = caja.scrollHeight - altoAntes;
    });
  }, [cargandoMas, hayMas, mensajes, conversationId]);

  React.useEffect(() => {
    const el = tope.current;
    if (!el || cargando) return;
    const obs = new IntersectionObserver((e) => e[0]?.isIntersecting && void cargarMas(), { root: contenedor.current, rootMargin: '120px 0px 0px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [cargarMas, cargando]);

  // Si el agente está cerca del final, seguir los mensajes nuevos.
  const ultimo = mensajes[mensajes.length - 1]?.id;
  React.useEffect(() => {
    if (!lejosDelFinal) alFinal();
  }, [ultimo, notas.length, lejosDelFinal, alFinal]);

  const alDesplazar = () => {
    const c = contenedor.current;
    if (c) setLejosDelFinal(c.scrollHeight - c.scrollTop - c.clientHeight > 160);
  };

  const hoy = getToday();
  const etiquetaDia = (dia: string) => {
    const fecha = fechaLargaDia(dia, locale);
    const rel = relacionDia(dia, hoy);
    return rel === 'otro' ? fecha : t(rel, { fecha });
  };

  const elementos = elementosHilo(mensajes, notas, timezone, hayMas);

  return (
    <div className={cn('relative min-h-0 flex-1', className)}>
      <div ref={contenedor} onScroll={alDesplazar} className="h-full overflow-y-auto overflow-x-hidden bg-canvas px-3 py-4 sm:px-6" aria-live="polite" aria-busy={cargando}>
        <div ref={tope} className="h-1" />
        {cargandoMas ? (
          <p className="flex items-center justify-center gap-2 py-2 text-xs text-fg-muted">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {t('cargandoAnteriores')}
          </p>
        ) : null}
        {cargando ? (
          <div className="mx-auto max-w-3xl space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={cn('flex', i % 2 ? 'justify-end' : 'justify-start')}>
                <Skeleton className={cn('h-14 rounded-xl', i % 2 ? 'w-1/2' : 'w-2/3')} />
              </div>
            ))}
          </div>
        ) : elementos.length === 0 ? (
          <p className="py-10 text-center text-sm text-fg-muted">{t('vacio')}</p>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {!hayMas && inicioConversacion ? (
              <p className="text-center text-xs text-fg-muted">
                {nombreCanal ? t('iniciadaDesde', { canal: nombreCanal, hora: formatTime(inicioConversacion) }) : t('iniciada', { hora: formatTime(inicioConversacion) })}
              </p>
            ) : null}
            {elementos.map((e) => {
              if (e.tipo === 'dia') {
                return (
                  <p key={e.clave} className="pt-2 text-center text-xs font-medium text-fg-muted">
                    {etiquetaDia(e.dia)}
                  </p>
                );
              }
              if (e.tipo === 'nota') {
                const autor = agenteAsignado(agentes, e.nota.member_id)?.nombre;
                return (
                  <Burbuja key={e.clave} autor="nota" hora={formatTime(e.nota.created_at)} detalle={autor ?? null}>
                    <span className="whitespace-pre-wrap">{e.nota.note}</span>
                  </Burbuja>
                );
              }
              const m = e.mensaje;
              const autor = autorDeMensaje(m);
              const revisor = autor === 'ia' ? agenteAsignado(agentes, m.metadata?.reviewed_by_member_id)?.nombre : null;
              return (
                <Burbuja
                  key={e.clave}
                  id={`mensaje-${m.id}`}
                  autor={autor}
                  hora={formatTime(m.created_at)}
                  entrega={autor === 'agente' || autor === 'ia' ? (m.is_read ? 'leido' : 'enviado') : null}
                  detalle={revisor ? t('revisoIa', { nombre: revisor }) : null}
                >
                  {autor === 'sistema' ? m.content : <ContenidoMensaje mensaje={m} claro={autor === 'agente'} />}
                </Burbuja>
              );
            })}
          </div>
        )}
        <div ref={final} />
      </div>
      {lejosDelFinal ? (
        <button
          type="button"
          onClick={() => alFinal()}
          aria-label={t('irAlFinal')}
          className="absolute bottom-4 right-4 flex size-10 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-md hover:bg-hover"
        >
          <ArrowDown aria-hidden="true" className="size-5" />
        </button>
      ) : null}
    </div>
  );
}
