'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Expand, Grid3x3, Info, Magnet, Maximize, Minus, Plus, Redo2, Save, Trash2, Undo2 } from 'lucide-react';
import { KbdButton, TabBar } from '@/components/kit';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/utils/Utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { VistaMesaPlano } from './estadoMesaPlano';
import { MesaTile } from './MesaTile';
import { PanelMesaPlano } from './PanelMesaPlano';
import { PanelZonaPlano } from './PanelZonaPlano';
import {
  aplicar,
  ajustarARejilla,
  actualizarMesa,
  cajaDeZona,
  cajaMesa,
  cajaTotal,
  cambiosPlano,
  colocarMesas,
  colorDeZona,
  deshacer,
  duplicarMesa,
  iniciarHistorial,
  limitarZoom,
  mesasDeZona,
  moverZona,
  quitarMesa,
  rehacer,
  siguienteNombre,
  totalCambios,
  zoomAjustar,
  REJILLA,
  COLORES_ZONA,
  type CambiosPlano,
  type EstadoEditor,
  type MesaEnPlano,
  type ZonaEnPlano,
} from './planoMesasLogica';
import { tamanoEnPlanoBase } from './estadoMesaPlano';

/**
 * Plano del salón (Figma 870:103527; editor 870:104583 y 870:580140; celular
 * 870:582126): pestañas por zona, recuadro punteado de la zona con su
 * etiqueta, cada mesa con su forma y estado, resumen al tocarla, zoom
 * (− 100 % + · Ajustar · pantalla completa) y «Editar plano» (escritorio y
 * tableta): arrastrar, flechas, deshacer, duplicar, eliminar, + Mesa, + Zona y
 * «Guardar cambios (n)». En el celular solo se mira.
 */
export const TODAS = '__todas__';

export interface PlanoMesasProps {
  /** Mesas que pasan los filtros (las que se ven). */
  vistas: readonly VistaMesaPlano[];
  /** Todas las mesas de la sede (el editor trabaja con todas). */
  todas: readonly VistaMesaPlano[];
  zonas: readonly ZonaEnPlano[];
  zonaActiva: string;
  onZonaActivaChange: (zona: string) => void;
  formatear: (n: number) => string;
  seleccionId: string | null;
  onSeleccionar: (id: string | null) => void;
  /** Resumen de la mesa en el popover (escritorio y tableta). */
  resumen?: (vista: VistaMesaPlano) => ReactNode;
  /** Celular: sin popover (la página abre la hoja) ni edición. */
  movil?: boolean;
  puedeEditar: boolean;
  editando: boolean;
  onEditandoChange: (editando: boolean) => void;
  /** Nº de cambios sin guardar (lo pinta la barra de la página). */
  onCambiosChange?: (n: number) => void;
  onGuardar: (cambios: CambiosPlano, estado: EstadoEditor) => Promise<boolean>;
  prefijoMesa: string;
  /** Celular: las mesas se acomodan en filas de N (no caben en sus posiciones del plano). */
  reflujo?: number;
  className?: string;
}

const PADDING = 16;

export function PlanoMesas({
  vistas,
  todas,
  zonas,
  zonaActiva,
  onZonaActivaChange,
  formatear,
  seleccionId,
  onSeleccionar,
  resumen,
  movil,
  puedeEditar,
  editando,
  onEditandoChange,
  onCambiosChange,
  onGuardar,
  prefijoMesa,
  reflujo,
  className,
}: PlanoMesasProps) {
  const t = useTranslations('posMesasPlano.plano');
  const te = useTranslations('posMesasPlano.editor');
  const contenedor = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [rejilla, setRejilla] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [zonaEditada, setZonaEditada] = useState<string | null>(null);
  const panelAlLado = useMediaQuery('(min-width: 1280px)');

  const ordenZonas = useMemo(() => [...zonas].sort((a, b) => a.orden - b.orden), [zonas]);

  // Estado guardado (punto de partida del editor) y el historial del editor.
  const guardado = useMemo<EstadoEditor>(
    () => ({
      mesas: reflujo
        ? colocarMesas(todas.map((v) => ({ ...v, x: null, y: null })), ordenZonas.map((z) => z.nombre), reflujo)
        : colocarMesas(todas, ordenZonas.map((z) => z.nombre)),
      zonas: ordenZonas.map((z) => ({ ...z })),
      borradas: [],
    }),
    [todas, ordenZonas, reflujo],
  );
  const [historial, setHistorial] = useState(() => iniciarHistorial(guardado));
  useEffect(() => {
    if (!editando) setHistorial(iniciarHistorial(guardado));
  }, [guardado, editando]);
  const estado = editando ? historial.presente : guardado;
  const cambios = useMemo(() => cambiosPlano(guardado, historial.presente), [guardado, historial.presente]);
  const nCambios = editando ? totalCambios(cambios) : 0;
  useEffect(() => onCambiosChange?.(nCambios), [nCambios, onCambiosChange]);

  const vistasPorId = useMemo(() => new Map(todas.map((v) => [v.id, v])), [todas]);
  const visibles = useMemo(() => new Set(vistas.map((v) => v.id)), [vistas]);

  // Pestañas: zonas con su número de mesas y «Todas».
  const zonasEstado = useMemo(() => [...estado.zonas].sort((a, b) => a.orden - b.orden), [estado.zonas]);
  const pestanas = useMemo(
    () => [
      ...zonasEstado.map((z) => ({ valor: z.nombre, etiqueta: z.nombre, contador: estado.mesas.filter((m) => m.zona === z.nombre).length })),
      ...(estado.mesas.some((m) => !m.zona) ? [{ valor: '', etiqueta: t('sinZona'), contador: estado.mesas.filter((m) => !m.zona).length }] : []),
      { valor: TODAS, etiqueta: t('todas'), contador: estado.mesas.length },
    ],
    [zonasEstado, estado.mesas, t],
  );

  // Zonas que se dibujan y mesas de cada una (en edición se ven todas, aunque haya filtros).
  const zonasDibujo = useMemo(() => {
    const nombres: Array<string | null> = zonaActiva === TODAS ? [...zonasEstado.map((z) => z.nombre), null] : [zonaActiva === '' ? null : zonaActiva];
    return nombres
      .map((nombre) => {
        const mesas = mesasDeZona(estado.mesas, nombre).filter((m) => editando || visibles.has(m.id));
        const z = zonasEstado.find((x) => x.nombre === nombre);
        return { nombre, color: nombre ? colorDeZona(nombre, z?.color) : '#64748B', mesas, caja: cajaDeZona(mesasDeZona(estado.mesas, nombre)) };
      })
      .filter((z) => z.mesas.length > 0 || (editando && z.nombre !== null && zonaActiva !== TODAS));
  }, [zonaActiva, zonasEstado, estado.mesas, editando, visibles]);

  const total = useMemo(() => cajaTotal(zonasDibujo.map((z) => z.caja)), [zonasDibujo]);
  const origen = { x: total.x, y: total.y };
  const lienzo = { w: Math.max(total.w + PADDING * 2, 600), h: Math.max(total.h + PADDING * 2, 360) };

  const ajustar = useCallback(() => {
    const el = area.current;
    if (!el) return;
    setZoom(zoomAjustar({ x: 0, y: 0, w: total.w + PADDING * 2, h: total.h + PADDING * 2 }, el.clientWidth, movil ? Number.MAX_SAFE_INTEGER : el.clientHeight, 4));
    el.scrollTo({ left: 0, top: 0 });
  }, [total.w, total.h, movil]);
  const zonaAjustada = useRef<string | null>(null);
  useEffect(() => {
    // Al cambiar de zona (y al entrar), el plano se ajusta solo.
    if (zonaAjustada.current === zonaActiva || total.w === 0) return;
    zonaAjustada.current = zonaActiva;
    ajustar();
  }, [zonaActiva, total.w, ajustar]);

  // ── Edición ──────────────────────────────────────────────────────────────
  const cambiar = (siguiente: EstadoEditor) => setHistorial((h) => aplicar(h, siguiente));
  const seleccion = editando && seleccionId ? estado.mesas.find((m) => m.id === seleccionId) ?? null : null;
  const vistaSel = seleccion ? vistasPorId.get(seleccion.id) : undefined;
  const cuentaAbierta = !!vistaSel && (vistaSel.estado === 'ocupada' || vistaSel.estado === 'por_cobrar');

  const arrastre = useRef<{ id: string; x0: number; y0: number; mx: number; my: number; movio: boolean } | null>(null);
  const alPresionar = (e: ReactPointerEvent<HTMLButtonElement>, m: MesaEnPlano) => {
    if (!editando) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { id: m.id, x0: m.x, y0: m.y, mx: e.clientX, my: e.clientY, movio: false };
    onSeleccionar(m.id);
    setZonaEditada(null);
  };
  const alMover = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = (e.clientX - a.mx) / zoom;
    const dy = (e.clientY - a.my) / zoom;
    if (!a.movio && Math.abs(dx) + Math.abs(dy) < 3) return;
    a.movio = true;
    // Mientras arrastra, se mueve sin historial; al soltar queda un solo paso.
    setHistorial((h) => ({ ...h, presente: actualizarMesa(h.presente, a.id, { x: Math.max(0, a.x0 + dx), y: Math.max(0, a.y0 + dy) }) }));
  };
  const alSoltar = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a || !a.movio) return;
    setHistorial((h) => {
      const m = h.presente.mesas.find((x) => x.id === a.id);
      if (!m) return h;
      const final = actualizarMesa(h.presente, a.id, { x: ajustarARejilla(m.x), y: ajustarARejilla(m.y) });
      const previo = actualizarMesa(h.presente, a.id, { x: a.x0, y: a.y0 });
      return { pasado: [...h.pasado, previo].slice(-50), presente: final, futuro: [] };
    });
  };

  const alTecla = (e: React.KeyboardEvent) => {
    if (!editando || !seleccion) return;
    const paso = e.shiftKey ? REJILLA * 5 : REJILLA;
    const d = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
    if (d) {
      e.preventDefault();
      cambiar(actualizarMesa(estado, seleccion.id, { x: Math.max(0, seleccion.x + d[0]), y: Math.max(0, seleccion.y + d[1]) }));
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !cuentaAbierta && (e.target as HTMLElement).tagName === 'BUTTON') {
      e.preventDefault();
      cambiar(quitarMesa(estado, seleccion.id));
      onSeleccionar(null);
    }
  };

  useEffect(() => {
    if (!editando) return;
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      setHistorial((hh) => (e.shiftKey ? rehacer(hh) : deshacer(hh)));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [editando]);

  const zonaParaNueva = zonaActiva !== TODAS && zonaActiva !== '' ? zonaActiva : zonasEstado[0]?.nombre ?? null;
  const nuevaMesa = () => {
    const caja = cajaDeZona(mesasDeZona(estado.mesas, zonaParaNueva));
    const id = `nueva-${Date.now()}`;
    const m: MesaEnPlano = {
      id,
      nombre: siguienteNombre(estado.mesas, prefijoMesa),
      zona: zonaParaNueva,
      capacidad: 4,
      forma: 'cuadrada',
      tamano: 'm',
      rotacion: 0,
      x: caja ? ajustarARejilla(caja.x + 24) : 40,
      y: caja ? ajustarARejilla(caja.y + caja.h + 40) : 60,
      nueva: true,
    };
    cambiar({ ...estado, mesas: [...estado.mesas, m] });
    onSeleccionar(id);
    setZonaEditada(null);
  };
  const nuevaZona = () => {
    let n = zonasEstado.length + 1;
    while (zonasEstado.some((z) => z.nombre === te('zonaNueva', { n }))) n += 1;
    const nombre = te('zonaNueva', { n });
    cambiar({ ...estado, zonas: [...estado.zonas, { nombre, color: COLORES_ZONA[zonasEstado.length % COLORES_ZONA.length], orden: zonasEstado.length, original: null }] });
    onZonaActivaChange(nombre);
    setZonaEditada(nombre);
    onSeleccionar(null);
  };
  const alinear = () => cambiar({ ...estado, mesas: estado.mesas.map((m) => ({ ...m, x: ajustarARejilla(m.x), y: ajustarARejilla(m.y) })) });

  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar(cambios, historial.presente);
    setGuardando(false);
    if (ok) {
      onEditandoChange(false);
      onSeleccionar(null);
      setZonaEditada(null);
    }
  };
  const cancelar = () => {
    setHistorial(iniciarHistorial(guardado));
    onEditandoChange(false);
    onSeleccionar(null);
    setZonaEditada(null);
  };

  const zonaPanel = editando && zonaEditada ? zonasEstado.find((z) => z.nombre === zonaEditada) ?? null : null;
  const renombrarZona = (anterior: string, nuevo: string) => {
    cambiar({
      ...estado,
      zonas: estado.zonas.map((z) => (z.nombre === anterior ? { ...z, nombre: nuevo } : z)),
      mesas: estado.mesas.map((m) => (m.zona === anterior ? { ...m, zona: nuevo } : m)),
    });
    if (zonaActiva === anterior) onZonaActivaChange(nuevo);
    setZonaEditada(nuevo);
  };

  const pantallaCompleta = () => {
    const el = contenedor.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const botonBarra =
    'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-fg hover:bg-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

  const panelLateral =
    editando && (seleccion || zonaPanel) ? (
      seleccion ? (
        <PanelMesaPlano
          mesa={seleccion}
          zonas={zonasEstado.map((z) => z.nombre)}
          comensales={vistaSel?.comensales ?? 0}
          cuentaAbierta={cuentaAbierta}
          onCambio={(c) => cambiar(actualizarMesa(estado, seleccion.id, c))}
          onDuplicar={() => {
            const id = `nueva-${Date.now()}`;
            cambiar(duplicarMesa(estado, seleccion.id, id, prefijoMesa));
            onSeleccionar(id);
          }}
          onEliminar={() => {
            cambiar(quitarMesa(estado, seleccion.id));
            onSeleccionar(null);
          }}
          onCerrar={() => onSeleccionar(null)}
          className="w-full xl:w-[320px]"
        />
      ) : zonaPanel ? (
        <PanelZonaPlano
          zona={zonaPanel}
          posicion={zonasEstado.findIndex((z) => z.nombre === zonaPanel.nombre)}
          total={zonasEstado.length}
          mesas={estado.mesas.filter((m) => m.zona === zonaPanel.nombre).length}
          onCambio={(c) => (c.nombre !== undefined ? renombrarZona(zonaPanel.nombre, c.nombre) : cambiar({ ...estado, zonas: estado.zonas.map((z) => (z.nombre === zonaPanel.nombre ? { ...z, ...c } : z)) }))}
          onMover={(d) => cambiar({ ...estado, zonas: moverZona(estado.zonas, zonaPanel.nombre, d) })}
          onEliminar={() => {
            cambiar({ ...estado, zonas: estado.zonas.filter((z) => z.nombre !== zonaPanel.nombre).map((z, i) => ({ ...z, orden: i })) });
            setZonaEditada(null);
            onZonaActivaChange(TODAS);
          }}
          onCerrar={() => setZonaEditada(null)}
          className="w-full xl:w-[320px]"
        />
      ) : null
    ) : null;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {editando && (
        <div role="toolbar" aria-label={te('barra')} className="flex flex-wrap items-center gap-1 rounded-xl border border-line-brand bg-brand-tint px-3 py-2">
          <span className="mr-1 hidden h-6 items-center rounded-full bg-brand-action px-2 text-xs font-semibold text-fg-on-brand xl:inline-flex">{te('editando')}</span>
          <button type="button" className={cn(botonBarra, 'size-8 justify-center border border-line-strong bg-surface px-0')} aria-label={te('deshacer')} disabled={historial.pasado.length === 0} onClick={() => setHistorial(deshacer)}>
            <Undo2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
          <button type="button" className={cn(botonBarra, 'size-8 justify-center border border-line-strong bg-surface px-0')} aria-label={te('rehacer')} disabled={historial.futuro.length === 0} onClick={() => setHistorial(rehacer)}>
            <Redo2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
          <button type="button" className={cn(botonBarra, 'hidden xl:inline-flex')} onClick={alinear}>
            <Magnet aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {te('alinear')}
          </button>
          <button
            type="button"
            className={botonBarra}
            disabled={!seleccion}
            onClick={() => {
              if (!seleccion) return;
              const id = `nueva-${Date.now()}`;
              cambiar(duplicarMesa(estado, seleccion.id, id, prefijoMesa));
              onSeleccionar(id);
            }}
          >
            <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {te('duplicar')}
          </button>
          <button
            type="button"
            className={cn(botonBarra, 'hidden xl:inline-flex')}
            disabled={!seleccion || cuentaAbierta}
            onClick={() => {
              if (!seleccion) return;
              cambiar(quitarMesa(estado, seleccion.id));
              onSeleccionar(null);
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {te('eliminar')}
          </button>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
          <KbdButton variante="secundario" tamano="sm" icono={Plus} onClick={nuevaMesa}>
            {te('botonMesa')}
          </KbdButton>
          <KbdButton variante="secundario" tamano="sm" icono={Plus} onClick={nuevaZona}>
            {te('botonZona')}
          </KbdButton>
          <span className="flex-1" />
          <KbdButton variante="fantasma" tamano="sm" onClick={cancelar} disabled={guardando}>
            {te('cancelar')}
          </KbdButton>
          <KbdButton variante="primario" tamano="sm" icono={Save} onClick={() => void guardar()} cargando={guardando} disabled={nCambios === 0}>
            {nCambios > 0 ? te('guardarN', { n: nCambios }) : te('guardar')}
          </KbdButton>
        </div>
      )}

      {!movil && <TabBar id="plano-zonas" etiqueta={t('zonas')} pestanas={pestanas} valor={zonaActiva} onValorChange={(v) => { onZonaActivaChange(v); onSeleccionar(null); }} />}

      {movil && (
        <p className="flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2 text-[13px] text-info-text">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {t('editarEnPantallaGrande')}
        </p>
      )}

      <div className="flex min-h-0 gap-4">
        <div
          ref={contenedor}
          className="relative h-[calc(100dvh-340px)] min-h-[420px] min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-subtle sm:min-h-[560px]"
          onKeyDown={alTecla}
        >
          <div ref={area} className="absolute inset-0 overflow-auto" onClick={(e) => e.target === e.currentTarget && onSeleccionar(null)}>
            <div
              className="relative"
              style={{
                width: lienzo.w * zoom,
                height: lienzo.h * zoom,
                backgroundImage: editando && rejilla ? 'linear-gradient(to right, rgb(var(--grid-line, 148 163 184) / 0.18) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--grid-line, 148 163 184) / 0.18) 1px, transparent 1px)' : undefined,
                backgroundSize: editando && rejilla ? `${REJILLA * zoom}px ${REJILLA * zoom}px` : undefined,
              }}
              onClick={(e) => e.target === e.currentTarget && (onSeleccionar(null), setZonaEditada(null))}
            >
              <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${zoom})`, width: lienzo.w, height: lienzo.h }}>
                {zonasDibujo.map((z) => {
                  const caja = z.caja ?? { x: 0, y: 0, w: 320, h: 180 };
                  return (
                    <div key={z.nombre ?? 'sin-zona'}>
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute rounded-2xl border-2 border-dashed"
                        style={{ left: caja.x - origen.x + PADDING, top: caja.y - origen.y + PADDING, width: caja.w, height: caja.h, borderColor: z.color }}
                      />
                      {z.nombre && (
                        <button
                          type="button"
                          disabled={!editando}
                          onClick={() => {
                            setZonaEditada(z.nombre);
                            onSeleccionar(null);
                          }}
                          className="absolute -translate-y-1/2 rounded-md px-2 py-0.5 text-[13px] font-semibold text-white disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          style={{ left: caja.x - origen.x + PADDING + 16, top: caja.y - origen.y + PADDING, backgroundColor: z.color }}
                        >
                          {z.nombre}
                        </button>
                      )}
                      {z.mesas.length === 0 && (
                        <p
                          className="absolute text-[13px] text-fg-secondary"
                          style={{ left: caja.x - origen.x + PADDING + 24, top: caja.y - origen.y + PADDING + 48 }}
                        >
                          {te('zonaVacia')}
                        </p>
                      )}
                      {z.mesas.map((m) => {
                        const vista = vistasPorId.get(m.id) ?? vistaNueva(m);
                        const base = tamanoEnPlanoBase(m.forma, m.tamano);
                        const c = cajaMesa(m);
                        const sel = seleccionId === m.id;
                        const tile = (
                          <MesaTile
                            vista={{ ...vista, nombre: m.nombre, forma: m.forma, capacidad: m.capacidad }}
                            densidad="plano"
                            formatear={formatear}
                            seleccionada={sel}
                            onPointerDown={(e) => alPresionar(e, m)}
                            onPointerMove={alMover}
                            onPointerUp={alSoltar}
                            onClick={() => !editando && onSeleccionar(sel ? null : m.id)}
                            className={cn(editando && 'cursor-grab touch-none active:cursor-grabbing', !editando && !visibles.has(m.id) && 'opacity-40')}
                            estiloPlano={{
                              left: m.x - origen.x + PADDING + (c.w - base.w) / 2,
                              top: m.y - origen.y + PADDING + (c.h - base.h) / 2,
                              width: base.w,
                              height: base.h,
                              transform: m.rotacion ? `rotate(${m.rotacion}deg)` : undefined,
                            }}
                          />
                        );
                        if (!sel || editando || movil || !resumen) return <span key={m.id}>{tile}</span>;
                        return (
                          <Popover key={m.id} open onOpenChange={(o) => !o && onSeleccionar(null)}>
                            <PopoverAnchor asChild>{tile}</PopoverAnchor>
                            <PopoverContent side="right" align="start" sideOffset={12} collisionPadding={16} className="w-[280px] rounded-xl border-line bg-surface p-4 text-fg shadow-lg">
                              {resumen(vista)}
                            </PopoverContent>
                          </Popover>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {!editando && puedeEditar && !movil && (
            <KbdButton variante="secundario" tamano="sm" onClick={() => onEditandoChange(true)} className="absolute right-4 top-4">
              {t('editar')}
            </KbdButton>
          )}

          <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-md">
            <button type="button" aria-label={t('alejar')} onClick={() => setZoom((z) => limitarZoom(z - 0.1))} className="flex size-8 items-center justify-center rounded-md text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <Minus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <span className="w-12 text-center text-[13px] tabular-nums text-fg" aria-live="polite">
              {Math.round(zoom * 100)} %
            </span>
            <button type="button" aria-label={t('acercar')} onClick={() => setZoom((z) => limitarZoom(z + 0.1))} className="flex size-8 items-center justify-center rounded-md text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <button type="button" onClick={ajustar} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <Maximize aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('ajustar')}
            </button>
            {editando ? (
              <button
                type="button"
                aria-pressed={rejilla}
                onClick={() => setRejilla((r) => !r)}
                className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', rejilla ? 'bg-brand-tint text-brand' : 'text-fg')}
              >
                <Grid3x3 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('rejilla')}
              </button>
            ) : (
              <button type="button" aria-label={t('pantallaCompleta')} onClick={pantallaCompleta} className="flex size-8 items-center justify-center rounded-md text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <Expand aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            )}
          </div>

          {/* Tableta: el panel flota sobre el plano (870:580140). */}
          {panelLateral && !panelAlLado && <div className="absolute right-3 top-3 z-10 max-h-[calc(100%-24px)] w-[320px] overflow-y-auto">{panelLateral}</div>}
        </div>
        {/* Escritorio: el panel va al lado del plano (870:104583). */}
        {panelLateral && panelAlLado && <div className="shrink-0">{panelLateral}</div>}
      </div>
    </div>
  );
}

/** Vista de una mesa creada en el editor (aún sin estado en la base). */
function vistaNueva(m: MesaEnPlano): VistaMesaPlano {
  return {
    id: m.id,
    nombre: m.nombre,
    numero: m.nombre,
    zona: m.zona,
    estado: 'libre',
    capacidad: m.capacidad,
    comensales: 0,
    minutos: null,
    importe: 0,
    productos: 0,
    mesero: null,
    reservaHora: null,
    reservaNombre: null,
    platosListos: 0,
    abandonada: false,
    forma: m.forma,
    tamano: m.tamano,
    x: m.x,
    y: m.y,
    rotacion: m.rotacion,
  };
}
