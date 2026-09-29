'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ChevronDown, CircleAlert, CloudOff, Eye, Loader2, Pencil, Plus, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Kbd } from './Kbd';
import { SearchInput } from './SearchInput';
import { ChipAlternable } from './documento/ChipAlternable';
import { indiceSiguiente } from './navegacionTeclado';
import { estadoListaEntidad, ofrecerCrear, type OpcionEntidad } from './selectorEntidadLogica';
import { ariaAtajo } from './teclas';
import { useEsEscritorio } from './useEsEscritorio';
import { useKitT } from './useIdiomaKit';

/**
 * Base común de los selectores de tercero (Figma `CustomerPicker` 849:558484…,
 * `SupplierPicker` de `02 Componentes › Finanzas`): un disparador y una lista
 * con buscador (`SearchInput` sm) que busca **en el servidor** con la función
 * que pasa la pantalla. Popover en escritorio, hoja inferior en móvil.
 *
 * Disparadores:
 * - `fila`: la fila compacta del POS y del formulario de factura: avatar,
 *   nombre, documento y «Cambiar · F2» · Ver · Editar · «×».
 * - `campo`: un campo tipo select para filtros y formularios.
 *
 * Teclado: ↑/↓ recorren, Enter elige, Esc cierra. La búsqueda anterior se
 * cancela con `AbortSignal` al escribir.
 *
 * Documento (Figma «Elegir cliente» `1041:33841` / «Elegir proveedor»):
 * `filtros` pinta chips bajo el buscador que se aplican al instante (llegan a
 * `buscar` como tercer argumento), cada opción puede traer su `etiqueta`
 * («Persona», «Empresa») y su `insignia` («Por cobrar $ …», «Al día»), y
 * `formularioCrear` cambia la lista por el formulario rápido dentro de la
 * misma capa: al crear, vuelve con el tercero elegido.
 */
export interface FiltroEntidad {
  id: string;
  etiqueta: string;
  /** Encendido al abrir («Solo activos»). */
  activoPorDefecto?: boolean;
}

export interface ContextoCrearEntidad<T> {
  texto: string;
  onCreado: (item: T) => void;
  onCancelar: () => void;
}
export interface TextosSelectorEntidad {
  placeholder?: string;
  buscar?: string;
  titulo?: string;
  vacio?: string;
  sinResultados?: string;
  error?: string;
  /** «Crear cliente “{texto}”». */
  crear?: (texto: string) => string;
  cambiar?: string;
  quitar?: string;
  ver?: string;
  editar?: string;
  pendienteSync?: string;
  /** Nombre del grupo de chips de filtro. */
  filtros?: string;
}

export interface SelectorEntidadProps<T> {
  valor: T | null | undefined;
  aOpcion: (item: T) => OpcionEntidad;
  /** `filtros`: ids de los chips encendidos (vacío si la pantalla no pasa `filtros`). */
  buscar: (texto: string, senal: AbortSignal, filtros: readonly string[]) => Promise<readonly T[]>;
  onCambiar: (item: T) => void;
  onQuitar?: () => void;
  onCrear?: (texto: string) => void;
  onVer?: () => void;
  onEditar?: () => void;
  icono: LucideIcon;
  layout?: 'fila' | 'campo';
  textos?: TextosSelectorEntidad;
  /** Nombre accesible del selector («Cliente»). */
  etiqueta: string;
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
  /** «F2»: se muestra en «Cambiar» y lo registra la pantalla con `useAtajos`. */
  atajo?: string;
  /** Contenido extra al final de la lista («Espacios ocupados» del PMS). */
  grupoExtra?: ReactNode;
  /** Insignia a la derecha del valor elegido (saldo por pagar del proveedor). */
  insigniaValor?: ReactNode;
  deshabilitado?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  debounceMs?: number;
  /** Chips de filtro bajo el buscador. */
  filtros?: readonly FiltroEntidad[];
  /** Formulario rápido de alta dentro de la capa («+ Crear cliente»). */
  formularioCrear?: (ctx: ContextoCrearEntidad<T>) => ReactNode;
  /** Texto del botón fijo «+ Crear cliente» al pie de la lista (con `formularioCrear`). */
  textoCrearNuevo?: string;
  className?: string;
}

const TONO_INSIGNIA_ENTIDAD = {
  advertencia: 'border-line-warning bg-warning-subtle text-warning-text',
  exito: 'border-line-success bg-success-subtle text-success-text',
  neutro: 'border-line bg-subtle text-fg-secondary',
  informacion: 'border-line-brand bg-brand-tint text-brand-deep',
} as const;

function Lista<T>({
  aOpcion,
  buscar,
  onElegir,
  onCrear,
  textos,
  etiqueta,
  grupoExtra,
  debounceMs,
  onCerrar,
  idLista,
  filtros,
  textoCrearNuevo,
}: {
  aOpcion: (item: T) => OpcionEntidad;
  buscar: SelectorEntidadProps<T>['buscar'];
  filtros?: readonly FiltroEntidad[];
  textoCrearNuevo?: string;
  onElegir: (item: T) => void;
  onCrear?: (texto: string) => void;
  textos: Required<Omit<TextosSelectorEntidad, 'crear'>> & { crear: (texto: string) => string };
  etiqueta: string;
  grupoExtra?: ReactNode;
  debounceMs: number;
  onCerrar: () => void;
  idLista: string;
}) {
  const [texto, setTexto] = useState('');
  const [items, setItems] = useState<readonly T[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [activo, setActivo] = useState(0);
  const controlador = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activos, setActivos] = useState<readonly string[]>(() => (filtros ?? []).filter((f) => f.activoPorDefecto).map((f) => f.id));
  const activosRef = useRef(activos);
  activosRef.current = activos;
  const consultaRef = useRef('');

  const ejecutar = useCallback(
    (q: string, conFiltros?: readonly string[]) => {
      consultaRef.current = q;
      controlador.current?.abort();
      const c = new AbortController();
      controlador.current = c;
      setCargando(true);
      setError(false);
      buscar(q, c.signal, conFiltros ?? activosRef.current)
        .then((r) => {
          if (c.signal.aborted) return;
          setItems(r);
          setActivo(0);
        })
        .catch(() => {
          if (!c.signal.aborted) setError(true);
        })
        .finally(() => {
          if (!c.signal.aborted) setCargando(false);
        });
    },
    [buscar],
  );

  useEffect(() => {
    ejecutar('');
    return () => controlador.current?.abort();
  }, [ejecutar]);

  const opciones = items.map(aOpcion);
  const conCrear = !!onCrear && ofrecerCrear(texto, opciones);
  const total = opciones.length + (conCrear ? 1 : 0);
  const estado = estadoListaEntidad({ cargando, error, total: opciones.length, texto });
  const idOpcion = (i: number) => `${idLista}-op-${i}`;

  // El buscador es el combobox: se le ponen los atributos ARIA por ref.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-expanded', 'true');
    el.setAttribute('aria-controls', idLista);
    el.setAttribute('aria-autocomplete', 'list');
    if (total > 0) el.setAttribute('aria-activedescendant', idOpcion(Math.min(activo, total - 1)));
    else el.removeAttribute('aria-activedescendant');
  });

  const elegir = (i: number) => {
    if (i < opciones.length) {
      if (opciones[i].deshabilitada) return;
      onElegir(items[i]);
    } else if (conCrear) {
      onCrear?.(texto.trim());
    }
  };

  const alPulsar = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const s = indiceSiguiente(activo, total, e.key, [...opciones.map((o) => !!o.deshabilitada), false]);
      if (s !== null) {
        e.preventDefault();
        setActivo(s);
      }
    } else if (e.key === 'Enter' && total > 0) {
      e.preventDefault();
      elegir(Math.min(activo, total - 1));
    } else if (e.key === 'Escape' && !texto) {
      e.preventDefault();
      onCerrar();
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-2" onKeyDown={alPulsar}>
      <SearchInput
        ref={inputRef}
        tamano="sm"
        atajo={false}
        autoFocus
        value={texto}
        debounceMs={debounceMs}
        onValueChange={setTexto}
        onChange={(v) => ejecutar(v)}
        cargando={cargando && opciones.length > 0}
        placeholder={textos.buscar}
        etiqueta={textos.buscar}
      />
      {filtros && filtros.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={textos.filtros}>
          {filtros.map((f) => (
            <ChipAlternable
              key={f.id}
              etiqueta={f.etiqueta}
              activo={activos.includes(f.id)}
              onAlternar={() => {
                const siguiente = activos.includes(f.id) ? activos.filter((x) => x !== f.id) : [...activos, f.id];
                setActivos(siguiente);
                ejecutar(consultaRef.current, siguiente);
              }}
            />
          ))}
        </div>
      )}
      <ul id={idLista} role="listbox" aria-label={etiqueta} aria-busy={cargando || undefined} className="flex max-h-72 min-h-0 flex-col gap-0.5 overflow-y-auto">
        {estado === 'cargando' && (
          <li role="presentation" className="flex items-center gap-2 px-2.5 py-3 text-sm text-fg-secondary">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {textos.buscar}
          </li>
        )}
        {estado === 'error' && (
          <li role="presentation" className="flex items-center gap-2 px-2.5 py-3 text-sm text-danger-text">
            <CircleAlert aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {textos.error}
          </li>
        )}
        {(estado === 'inicial' || estado === 'sinResultados') && !conCrear && (
          <li role="presentation" className="px-2.5 py-3 text-sm text-fg-secondary">
            {estado === 'inicial' ? textos.vacio : textos.sinResultados}
          </li>
        )}
        {opciones.map((o, i) => (
          <li
            key={o.id}
            id={idOpcion(i)}
            role="option"
            aria-selected={i === activo}
            aria-disabled={o.deshabilitada || undefined}
            title={o.deshabilitada ? o.motivo : undefined}
            onMouseEnter={() => setActivo(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => elegir(i)}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2',
              i === activo && 'bg-hover',
              o.deshabilitada && 'cursor-not-allowed opacity-60',
            )}
          >
            {filtros && (
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-xs font-semibold text-brand-deep">
                {iniciales(o.titulo)}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5 truncate text-sm font-medium text-fg">
                <span className="truncate">{o.titulo}</span>
                {o.etiqueta && (
                  <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-line-brand bg-brand-tint px-2 text-[11px] font-medium text-brand-deep">
                    {o.etiqueta}
                  </span>
                )}
                {o.pendienteSync && <CloudOff aria-label={textos.pendienteSync} className="size-3.5 shrink-0 text-warning-text" strokeWidth={1.5} />}
              </span>
              {o.subtitulo && <span className="truncate text-xs text-fg-secondary">{o.subtitulo}</span>}
              {o.meta && <span className="truncate text-xs text-fg-muted">{o.meta}</span>}
            </span>
            {o.insignia && (
              <span className={cn('inline-flex h-5 shrink-0 items-center self-center rounded-full border px-2 text-[11px] font-medium tabular-nums', TONO_INSIGNIA_ENTIDAD[o.insignia.tono ?? 'neutro'])}>
                {o.insignia.texto}
              </span>
            )}
          </li>
        ))}
        {conCrear && (
          <li
            id={idOpcion(opciones.length)}
            role="option"
            aria-selected={activo === opciones.length}
            onMouseEnter={() => setActivo(opciones.length)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => elegir(opciones.length)}
            className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-link', activo === opciones.length && 'bg-hover')}
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            <span className="truncate">{textos.crear(texto.trim())}</span>
          </li>
        )}
      </ul>
      {textoCrearNuevo && onCrear && (
        <button
          type="button"
          onClick={() => onCrear(texto.trim())}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {textoCrearNuevo}
        </button>
      )}
      {grupoExtra}
    </div>
  );
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '·';
}

export function SelectorEntidad<T>({
  valor,
  aOpcion,
  buscar,
  onCambiar,
  onQuitar,
  onCrear,
  onVer,
  onEditar,
  icono: Icono,
  layout = 'campo',
  textos: textosProp,
  etiqueta,
  abierto: abiertoProp,
  onAbiertoChange,
  atajo,
  grupoExtra,
  insigniaValor,
  deshabilitado,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalido,
  debounceMs = 300,
  filtros,
  formularioCrear,
  textoCrearNuevo,
  className,
}: SelectorEntidadProps<T>) {
  const t = useKitT();
  const escritorio = useEsEscritorio();
  const [abiertoInterno, setAbiertoInterno] = useState(false);
  const abierto = abiertoProp ?? abiertoInterno;
  const [creando, setCreando] = useState<string | null>(null);
  const cambiarAbierto = (v: boolean) => {
    if (deshabilitado && v) return;
    if (!v) setCreando(null);
    if (abiertoProp === undefined) setAbiertoInterno(v);
    onAbiertoChange?.(v);
  };
  const textos = {
    placeholder: textosProp?.placeholder ?? t('picker.placeholder'),
    buscar: textosProp?.buscar ?? t('picker.buscar'),
    titulo: textosProp?.titulo ?? etiqueta,
    vacio: textosProp?.vacio ?? t('picker.vacio'),
    sinResultados: textosProp?.sinResultados ?? t('picker.sinResultados'),
    error: textosProp?.error ?? t('picker.error'),
    crear: textosProp?.crear ?? ((texto: string) => t('picker.crear', { texto })),
    cambiar: textosProp?.cambiar ?? t('picker.cambiar'),
    quitar: textosProp?.quitar ?? t('picker.quitar'),
    ver: textosProp?.ver ?? t('picker.ver'),
    editar: textosProp?.editar ?? t('picker.editar'),
    pendienteSync: textosProp?.pendienteSync ?? t('picker.pendienteSync'),
    filtros: textosProp?.filtros ?? t('filtros.titulo'),
  };
  const idLista = useId();
  const opcion = valor ? aOpcion(valor) : null;
  const aria = atajo ? ariaAtajo(atajo) : undefined;

  const lista = creando !== null && formularioCrear ? (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
      {formularioCrear({
        texto: creando,
        onCreado: (item) => {
          onCambiar(item);
          cambiarAbierto(false);
        },
        onCancelar: () => setCreando(null),
      })}
    </div>
  ) : (
    <Lista
      aOpcion={aOpcion}
      buscar={buscar}
      filtros={filtros}
      textoCrearNuevo={formularioCrear ? textoCrearNuevo : undefined}
      onElegir={(item) => {
        onCambiar(item);
        cambiarAbierto(false);
      }}
      onCrear={
        formularioCrear
          ? (texto) => setCreando(texto)
          : onCrear
            ? (texto) => {
                cambiarAbierto(false);
                onCrear(texto);
              }
            : undefined
      }
      textos={textos}
      etiqueta={etiqueta}
      grupoExtra={grupoExtra}
      debounceMs={debounceMs}
      onCerrar={() => cambiarAbierto(false)}
      idLista={idLista}
    />
  );

  const botonIcono = (etiquetaBoton: string, IconoBoton: LucideIcon, onClick: () => void) => (
    <button
      type="button"
      aria-label={`${etiquetaBoton}: ${opcion?.titulo ?? ''}`}
      title={etiquetaBoton}
      onClick={onClick}
      disabled={deshabilitado}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
    >
      <IconoBoton aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </button>
  );

  const disparador =
    layout === 'fila' && opcion ? (
      <button
        type="button"
        id={id}
        disabled={deshabilitado}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-keyshortcuts={aria}
        aria-label={`${textos.cambiar} ${etiqueta.toLowerCase()}: ${opcion.titulo}`}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
      >
        {textos.cambiar}
        {atajo && <Kbd tecla={atajo} className="hidden lg:inline-flex" />}
      </button>
    ) : layout === 'fila' ? (
      <button
        type="button"
        id={id}
        disabled={deshabilitado}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-keyshortcuts={aria}
        aria-describedby={describedBy}
        className="flex h-12 w-full items-center gap-2.5 rounded-lg border border-dashed border-line-strong bg-surface px-3 text-left text-sm font-medium text-fg-secondary hover:border-line-brand hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
      >
        <Plus aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
        <span className="flex-1 truncate">{textos.placeholder}</span>
        {atajo && <Kbd tecla={atajo} className="hidden lg:inline-flex" />}
      </button>
    ) : (
      <button
        type="button"
        id={id}
        disabled={deshabilitado}
        role="combobox"
        aria-controls={idLista}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-keyshortcuts={aria}
        aria-describedby={describedBy}
        aria-invalid={invalido || undefined}
        aria-label={opcion ? `${etiqueta}: ${opcion.titulo}` : etiqueta}
        className={cn(
          'flex h-10 w-full min-w-0 items-center gap-2 rounded-md border bg-surface px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
          invalido ? 'border-line-danger' : 'border-line-strong',
          onQuitar && opcion && 'pr-10',
        )}
      >
        <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
        <span className={cn('min-w-0 flex-1 truncate', opcion ? 'text-fg' : 'text-fg-muted')}>{opcion ? opcion.titulo : textos.placeholder}</span>
        {insigniaValor && opcion && <span className="shrink-0">{insigniaValor}</span>}
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
      </button>
    );

  const capa = escritorio ? (
    <PopoverPrimitive.Root open={abierto} onOpenChange={cambiarAbierto}>
      <PopoverPrimitive.Trigger asChild>{disparador}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            'z-50 flex max-w-[calc(100vw-16px)] flex-col rounded-xl border border-line bg-surface text-fg shadow-lg outline-none',
            filtros || formularioCrear ? 'max-h-[min(640px,calc(100dvh-32px))] w-[440px] p-3' : 'w-[360px] p-2',
          )}
        >
          {lista}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  ) : (
    <>
      <span className="contents" onClick={() => cambiarAbierto(true)}>
        {disparador}
      </span>
      <Sheet open={abierto} onOpenChange={cambiarAbierto}>
        <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-3 rounded-t-2xl border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-fg">
          <div className="mx-auto h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
          <SheetTitle className="text-base font-semibold text-fg">{textos.titulo}</SheetTitle>
          <SheetDescription className="sr-only">{textos.buscar}</SheetDescription>
          {lista}
        </SheetContent>
      </Sheet>
    </>
  );

  if (layout === 'fila' && opcion) {
    return (
      <div className={cn('flex min-w-0 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2', className)}>
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Icono className="size-4" strokeWidth={1.5} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 truncate text-sm font-medium text-fg">
            {opcion.titulo}
            {opcion.pendienteSync && <CloudOff aria-label={textos.pendienteSync} className="size-3.5 shrink-0 text-warning-text" strokeWidth={1.5} />}
          </span>
          {(opcion.subtitulo || opcion.meta) && (
            <span className="truncate text-xs text-fg-secondary">{[opcion.subtitulo, opcion.meta].filter(Boolean).join(' · ')}</span>
          )}
        </div>
        {insigniaValor}
        {capa}
        {onVer && botonIcono(textos.ver, Eye, onVer)}
        {onEditar && botonIcono(textos.editar, Pencil, onEditar)}
        {onQuitar && botonIcono(textos.quitar, X, onQuitar)}
      </div>
    );
  }

  return (
    <div className={cn('relative min-w-0', className)}>
      {capa}
      {layout === 'campo' && onQuitar && opcion && (
        <button
          type="button"
          aria-label={`${textos.quitar}: ${opcion.titulo}`}
          onClick={onQuitar}
          disabled={deshabilitado}
          className="absolute right-8 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
