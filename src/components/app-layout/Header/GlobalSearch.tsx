'use client';

/**
 * Buscador global — paleta Ctrl K / ⌘ K (Figma `02 Componentes` › Header ›
 * SearchCommand 46:2493, CommandRow 46:2156; disparadores SearchTrigger
 * 45:2042 y MobileHeader 48:2550).
 *
 * Escritorio (≥ 1024 px): diálogo de 640 px anclado arriba, con el campo, los
 * grupos y el pie de atajos (↑↓ navegar · Enter abrir · Esc cerrar).
 * Móvil: pantalla completa con el campo y «×» arriba; se abre con la lupa del
 * MobileHeader.
 *
 * Qué se busca y de dónde sale:
 *  - Recientes: lo último abierto desde aquí, por usuario y organización
 *    (`lib/busquedaGlobal/recientes.ts`), filtrado por las páginas que la
 *    persona ve hoy.
 *  - Acciones: «Reportar un problema» (siempre) y las acciones rápidas que el
 *    SERVIDOR concede (página visible + permiso de rol o cargo).
 *  - Páginas: las del menú ya filtrado (`paginas`, de `filtrarNavegacion`),
 *    filtradas aquí mismo sin tildes.
 *  - Datos (clientes, productos, facturas…): `GET /api/busqueda-global`, solo
 *    de los módulos activos y las páginas que el cargo ve.
 *
 * Accesibilidad: cmdk da el combobox (`role="combobox"`, `aria-controls`,
 * `aria-activedescendant`) y la lista (`role="listbox"` / `option`); Radix
 * atrapa el foco y cierra con Esc; una región `aria-live` anuncia cuántos
 * resultados hay.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import {
  AlertTriangle,
  BedDouble,
  BookOpen,
  Bug,
  CalendarPlus,
  Car,
  Clock,
  CreditCard,
  FilePlus2,
  FileText,
  FileQuestion,
  Package,
  PackagePlus,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Tags,
  Truck,
  User,
  UserPlus,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Kbd } from '@/components/kit/Kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/config';
import { abrirReportarProblema } from '@/components/shell/header/ReportarProblema';
import type { IdAccion, ResultadoEntidad, TipoEntidad } from '@/lib/busquedaGlobal/definiciones';
import {
  accionAtajo,
  coincideCampos,
  estadoBusqueda,
  filtrarPaginas,
  MIN_CARACTERES_ENTIDADES,
  PAGINAS_INICIALES,
  palabrasBusqueda,
} from '@/lib/busquedaGlobal/logica';
import {
  agregarReciente,
  almacenLocal,
  claveRecientes,
  filtrarRecientes,
  guardarRecientes,
  leerRecientes,
  type Reciente,
} from '@/lib/busquedaGlobal/recientes';
import { useBusquedaServidor } from './GlobalSearch/useBusquedaServidor';
import { useDescribirResultado } from './GlobalSearch/useDescribirResultado';

/** Evento con el que el shell abre el buscador desde cualquier disparador. */
export const ABRIR_BUSCADOR_EVENT = 'shell:abrir-buscador';

export interface PaginaBuscable {
  id: string;
  name: string;
  url: string;
  description?: string;
  /** Icono de la página en el catálogo de navegación. */
  icono?: LucideIcon;
}

interface GlobalSearchProps {
  /**
   * Páginas que la persona puede abrir, sacadas del menú ya filtrado
   * (`filtrarNavegacion`). Son también la referencia para descartar recientes
   * de módulos que ya no ve.
   */
  paginas?: PaginaBuscable[];
  /** Organización activa (clave de recientes y de las acciones cacheadas). */
  organizacionId?: string | null;
  /** @deprecated El disparador lo pinta el header (`AppHeader`); se ignora. */
  sinDisparador?: boolean;
  /** @deprecated Sin uso desde que el header pinta su propio disparador. */
  forceFullBar?: boolean;
}

const ICONO_ENTIDAD: Record<TipoEntidad, LucideIcon> = {
  customer: User,
  product: Package,
  branch: Warehouse,
  supplier: Truck,
  category: Tags,
  invoice: FileText,
  web_order: ShoppingBag,
  reservation: BookOpen,
  space: BedDouble,
  membership: CreditCard,
  parking_vehicle: Car,
};

const GRUPO_I18N: Record<TipoEntidad, string> = {
  customer: 'customers',
  product: 'products',
  branch: 'branches',
  supplier: 'suppliers',
  category: 'categories',
  invoice: 'invoices',
  web_order: 'webOrders',
  reservation: 'reservations',
  space: 'spaces',
  membership: 'memberships',
  parking_vehicle: 'parking',
};

const ICONO_ACCION: Record<IdAccion | 'reportar', LucideIcon> = {
  reportar: Bug,
  nuevaVenta: ShoppingCart,
  nuevaFactura: FilePlus2,
  nuevoCliente: UserPlus,
  nuevoProducto: PackagePlus,
  nuevaReserva: CalendarPlus,
};

/** Acción que se ofrece en «Sin resultados», por preferencia (Figma: «Crear producto»). */
const CREAR_SIN_RESULTADOS: IdAccion[] = ['nuevoProducto', 'nuevoCliente'];

function esCampoEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

interface AccionFila {
  id: IdAccion | 'reportar';
  etiqueta: string;
  ayuda: string;
  href: string | null;
}

const GlobalSearch = ({ paginas, organizacionId = null }: GlobalSearchProps) => {
  const t = useTranslations('header.globalSearch');
  const router = useRouter();
  const describir = useDescribirResultado();
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [recientes, setRecientes] = useState<Reciente[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Estado y no ref: la lista monta dentro del portal de Radix un render después de abrir.
  const [lista, setLista] = useState<HTMLDivElement | null>(null);
  const abiertoRef = useRef(false);
  abiertoRef.current = abierto;
  const idAnuncio = useId();

  const servidor = useBusquedaServidor(consulta, abierto, organizacionId);
  const clave = claveRecientes(usuarioId, organizacionId);
  const listaPaginas = useMemo(() => paginas ?? [], [paginas]);
  const hrefsVisibles = useMemo(() => listaPaginas.map((p) => p.url), [listaPaginas]);

  // Usuario de la sesión para la clave de recientes (lectura local, sin red).
  useEffect(() => {
    let vivo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (vivo) setUsuarioId(data.session?.user?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (abierto) setRecientes(leerRecientes(almacenLocal(), clave));
  }, [abierto, clave]);

  const abrir = useCallback(() => setAbierto(true), []);
  useDescendienteActivo(lista, inputRef);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      const accion = accionAtajo(e, esCampoEditable(e.target), abiertoRef.current);
      if (!accion) return;
      e.preventDefault();
      if (accion === 'alternar') setAbierto((v) => !v);
      else setAbierto(true);
    };
    // En `window` y en burbuja: corre DESPUÉS del «/» de kit/SearchInput
    // (que escucha en `document`), así el buscador de la página tiene
    // prioridad. Ver `accionAtajo`.
    window.addEventListener('keydown', alPulsar);
    window.addEventListener(ABRIR_BUSCADOR_EVENT, abrir);
    return () => {
      window.removeEventListener('keydown', alPulsar);
      window.removeEventListener(ABRIR_BUSCADOR_EVENT, abrir);
    };
  }, [abrir]);

  const cambiarAbierto = (v: boolean) => {
    setAbierto(v);
    if (!v) setConsulta('');
  };

  // ─── Qué se pinta ─────────────────────────────────────────────────────────

  const texto = consulta.trim();
  const palabras = useMemo(() => palabrasBusqueda(texto), [texto]);

  const acciones: AccionFila[] = useMemo(() => {
    const todas: AccionFila[] = [
      { id: 'reportar', etiqueta: t('actions.reportProblem'), ayuda: t('actions.reportProblemHint'), href: null },
      ...servidor.acciones.map((a) => ({
        id: a.id,
        etiqueta: t(`actions.${a.id}`),
        ayuda: t(`actions.${a.id}Hint`),
        href: a.href,
      })),
    ];
    return texto ? todas.filter((a) => coincideCampos([a.etiqueta, a.ayuda], palabras)) : todas;
  }, [servidor.acciones, t, texto, palabras]);

  const paginasMostradas = useMemo(
    () => (texto ? filtrarPaginas(listaPaginas, texto).slice(0, 8) : listaPaginas.slice(0, PAGINAS_INICIALES)),
    [listaPaginas, texto],
  );

  const recientesMostrados = useMemo(() => (texto ? [] : filtrarRecientes(recientes, hrefsVisibles)), [texto, recientes, hrefsVisibles]);

  const totalLocal = paginasMostradas.length + (texto ? acciones.length : 0);
  const totalServidor = servidor.grupos.reduce((n, g) => n + g.items.length, 0);
  const estado = estadoBusqueda({
    consulta: texto,
    cargando: servidor.cargando,
    error: servidor.error,
    totalLocal,
    totalServidor,
  });

  const crear = CREAR_SIN_RESULTADOS.map((id) => servidor.acciones.find((a) => a.id === id)).find(Boolean) ?? null;

  const anuncio = !texto
    ? ''
    : estado === 'cargando'
      ? t('searching')
      : estado === 'error'
        ? t('error.title')
        : estado === 'sin-resultados'
          ? t('noResults', { query: texto })
          : t('resultsCount', { n: totalLocal + totalServidor });

  // ─── Selección ────────────────────────────────────────────────────────────

  const recordar = (r: Reciente) => {
    const nueva = agregarReciente(recientes, r);
    setRecientes(nueva);
    guardarRecientes(almacenLocal(), clave, nueva);
  };

  const ir = (url: string) => {
    cambiarAbierto(false);
    router.push(url);
  };

  const elegirAccion = (a: AccionFila) => {
    if (a.id === 'reportar') {
      cambiarAbierto(false);
      // Tras cerrar: dos diálogos de Radix abiertos a la vez se pelean el foco.
      setTimeout(abrirReportarProblema, 0);
      return;
    }
    if (a.href) ir(a.href);
  };

  const elegirEntidad = (r: ResultadoEntidad) => {
    const { titulo, subtitulo } = describir(r);
    recordar({ tipo: r.tipo, id: r.id, titulo, subtitulo: subtitulo || undefined, url: r.url });
    ir(r.url);
  };

  const elegirPagina = (p: PaginaBuscable) => {
    recordar({ tipo: 'page', id: p.url, titulo: p.name, subtitulo: p.url, url: p.url });
    ir(p.url);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const encabezado =
    '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:leading-4 [&_[cmdk-group-heading]]:text-fg-secondary';

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={cambiarAbierto}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 hidden bg-fg/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:block" />
        <DialogPrimitive.Content
          aria-describedby={`${idAnuncio}-desc`}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            'fixed inset-0 z-50 flex flex-col bg-surface outline-none',
            'lg:inset-auto lg:left-1/2 lg:top-[12vh] lg:max-h-[76vh] lg:w-[640px] lg:max-w-[calc(100vw-2rem)] lg:-translate-x-1/2',
            'lg:overflow-hidden lg:rounded-xl lg:border lg:border-line',
            'lg:shadow-[0_2px_6px_rgba(15,23,42,0.06),0_12px_32px_-4px_rgba(15,23,42,0.14)]',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{t('title')}</DialogPrimitive.Title>
          <DialogPrimitive.Description id={`${idAnuncio}-desc`} className="sr-only">
            {t('description')}
          </DialogPrimitive.Description>

          {/* vimBindings: sin Ctrl J/K/N/P de cmdk; Ctrl K es el atajo que cierra la paleta. */}
          <Command label={t('title')} shouldFilter={false} loop vimBindings={false} className="flex min-h-0 flex-1 flex-col">
            {/* Buscador (Figma «Buscador»: 12 px arriba, 8 abajo, divisor) */}
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))] lg:pt-3">
              <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                <Search className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} aria-hidden="true" />
                <Command.Input
                  ref={inputRef}
                  value={consulta}
                  onValueChange={setConsulta}
                  placeholder={t('placeholder')}
                  aria-label={t('placeholder')}
                  enterKeyHint="search"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
                />
                <Kbd tecla="Esc" className="hidden lg:inline-flex" />
              </div>
              <DialogPrimitive.Close
                aria-label={t('close')}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-fg-secondary outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand lg:hidden"
              >
                <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>

            <Command.List
              ref={setLista}
              label={t('title')}
              className={cn(
                'min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:pb-3',
                encabezado,
              )}
            >
              {recientesMostrados.length > 0 && (
                <Command.Group heading={t('groups.recent')}>
                  {recientesMostrados.map((r) => (
                    <Fila
                      key={`r:${r.url}`}
                      valor={`reciente:${r.url}`}
                      icono={Clock}
                      titulo={r.titulo}
                      subtitulo={r.subtitulo}
                      onSelect={() => {
                        recordar(r);
                        ir(r.url);
                      }}
                    />
                  ))}
                </Command.Group>
              )}

              {acciones.length > 0 && (
                <Command.Group heading={t('groups.actions')}>
                  {acciones.map((a) => (
                    <Fila
                      key={`a:${a.id}`}
                      valor={`accion:${a.id}`}
                      icono={ICONO_ACCION[a.id]}
                      titulo={a.etiqueta}
                      subtitulo={a.ayuda}
                      onSelect={() => elegirAccion(a)}
                    />
                  ))}
                </Command.Group>
              )}

              {paginasMostradas.length > 0 && (
                <Command.Group heading={t('groups.pages')}>
                  {paginasMostradas.map((p) => (
                    <Fila
                      key={`p:${p.url}`}
                      valor={`pagina:${p.url}`}
                      icono={p.icono ?? FileQuestion}
                      titulo={p.name}
                      subtitulo={p.url}
                      onSelect={() => elegirPagina(p)}
                    />
                  ))}
                </Command.Group>
              )}

              {servidor.grupos.map((g) => (
                <Command.Group key={g.tipo} heading={t(`groups.${GRUPO_I18N[g.tipo]}`)}>
                  {g.items.map((r) => {
                    const { titulo, subtitulo } = describir(r);
                    return (
                      <Fila
                        key={`${g.tipo}:${r.id}`}
                        valor={`${g.tipo}:${r.id}`}
                        icono={ICONO_ENTIDAD[g.tipo]}
                        titulo={titulo}
                        subtitulo={subtitulo}
                        onSelect={() => elegirEntidad(r)}
                      />
                    );
                  })}
                </Command.Group>
              ))}

              {estado === 'cargando' && <Cargando etiqueta={t('searching')} />}

              {estado === 'sin-resultados' && (
                <SinResultados
                  titulo={t('noResults', { query: texto })}
                  ayuda={texto.length < MIN_CARACTERES_ENTIDADES ? t('typeMore', { n: MIN_CARACTERES_ENTIDADES }) : t('noResultsHint')}
                  accion={
                    crear && texto.length >= MIN_CARACTERES_ENTIDADES
                      ? { etiqueta: t(`create.${crear.id as 'nuevoProducto' | 'nuevoCliente'}`), onClick: () => ir(crear.href) }
                      : null
                  }
                />
              )}

              {estado === 'error' && <ErrorBusqueda titulo={t('error.title')} ayuda={t('error.hint')} reintentar={t('error.retry')} onReintentar={servidor.reintentar} />}

              {/* Datos del servidor caídos con páginas a la vista, o grupos que no respondieron. */}
              {estado === 'resultados' && (servidor.error || servidor.fallidos.length > 0) && (
                <div role="status" className="mt-2 flex items-center gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-[13px] leading-[18px] text-warning-text">
                  <AlertTriangle className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span className="min-w-0 flex-1">{servidor.error ? t('error.title') : t('error.partial')}</span>
                  <button
                    type="button"
                    onClick={servidor.reintentar}
                    className="shrink-0 rounded-md px-2 py-1 font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {t('error.retry')}
                  </button>
                </div>
              )}
            </Command.List>

            {/* Pie de atajos (Figma «Pie»). En móvil no hay teclado físico que explicar. */}
            <div className="hidden shrink-0 items-center gap-3 px-6 pb-3 pt-2 text-xs font-medium leading-4 text-fg-secondary lg:flex" aria-hidden="true">
              <Kbd tecla="↑↓" />
              <span>{t('footer.navigate')}</span>
              <Kbd tecla="Enter" />
              <span>{t('footer.open')}</span>
              <Kbd tecla="Esc" />
              <span>{t('footer.close')}</span>
            </div>
          </Command>

          <div id={idAnuncio} aria-live="polite" aria-atomic="true" className="sr-only">
            {anuncio}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

/**
 * cmdk (1.1) selecciona la primera fila al montar la lista pero no publica su
 * id en `aria-activedescendant` hasta que se pulsa una flecha: el lector de
 * pantalla no anunciaba la opción activa. Se sincroniza observando
 * `aria-selected` en la lista; en cuanto cmdk lo publique él, coincide.
 */
function useDescendienteActivo(lista: HTMLDivElement | null, inputRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (!lista || typeof MutationObserver === 'undefined') return;
    const sincronizar = () => {
      const input = inputRef.current;
      if (!input) return;
      const activa = lista.querySelector('[cmdk-item][aria-selected="true"]');
      if (activa?.id) {
        input.setAttribute('aria-activedescendant', activa.id);
        lista.setAttribute('aria-activedescendant', activa.id);
      } else {
        input.removeAttribute('aria-activedescendant');
        lista.removeAttribute('aria-activedescendant');
      }
    };
    sincronizar();
    const observador = new MutationObserver(sincronizar);
    observador.observe(lista, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
    return () => observador.disconnect();
  }, [lista, inputRef]);
}

/** Fila del buscador (Figma CommandRow 46:2156: 44 px, icono 18, etiqueta y subtítulo; ↵ en la activa). */
function Fila({
  valor,
  icono: Icono,
  titulo,
  subtitulo,
  onSelect,
}: {
  valor: string;
  icono: LucideIcon;
  titulo: string;
  subtitulo?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={valor}
      onSelect={onSelect}
      className="group flex h-11 cursor-pointer select-none items-center gap-3 rounded-lg px-3 outline-none data-[selected=true]:bg-hover"
    >
      <Icono className="size-[18px] shrink-0 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden whitespace-nowrap">
        <span className="max-w-[70%] shrink-0 truncate text-sm leading-5 text-fg">{titulo}</span>
        {subtitulo && <span className="min-w-0 truncate text-[13px] leading-[18px] text-fg-secondary">{subtitulo}</span>}
      </span>
      <Kbd tecla="Enter" className="hidden lg:group-data-[selected=true]:inline-flex" />
    </Command.Item>
  );
}

function Cargando({ etiqueta }: { etiqueta: string }) {
  return (
    <Command.Loading label={etiqueta}>
      <div className="px-3 pb-1 pt-2.5 text-xs font-medium leading-4 text-fg-secondary">{etiqueta}</div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-11 items-center gap-3 px-3" aria-hidden="true">
          <Skeleton className="size-[18px] rounded-md" />
          <Skeleton className={cn('h-3.5 rounded', i === 1 ? 'w-40' : 'w-56')} />
          <Skeleton className="hidden h-3 w-24 rounded xs:block" />
        </div>
      ))}
    </Command.Loading>
  );
}

/** Figma SearchCommand State=empty (46:2286 · móvil 46:2456). */
function SinResultados({
  titulo,
  ayuda,
  accion,
}: {
  titulo: string;
  ayuda: string;
  accion: { etiqueta: string; onClick: () => void } | null;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
        <Search className="size-[22px] text-fg-muted" strokeWidth={1.5} />
      </span>
      <p className="text-sm font-medium leading-5 text-fg">{titulo}</p>
      <p className="text-[13px] leading-[18px] text-fg-secondary">{ayuda}</p>
      {accion && (
        <button
          type="button"
          onClick={accion.onClick}
          className="mt-1 inline-flex h-8 items-center gap-2 rounded-lg bg-brand-tint px-3 text-xs font-medium text-brand-deep outline-none hover:bg-brand-tint-hover focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}

function ErrorBusqueda({ titulo, ayuda, reintentar, onReintentar }: { titulo: string; ayuda: string; reintentar: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-subtle" aria-hidden="true">
        <AlertTriangle className="size-[22px] text-danger" strokeWidth={1.5} />
      </span>
      <p className="text-sm font-medium leading-5 text-fg">{titulo}</p>
      <p className="text-[13px] leading-[18px] text-fg-secondary">{ayuda}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="mt-1 inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
      >
        {reintentar}
      </button>
    </div>
  );
}

export default GlobalSearch;
