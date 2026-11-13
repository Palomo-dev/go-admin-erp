'use client';

/**
 * Chat › Bandeja (Figma 91-chat-01…09 y 91-chat-14…17).
 *
 * Escritorio: lista «Chats» con vistas rápidas · hilo con su cabecera y el
 * compositor · panel Cliente · Acciones · Notas · IA (desde xl; debajo, la
 * tira «Detalles» abre el mismo panel en una hoja). Celular: lista → hilo a
 * pantalla completa (la conversación vive en `?c=<id>`, así «←» del shell
 * vuelve a la lista) con la hoja «Detalles».
 *
 * La conversación seleccionada usa `useConversacion`, el mismo hook de la
 * vista completa: estado, asignación, notas, IA y envío no se duplican.
 */
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Radio } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { EmptyState, FilterButton, SearchInput, Skeleton, clasesBoton, useEsEscritorio } from '@/components/kit';
import { useCabeceraMovil, ALTO_BARRA_APP } from '@/components/shell/header/cabeceraMovil';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { supabase } from '@/lib/supabase/config';
import ConversationsService, { type Conversation, type ConteoVistas } from '@/lib/services/conversationsService';
import { ConversacionFila } from '@/components/chat/ui/ConversacionFila';
import { canalDeTipo } from '@/components/chat/ui/canal';
import { useAgentesChat, useConversacion } from '@/components/chat/conversations/useConversacion';
import { AreaConversacion } from '@/components/chat/conversations/AreaConversacion';
import { CabeceraHilo, nombreClienteConversacion } from '@/components/chat/conversations/CabeceraHilo';
import { PanelConversacion } from '@/components/chat/conversations/panel/PanelConversacion';
import { TiraDetalles } from '@/components/chat/conversations/HojaDetalles';
import SearchPanel from '@/components/chat/inbox/SearchPanel';
import {
  VISTAS,
  atencionDeFila,
  coincideBusqueda,
  cuandoDeFila,
  cuentaFiltrosExtra,
  esVista,
  filtrosDeVista,
  type FiltrosExtra,
  type VistaBandeja,
} from '@/components/chat/inbox/bandejaLogica';
import { cn } from '@/utils/Utils';

const PAGINA = 20;
const TODOS = '__todos__';

/** `useSearchParams` exige un límite de Suspense para el prerender. */
export default function ChatBandejaPage() {
  return (
    <Suspense fallback={null}>
      <Bandeja />
    </Suspense>
  );
}

function Bandeja() {
  const t = useTranslations('chatBandeja');
  const tp = useTranslations('chatUi.prioridad');
  const tf = useTranslations('chatUi.fila');
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id as number | undefined;
  const esEscritorio = useEsEscritorio();
  const { formatTime, formatDate, timezone } = useFormatDate();
  const { agentes } = useAgentesChat();
  const miMiembro = useMemo(() => agentes.find((a) => a.esYo)?.memberId ?? null, [agentes]);

  const seleccion = params?.get('c') ?? null;
  const vistaParam = params?.get('vista');
  const vista: VistaBandeja = esVista(vistaParam) ? vistaParam : 'abiertas';

  const [conversaciones, setConversaciones] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [conteos, setConteos] = useState<ConteoVistas | null>(null);
  const [canales, setCanales] = useState<Array<{ id: string; name: string; type: string }> | null>(null);
  const [etiquetas, setEtiquetas] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [busqueda, setBusqueda] = useState('');
  const [extra, setExtra] = useState<FiltrosExtra>({});
  const [listaOculta, setListaOculta] = useState(false);
  const [buscarEnHilo, setBuscarEnHilo] = useState(false);
  const [insertar, setInsertar] = useState<{ texto: string; clave: number } | null>(null);
  const pedido = useRef(0);
  const centinela = useRef<HTMLDivElement>(null);

  const c = useConversacion(organizationId, seleccion);

  const servicio = useMemo(() => (organizationId ? new ConversationsService(organizationId) : null), [organizationId]);
  const filtros = useMemo(() => filtrosDeVista(vista, miMiembro, extra), [vista, miMiembro, extra]);

  // ── Datos ───────────────────────────────────────────────────────────────
  const cargar = useCallback(
    async (silencioso = false, cantidad = PAGINA) => {
      if (!servicio) return;
      const id = ++pedido.current;
      if (!silencioso) setCargando(true);
      try {
        const [r, n] = await Promise.all([
          filtros ? servicio.getConversationsPaginated(filtros, { limit: cantidad, offset: 0 }) : Promise.resolve({ data: [] as Conversation[], total: 0, hasMore: false }),
          servicio.contarVistas(miMiembro).catch(() => null),
        ]);
        if (id !== pedido.current) return;
        setConversaciones(r.data);
        setTotal(r.total);
        setHayMas(r.hasMore);
        if (n) setConteos(n);
      } catch (e) {
        if (!silencioso) toast({ title: t('avisos.errorLista'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      } finally {
        if (id === pedido.current) setCargando(false);
      }
    },
    [servicio, filtros, miMiembro, toast, t],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!servicio) return;
    servicio.getChannels().then(setCanales).catch(() => setCanales([]));
    servicio.getTags().then(setEtiquetas).catch(() => setEtiquetas([]));
  }, [servicio]);

  // Tiempo real: un mensaje nuevo en la organización refresca la lista sin spinner.
  const recargarSilencioso = useRef<() => void>(() => undefined);
  recargarSilencioso.current = () => void cargar(true, Math.max(conversaciones.length, PAGINA));
  useEffect(() => {
    if (!organizationId) return;
    const canal = supabase
      .channel('chat-bandeja')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `organization_id=eq.${organizationId}` }, () => recargarSilencioso.current())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `organization_id=eq.${organizationId}` }, () => recargarSilencioso.current())
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [organizationId]);

  const cargarMas = useCallback(async () => {
    if (!servicio || !filtros || cargandoMas || !hayMas || busqueda) return;
    setCargandoMas(true);
    try {
      const r = await servicio.getConversationsPaginated(filtros, { limit: PAGINA, offset: conversaciones.length });
      setConversaciones((prev) => [...prev, ...r.data.filter((n) => !prev.some((p) => p.id === n.id))]);
      setHayMas(r.hasMore);
    } finally {
      setCargandoMas(false);
    }
  }, [servicio, filtros, cargandoMas, hayMas, busqueda, conversaciones.length]);

  useEffect(() => {
    const el = centinela.current;
    if (!el) return;
    const obs = new IntersectionObserver((e) => e[0]?.isIntersecting && void cargarMas(), { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [cargarMas]);

  // ── Navegación (la selección y la vista viven en la URL) ────────────────
  const irA = useCallback(
    (cambios: { c?: string | null; vista?: VistaBandeja }) => {
      const p = new URLSearchParams(params?.toString() ?? '');
      if ('c' in cambios) {
        if (cambios.c) p.set('c', cambios.c);
        else p.delete('c');
      }
      if (cambios.vista) {
        if (cambios.vista === 'abiertas') p.delete('vista');
        else p.set('vista', cambios.vista);
      }
      const url = `/app/chat/bandeja${p.toString() ? `?${p.toString()}` : ''}`;
      // En el celular abrir un chat es una página más: «←» vuelve a la lista.
      if (!esEscritorio && cambios.c) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, router, esEscritorio],
  );

  const abrir = (conv: Conversation) => {
    if (conv.unread_count > 0) setConversaciones((prev) => prev.map((x) => (x.id === conv.id ? { ...x, unread_count: 0 } : x)));
    irA({ c: conv.id });
  };

  const visibles = useMemo(() => conversaciones.filter((x) => coincideBusqueda(x, busqueda)), [conversaciones, busqueda]);
  const sinCanales = canales !== null && canales.length === 0;
  const ahora = new Date();

  const cuando = (instante: string | null | undefined) => {
    const r = cuandoDeFila(instante, timezone, ahora);
    if (!r) return undefined;
    if (r.tipo === 'hora') return formatTime(r.instante);
    if (r.tipo === 'ayer') return t('lista.ayer');
    if (r.tipo === 'semana') return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: timezone }).format(new Date(r.instante));
    return formatDate(r.instante);
  };

  const vistaPrevia = (conv: Conversation) => {
    const m = conv.last_message;
    if (!m?.content) return t('lista.sinMensajes');
    const texto = m.content.replace(/\[IMG:[^\]]+\]/g, '').replace(/\*\*/g, '').trim() || t('lista.adjunto');
    return m.role === 'ai' ? tf('prefijoIa', { texto }) : texto;
  };

  // ── Cabecera del celular ────────────────────────────────────────────────
  const nombreSel = c.detalle ? nombreClienteConversacion(c.detalle, t('hilo.cliente')) : '';
  const asignadoSel = c.detalle ? agentes.find((a) => a.memberId === c.detalle?.assigned_member_id) : null;
  useCabeceraMovil(
    seleccion
      ? {
          modo: 'page',
          titulo: nombreSel || t('lista.titulo'),
          subtitulo: [c.detalle?.channel?.name, asignadoSel?.nombre].filter(Boolean).join(' · '),
          volverA: '/app/chat/bandeja',
          ocultarBarra: true,
        }
      : {
          modo: 'page',
          titulo: t('movil.titulo'),
          subtitulo: conteos ? t('movil.subtitulo', { n: conteos.abiertas }) : t('movil.bandeja'),
          volverA: '/app/inicio',
          ocultarBarra: false,
        },
  );

  const contador = (v: VistaBandeja) => (conteos ? conteos[v] : null);
  const editarRespuesta = (texto: string) => setInsertar({ texto, clave: Date.now() });

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-surface">
      {/* Lista */}
      <section
        aria-label={t('lista.titulo')}
        className={cn(
          'min-h-0 w-full flex-col border-r border-line bg-surface lg:w-[360px] xl:w-[380px]',
          seleccion ? 'hidden lg:flex' : 'flex',
          listaOculta && 'lg:hidden',
        )}
      >
        <div className="shrink-0 space-y-3 px-4 pb-3 pt-4">
          <div className="hidden items-center gap-2 lg:flex">
            <h1 className="text-lg font-semibold text-fg">{t('lista.titulo')}</h1>
            {conteos && !sinCanales ? (
              <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-deep">{t('lista.abiertas', { n: conteos.abiertas })}</span>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <FilterButton conteo={cuentaFiltrosExtra(extra)} etiqueta={t('filtros.titulo')} />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-3">
                  <FiltroSelect
                    etiqueta={t('filtros.prioridad')}
                    valor={extra.prioridad}
                    onCambio={(v) => setExtra((e) => ({ ...e, prioridad: v }))}
                    opciones={(['low', 'normal', 'high', 'urgent'] as const).map((p) => ({ valor: p, etiqueta: tp(p) }))}
                    todos={t('filtros.todas')}
                  />
                  <FiltroSelect
                    etiqueta={t('filtros.canal')}
                    valor={extra.canal}
                    onCambio={(v) => setExtra((e) => ({ ...e, canal: v }))}
                    opciones={(canales ?? []).map((ch) => ({ valor: ch.id, etiqueta: ch.name }))}
                    todos={t('filtros.todos')}
                  />
                  <FiltroSelect
                    etiqueta={t('filtros.etiqueta')}
                    valor={extra.etiqueta}
                    onCambio={(v) => setExtra((e) => ({ ...e, etiqueta: v }))}
                    opciones={etiquetas.map((e) => ({ valor: e.id, etiqueta: e.name }))}
                    todos={t('filtros.todas')}
                  />
                  {cuentaFiltrosExtra(extra) > 0 ? (
                    <button type="button" onClick={() => setExtra({})} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', anchoCompleto: true })}>
                      {t('filtros.limpiar')}
                    </button>
                  ) : null}
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => setListaOculta(true)}
                aria-label={t('lista.ocultar')}
                title={t('lista.ocultar')}
                className="flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"
              >
                <PanelLeftClose aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
          <SearchInput value={busqueda} onChange={setBusqueda} placeholder={esEscritorio ? t('lista.buscar') : t('lista.buscarCorto')} atajo={false} tamano="sm" />
          {!sinCanales ? (
            <div role="tablist" aria-label={t('vistas.etiqueta')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 lg:flex-wrap">
              {VISTAS.map((v) => {
                const n = contador(v);
                const activa = v === vista;
                return (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={activa}
                    onClick={() => irA({ vista: v })}
                    className={cn(
                      'inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-medium',
                      activa ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
                    )}
                  >
                    {t(`vistas.${v}`)}
                    {n != null && v !== 'cerradas' ? <span className="text-fg-muted">· {n}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cargando || canales === null ? (
            <div aria-busy="true" aria-label={t('lista.cargando')}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3 border-b border-line px-4 py-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : sinCanales ? (
            <EmptyState
              compacto
              icono={Radio}
              titulo={t('vacio.sinCanalesTitulo')}
              descripcion={t('vacio.sinCanalesDescripcion')}
              accion={{ etiqueta: t('vacio.conectar'), href: '/app/chat/canales', icono: Plus }}
              className="mt-10"
            />
          ) : visibles.length === 0 ? (
            busqueda || cuentaFiltrosExtra(extra) > 0 ? (
              <EmptyState
                compacto
                variante="search"
                termino={busqueda || undefined}
                titulo={t('vacio.sinResultadosTitulo')}
                descripcion={t('vacio.sinResultadosDescripcion')}
                onLimpiarFiltros={() => {
                  setBusqueda('');
                  setExtra({});
                }}
                className="mt-10"
              />
            ) : (
              <EmptyState compacto icono={MessageSquare} titulo={t(`vacio.vista.${vista}`)} className="mt-10" />
            )
          ) : (
            <>
              {visibles.map((conv) => (
                <ConversacionFila
                  key={conv.id}
                  nombre={nombreClienteConversacion(conv, t('hilo.cliente'))}
                  canal={canalDeTipo(conv.channel?.type)}
                  vistaPrevia={vistaPrevia(conv)}
                  cuando={cuando(conv.last_message?.created_at ?? conv.last_message_at)}
                  noLeidos={conv.unread_count}
                  prioridad={conv.priority}
                  atencion={atencionDeFila(conv, agentes)}
                  activa={conv.id === seleccion}
                  onClick={() => abrir(conv)}
                />
              ))}
              {!busqueda ? (
                <div ref={centinela} className="py-4 text-center text-xs text-fg-muted">
                  {cargandoMas ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      {t('lista.cargandoMas')}
                    </span>
                  ) : hayMas ? (
                    t('lista.deTotal', { n: conversaciones.length, total })
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* «+ Nueva» flotante del celular (en escritorio va junto a las pestañas del módulo). */}
        <Link
          href="/app/chat/conversaciones/nueva"
          className={clasesBoton({ tamano: 'lg', className: 'fixed right-4 z-30 rounded-xl shadow-lg lg:hidden' })}
          style={{ bottom: `calc(${ALTO_BARRA_APP} + 1rem)` }}
        >
          <Plus aria-hidden="true" className="size-5" />
          {t('movil.nueva')}
        </Link>
      </section>

      {listaOculta ? (
        <div className="hidden shrink-0 border-r border-line bg-surface p-2 lg:block">
          <button
            type="button"
            onClick={() => setListaOculta(false)}
            aria-label={t('lista.mostrar')}
            title={t('lista.mostrar')}
            className="flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"
          >
            <PanelLeftOpen aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}

      {/* Hilo */}
      <section aria-label={t('hilo.etiqueta')} className={cn('min-h-0 min-w-0 flex-1 flex-col bg-canvas', seleccion ? 'flex' : 'hidden lg:flex')}>
        {seleccion ? (
          <>
            <div className="hidden lg:block">
              <CabeceraHilo c={c} onBuscar={() => setBuscarEnHilo(true)} />
            </div>
            <TiraDetalles c={c} organizationId={organizationId} onEditarRespuesta={editarRespuesta} className="xl:hidden" />
            <AreaConversacion c={c} insertar={insertar} compacto={!esEscritorio} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            {sinCanales ? (
              <EmptyState titulo={t('vacio.listaTitulo')} descripcion={t('vacio.listaDescripcion')} />
            ) : (
              <EmptyState titulo={t('vacio.elegirTitulo')} descripcion={t('vacio.elegirDescripcion')} />
            )}
          </div>
        )}
      </section>

      {/* Panel derecho (xl+) */}
      {seleccion ? (
        <aside aria-label={t('panel.etiqueta')} className="hidden w-[320px] shrink-0 border-l border-line xl:flex 2xl:w-[360px]">
          <PanelConversacion id="panel-bandeja" c={c} organizationId={organizationId} onEditarRespuesta={editarRespuesta} className="w-full" />
        </aside>
      ) : null}

      {/* Buscar en la conversación */}
      <Sheet open={buscarEnHilo} onOpenChange={setBuscarEnHilo}>
        <SheetContent side="right" aria-describedby={undefined} className="w-full p-0 sm:max-w-md">
          <SheetTitle className="sr-only">{t('mas.buscar')}</SheetTitle>
          {buscarEnHilo && c.detalle ? (
            <SearchPanel
              conversation={c.detalle as unknown as Conversation}
              onScrollToMessage={(id: string) => {
                setBuscarEnHilo(false);
                document.getElementById(`mensaje-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FiltroSelect({
  etiqueta,
  valor,
  onCambio,
  opciones,
  todos,
}: {
  etiqueta: string;
  valor: string | null | undefined;
  onCambio: (v: string | null) => void;
  opciones: Array<{ valor: string; etiqueta: string }>;
  todos: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-fg">
      <span className="block">{etiqueta}</span>
      <Select value={valor ?? TODOS} onValueChange={(v) => onCambio(v === TODOS ? null : v)}>
        <SelectTrigger aria-label={etiqueta}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>{todos}</SelectItem>
          {opciones.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
