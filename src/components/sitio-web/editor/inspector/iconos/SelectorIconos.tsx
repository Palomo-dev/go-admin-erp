'use client';

/**
 * Selector de íconos (Figma «16 Sitio web» 2852:70962, propuesta 8 aprobada el 2026-11-23): el
 * mismo para la cabecera (vista «Íconos» › Dibujo › «Ver más») y para cada botón del menú inferior.
 *
 * Buscador en español (y en inglés), peso de la rejilla (Línea, Relleno, Duotono, Gruesa),
 * sugeridos de la acción, categorías con su cantidad («Más…» abre el resto), «De siempre» (los
 * dibujos que ya usa la tienda, se ven igual que hoy) y la rejilla con carga perezosa: la lista
 * completa (`catalogoPhosphor.generado`) y los dibujos se piden al abrir, y la rejilla pinta de a
 * 48 mientras se baja. «Subir mi ícono» es la fase 2: se ve deshabilitado con «Pronto».
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Upload, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo, SearchInput, SegmentedControl } from '@/components/kit';
import { clasesBadgeTono } from '@/components/ui/badge';
import { CATEGORIAS_ICONOS } from '@/lib/website/v2/catalogoIconos';
import type { FilaCatalogoPhosphor } from '@/lib/website/v2/catalogoPhosphor.generado';
import type { PesoGlifo } from '@/lib/website/v2/glifosTienda';
import { GlifoPhosphor, cargarPhosphor } from './GlifoEditor';
import {
  CATEGORIAS_A_LA_VISTA,
  PASO_REJILLA,
  claveEleccion,
  contarCategorias,
  etiquetaIcono,
  filtrarCatalogo,
  refConPeso,
  sugeridosRef,
  type EleccionIcono,
  type FiltroCategoria,
} from './selectorIconosLogica';

export interface IconoClasico {
  nombre: string;
  etiqueta: string;
  Icono: LucideIcon;
}

/** Pesos de la rejilla (las cuatro tarjetas del estilo). */
const PESOS_REJILLA: readonly PesoGlifo[] = ['regular', 'fill', 'duotone', 'bold'];

let catalogo: Promise<readonly FilaCatalogoPhosphor[]> | null = null;
/** La lista completa, una sola vez y solo al abrir el selector. */
function cargarCatalogo(): Promise<readonly FilaCatalogoPhosphor[]> {
  if (!catalogo) catalogo = import('@/lib/website/v2/catalogoPhosphor.generado').then((m) => m.CATALOGO_PHOSPHOR);
  return catalogo;
}

export function useTSelector() {
  return useTranslations('sitioWeb.editor.selectorIconos');
}

export function SelectorIconos({
  abierto,
  onAbiertoChange,
  nombreAccion,
  accion,
  clasicos,
  actual,
  onElegir,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  /** Nombre del botón o del ícono para el título («Ícono de «Carrito»»). */
  nombreAccion: string;
  /** Acción de los sugeridos (`SUGERIDOS_POR_ACCION`). */
  accion: string;
  /** Los dibujos de siempre de este lugar (Lucide). */
  clasicos: readonly IconoClasico[];
  actual: EleccionIcono | null;
  onElegir: (e: EleccionIcono) => void;
}) {
  const t = useTSelector();
  const [filas, setFilas] = useState<readonly FilaCatalogoPhosphor[] | null>(null);
  const [consulta, setConsulta] = useState('');
  const [categoria, setCategoria] = useState<FiltroCategoria>('todos');
  const [verTodas, setVerTodas] = useState(false);
  const [peso, setPeso] = useState<PesoGlifo>(actual?.tipo === 'phosphor' && actual.ref.weight && PESOS_REJILLA.includes(actual.ref.weight) ? actual.ref.weight : 'regular');
  const [elegido, setElegido] = useState<EleccionIcono | null>(actual);
  const [cuantos, setCuantos] = useState(PASO_REJILLA);
  const centinela = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setElegido(actual);
    let vivo = true;
    cargarCatalogo().then((f) => vivo && setFilas(f)).catch(() => vivo && setFilas([]));
    cargarPhosphor().catch(() => undefined);
    return () => {
      vivo = false;
    };
    // Al abrir: la elección de partida es la guardada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  useEffect(() => setCuantos(PASO_REJILLA), [consulta, categoria]);

  const lista = useMemo(() => (filas ? filtrarCatalogo(filas, consulta, categoria) : []), [filas, consulta, categoria]);
  const conteo = useMemo(() => (filas ? contarCategorias(filas) : null), [filas]);
  const porNombre = useMemo(() => new Map((filas ?? []).map((f) => [f[0], f])), [filas]);
  const sugeridos = useMemo(() => sugeridosRef(accion), [accion]);
  const clasicosVisibles = consulta.trim()
    ? clasicos.filter((c) => c.etiqueta.toLowerCase().includes(consulta.trim().toLowerCase()))
    : clasicos;

  // Carga perezosa: al ver el final de la rejilla se pinta la siguiente tanda.
  useEffect(() => {
    const nodo = centinela.current;
    if (!nodo || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) setCuantos((n) => n + PASO_REJILLA);
    });
    obs.observe(nodo);
    return () => obs.disconnect();
  }, [lista, categoria]);

  const marcado = claveEleccion(elegido);
  const elegirPhosphor = (nombre: string, pesoPropio?: PesoGlifo) => setElegido({ tipo: 'phosphor', ref: pesoPropio ? refConPeso(nombre, pesoPropio) : refConPeso(nombre, peso) });
  const categoriasVistas = verTodas ? CATEGORIAS_ICONOS : CATEGORIAS_ICONOS.slice(0, CATEGORIAS_A_LA_VISTA);
  const mostrarClasicos = categoria === 'clasicos' || (categoria === 'todos' && clasicosVisibles.length > 0);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { nombre: nombreAccion })}
      ancho={520}
      primario={{
        etiqueta: t('usar'),
        deshabilitada: !elegido,
        onClick: () => {
          if (elegido) onElegir(elegido);
          onAbiertoChange(false);
        },
      }}
    >
      <div className="flex flex-col gap-3" data-selector-iconos="">
        <SearchInput value={consulta} onChange={setConsulta} onValueChange={setConsulta} debounceMs={0} placeholder={t('buscar')} etiqueta={t('buscar')} atajo={false} pistaAtajo={false} tamano="sm" autoFocus />
        <SegmentedControl
          etiqueta={t('pesoRejilla')}
          tamano="sm"
          anchoCompleto
          opciones={PESOS_REJILLA.map((p) => ({ valor: p, etiqueta: t(`peso.${p}`) }))}
          valor={peso}
          onValorChange={(p) => {
            setPeso(p);
            if (elegido?.tipo === 'phosphor') setElegido({ tipo: 'phosphor', ref: refConPeso(elegido.ref.name, p) });
          }}
        />

        {!consulta.trim() && sugeridos.length > 0 && (
          <section className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold text-fg-secondary">{t('sugeridos')}</h4>
            <Rejilla>
              {sugeridos.map((r) => (
                <Casilla
                  key={`${r.name}:${r.weight ?? ''}`}
                  etiqueta={etiquetaIcono(r.name, porNombre.get(r.name))}
                  seleccionada={marcado === claveEleccion({ tipo: 'phosphor', ref: r.weight ? r : refConPeso(r.name, peso) })}
                  onClick={() => elegirPhosphor(r.name, r.weight)}
                >
                  <GlifoPhosphor nombre={r.name} peso={r.weight ?? peso} className="size-[22px]" />
                </Casilla>
              ))}
            </Rejilla>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-fg-secondary">{t('categorias')}</h4>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('categorias')}>
            <ChipCategoria activa={categoria === 'todos'} onClick={() => setCategoria('todos')} etiqueta={t('categoria.todos')} cantidad={filas ? filas.length + clasicos.length : null} />
            <ChipCategoria activa={categoria === 'clasicos'} onClick={() => setCategoria('clasicos')} etiqueta={t('categoria.clasicos')} cantidad={clasicos.length} />
            {categoriasVistas.map((c) => (
              <ChipCategoria key={c} activa={categoria === c} onClick={() => setCategoria(c)} etiqueta={t(`categoria.${c}`)} cantidad={conteo ? conteo[c] : null} />
            ))}
            <button type="button" onClick={() => setVerTodas((v) => !v)} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg-secondary hover:bg-hover">
              {verTodas ? t('menos') : t('mas')}
            </button>
          </div>
        </section>

        {mostrarClasicos && (
          <section className="flex flex-col gap-2" data-clasicos="">
            <h4 className="text-[11px] font-medium text-fg-muted">{t('categoria.clasicos')} · {t('clasicosAyuda')}</h4>
            <Rejilla>
              {clasicosVisibles.map((c) => (
                <Casilla key={c.nombre} etiqueta={c.etiqueta} seleccionada={marcado === `l:${c.nombre}`} onClick={() => setElegido({ tipo: 'clasico', nombre: c.nombre })}>
                  <c.Icono aria-hidden="true" className="size-[22px]" strokeWidth={2} />
                </Casilla>
              ))}
            </Rejilla>
          </section>
        )}

        {categoria !== 'clasicos' && (
          <section className="flex flex-col gap-2">
            <h4 className="text-[11px] font-medium text-fg-muted">
              {categoria === 'todos' ? t('categoria.todos') : t(`categoria.${categoria}`)}
              {filas ? ` · ${lista.length}` : ''}
            </h4>
            {!filas ? (
              <p className="flex items-center gap-2 text-xs text-fg-muted">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                {t('cargando')}
              </p>
            ) : lista.length === 0 ? (
              <p className="text-xs text-fg-muted">{t('sinResultados', { q: consulta.trim() })}</p>
            ) : (
              <>
                <Rejilla>
                  {lista.slice(0, cuantos).map((f) => (
                    <Casilla key={f[0]} etiqueta={f[2]} seleccionada={marcado === claveEleccion({ tipo: 'phosphor', ref: refConPeso(f[0], peso) })} onClick={() => elegirPhosphor(f[0])}>
                      <GlifoPhosphor nombre={f[0]} peso={peso} className="size-[22px]" />
                    </Casilla>
                  ))}
                </Rejilla>
                <div ref={centinela} aria-hidden="true" className="h-1" />
                <p className="text-[11px] leading-[14px] text-fg-muted">
                  {cuantos < lista.length ? t('mostrando', { n: Math.min(cuantos, lista.length), total: lista.length }) : t('mostrandoTodos', { n: lista.length })}
                </p>
              </>
            )}
          </section>
        )}

        <SubirMiIcono />
      </div>
    </Dialogo>
  );
}

/** «Subir mi ícono» (fase 2): deshabilitado con «Pronto». */
export function SubirMiIcono({ compacto = false }: { compacto?: boolean }) {
  const t = useTSelector();
  if (compacto) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-fg-muted" aria-disabled="true" title={t('subirAyuda')}>
        <Upload aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        {t('subirMio')} · {t('fase2')}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled
      title={t('subirAyuda')}
      className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-left text-sm text-fg-muted"
    >
      <Upload aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
      <span className="flex-1">{t('subir')}</span>
      <span className={clasesBadgeTono('neutro', 'suave', 'sm')}>{t('pronto')}</span>
    </button>
  );
}

function Rejilla({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-6 gap-1.5">{children}</div>;
}

function Casilla({ etiqueta, seleccionada, onClick, children }: { etiqueta: string; seleccionada: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={seleccionada}
      title={etiqueta}
      onClick={onClick}
      className={cn(
        'flex h-[54px] flex-col items-center justify-center gap-1 rounded-lg border px-1 text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        seleccionada ? 'border-2 border-brand-action bg-brand-tint text-brand-deep' : 'border-transparent bg-subtle hover:bg-hover',
      )}
    >
      {children}
      <span className="w-full truncate text-center text-[9px] leading-[11px]">{etiqueta}</span>
    </button>
  );
}

function ChipCategoria({ activa, onClick, etiqueta, cantidad }: { activa: boolean; onClick: () => void; etiqueta: string; cantidad: number | null }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
        activa ? 'border-brand-action bg-brand-tint text-brand-deep' : 'border-line text-fg-secondary hover:bg-hover',
      )}
    >
      {etiqueta}
      {cantidad !== null && <span className="text-[10px] text-fg-muted">{cantidad}</span>}
    </button>
  );
}
