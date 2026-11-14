'use client';

import * as React from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { agenteAsignado, type AgenteChat } from '@/lib/services/chat/agentesChat';
import { entroBloqueado, type EventoBloqueo } from '@/lib/services/chat/bloqueoContacto';
import { Skeleton } from '@/components/kit';
import { Burbuja, autorDeMensaje } from '@/components/chat/ui/Burbuja';
import { ContenidoMensaje, type MensajeContenido } from '@/components/chat/ui/ContenidoMensaje';
import { cn } from '@/utils/Utils';
import { cambiaAutor, elementosHilo, estadoEntrega, fechaLargaDia, relacionDia, type EstadoEntrega, type NotaHilo } from './hiloLogica';

const PAGINA = 30;
const EVENTOS_ENTREGA = ['sent', 'delivered', 'read', 'failed'];

/**
 * Lleva el hilo a un mensaje y lo resalta 2 s (resultado de «Buscar en la
 * conversación», como el Chat anterior).
 */
export function irAMensaje(id: string): void {
  const el = typeof document !== 'undefined' ? document.getElementById(`mensaje-${id}`) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Franja amarilla de todo el ancho del hilo (Figma 94-chat-recuperado-10). El
  // anillo la ensancha 6 px sin mover la burbuja.
  const resaltado = ['bg-warning-subtle', 'ring-[6px]', 'ring-warning-subtle'];
  el.classList.add(...resaltado);
  window.setTimeout(() => el.classList.remove(...resaltado), 2500);
}

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
  /** Eventos del sistema intercalados («Laura R. bloqueó el contacto · 10:45»). */
  eventos?: readonly EventoBloqueo[];
  agentes: readonly AgenteChat[];
  /** Nombre del cliente: encabeza sus mensajes cuando cambia quien habla. */
  nombreCliente?: string | null;
  /** Para escuchar en tiempo real los estados de entrega (`message_events`). */
  organizationId?: number | null;
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
export function HiloConversacion({ conversationId, notas, eventos = [], agentes, nombreCliente, organizationId, nombreCanal, inicioConversacion, className }: HiloConversacionProps) {
  const t = useTranslations('chatBandeja.hilo');
  const tb = useTranslations('chatBandejaPendientes.bloqueo');
  const locale = useLocale();
  const { formatTime, timezone, getToday } = useFormatDate();
  const [mensajes, setMensajes] = React.useState<FilaMensaje[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [cargandoMas, setCargandoMas] = React.useState(false);
  const [hayMas, setHayMas] = React.useState(true);
  const [lejosDelFinal, setLejosDelFinal] = React.useState(false);
  /** Eventos del proveedor por mensaje del equipo (Entregado / Leído / Fallido). */
  const [entregas, setEntregas] = React.useState<Record<string, Array<{ event_type: string }>>>({});
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

  // Estados de entrega de los mensajes del equipo cargados (`message_events`).
  const mensajesRef = React.useRef(mensajes);
  mensajesRef.current = mensajes;
  const idsSalientes = React.useMemo(
    () => mensajes.filter((m) => m.direction === 'outbound' && (m.role === 'agent' || m.role === 'ai')).map((m) => m.id),
    [mensajes],
  );
  const claveSalientes = idsSalientes.join(',');
  React.useEffect(() => {
    if (idsSalientes.length === 0) return;
    let vivo = true;
    void supabase
      .from('message_events')
      .select('message_id, event_type')
      .in('message_id', idsSalientes)
      .in('event_type', EVENTOS_ENTREGA)
      .then(({ data }) => {
        if (!vivo || !data) return;
        const mapa: Record<string, Array<{ event_type: string }>> = {};
        for (const f of data as Array<{ message_id: string; event_type: string }>) (mapa[f.message_id] ??= []).push({ event_type: f.event_type });
        setEntregas(mapa);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la lista cambia solo si cambian los ids
  }, [claveSalientes]);
  React.useEffect(() => {
    if (!organizationId) return;
    const canal = supabase
      .channel(`chat-entregas-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_events', filter: `organization_id=eq.${organizationId}` }, (p) => {
        const ev = p.new as { message_id?: string; event_type?: string };
        if (!ev.message_id || !ev.event_type || !EVENTOS_ENTREGA.includes(ev.event_type)) return;
        const id = ev.message_id;
        const tipo = ev.event_type;
        setEntregas((prev) => (prev[id] || mensajesRef.current.some((m) => m.id === id) ? { ...prev, [id]: [...(prev[id] ?? []), { event_type: tipo }] } : prev));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [organizationId, conversationId]);
  const entregaDe = (m: FilaMensaje): EstadoEntrega => estadoEntrega(entregas[m.id] ?? [], m.is_read);

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

  const elementos = elementosHilo(mensajes, notas, timezone, hayMas, eventos);
  // Quién escribió el mensaje anterior (solo entre mensajes) para encabezar al cambiar de autor.
  let anterior: FilaMensaje | null = null;

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
              if (e.tipo === 'evento') {
                const persona = agenteAsignado(agentes, e.evento.memberId)?.nombre;
                const clave = e.evento.tipo === 'bloqueo' ? 'eventoBloqueo' : 'eventoDesbloqueo';
                return (
                  <Burbuja key={e.clave} autor="sistema" hora={formatTime(e.evento.created_at)}>
                    {persona ? tb(clave, { persona }) : tb(`${clave}SinPersona`)}
                  </Burbuja>
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
              const nuevoAutor = cambiaAutor(anterior, m);
              anterior = m;
              const agente = autor === 'agente' ? agenteAsignado(agentes, m.sender_member_id) : null;
              const remitente =
                !nuevoAutor || autor === 'ia' || autor === 'sistema'
                  ? null
                  : autor === 'agente'
                    ? agente
                      ? { nombre: agente.nombre, avatarUrl: agente.avatarUrl }
                      : null
                    : nombreCliente
                      ? { nombre: nombreCliente }
                      : null;
              return (
                <Burbuja
                  key={e.clave}
                  id={`mensaje-${m.id}`}
                  autor={autor}
                  hora={formatTime(m.created_at)}
                  entrega={autor === 'agente' || autor === 'ia' ? entregaDe(m) : null}
                  remitente={remitente}
                  detalle={revisor ? t('revisoIa', { nombre: revisor }) : autor === 'cliente' && entroBloqueado(m.metadata) ? tb('mensajeBloqueado') : null}
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
