'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Star,
  Store,
  X,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { CampoFecha, CampoNumero } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { getSectionDefinition, type WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import {
  esVistaPrincipal,
  sumarCambio,
  vistaDe,
  type CambioProducto,
} from '@/lib/services/website/cartaSede';
import {
  conCartaPlatos,
  fijarDestacado,
  fijarOculto,
  fijarTexto,
  leerCartaPlatos,
  moverPlato,
  ordenarCarta,
} from '@/lib/website/carta/contenidoCarta';
import {
  buscarPlatos,
  categoriasDeInventario,
  platosDeCategorias,
  type CategoriaInventario,
  type PlatoInventario,
} from '@/lib/website/carta/inventarioCarta';
import { guardarCartaDeSede, leerCartaDeSede, type DatosSede } from '@/lib/website/carta/clienteCartaSede';
import FieldRenderer from '../fields/FieldRenderer';

/**
 * Constructor de la CARTA (sección `menu_full`) dentro del editor del sitio.
 *
 * Dos columnas: a la izquierda el Inventario de la organización (categorías y búsqueda de
 * productos); a la derecha la carta: secciones (categorías) y platos en orden, que se arrastran,
 * se ocultan, se destacan y llevan descripción o foto propias de la carta. Todo eso va al
 * contenido de la sección (`selected_category_ids`, `carta_platos`, `menus`): pasa por el
 * historial, el borrador y la vista en vivo del lienzo como cualquier cambio de sección.
 *
 * En una sede, además, precio web, agotado (con «hasta») y oculto en esa sede: se escriben en
 * `website_branch_products` con la ruta de siempre (`/api/website/carta-sede`) al pulsar
 * «Guardar cambios de la sede»; mientras tanto el lienzo los muestra en vivo.
 */

export interface ConstructorCartaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number;
  section: WebsitePageSection;
  onCambiarContenido: (content: Record<string, unknown>) => void;
  onCambiarVariante: (variante: string) => void;
  /** Sede que se edita (V2 o outlet legacy), o `null` en el sitio principal. */
  sede: { branchId: number; nombre: string } | null;
  /** Plato que llega seleccionado (clic en el lienzo). */
  platoInicial?: number | null;
  /** Cambios por sede sin guardar, para pintarlos en el lienzo. */
  onCambiosSede?: (branchId: number, cambios: CambioProducto[]) => void;
}

const CAMPO_FOTO = { key: 'foto_url', label: 'Foto propia', type: 'image' as const };

function idsCategorias(content: Record<string, unknown>): number[] {
  const v = content.selected_category_ids;
  return Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
}

export default function ConstructorCarta({
  abierto,
  onAbiertoChange,
  organizationId,
  section,
  onCambiarContenido,
  onCambiarVariante,
  sede,
  platoInicial,
  onCambiosSede,
}: ConstructorCartaProps) {
  const { toast } = useToast();
  const content = useMemo(() => (section.content ?? {}) as Record<string, unknown>, [section.content]);
  const carta = useMemo(() => leerCartaPlatos(content), [content]);
  const elegidas = useMemo(() => idsCategorias(content), [content]);

  const [categorias, setCategorias] = useState<CategoriaInventario[]>([]);
  const [platos, setPlatos] = useState<PlatoInventario[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<PlatoInventario[]>([]);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [arrastrando, setArrastrando] = useState<{ categoria: number | null; id: number } | null>(null);
  const [pestana, setPestana] = useState<'carta' | 'horarios'>('carta');

  const [datosSede, setDatosSede] = useState<DatosSede | null>(null);
  const [borradorSede, setBorradorSede] = useState<Map<number, CambioProducto>>(new Map());
  const [guardandoSede, setGuardandoSede] = useState(false);
  const refsPlato = useRef<Record<number, HTMLElement | null>>({});

  // Categorías del Inventario (una vez por apertura).
  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    categoriasDeInventario(organizationId)
      .then((c) => !cancelado && setCategorias(c))
      .catch(() => !cancelado && setError('No se pudieron cargar las categorías del Inventario.'));
    return () => {
      cancelado = true;
    };
  }, [abierto, organizationId]);

  // Platos de las categorías de la carta (todas si la carta no eligió ninguna).
  const claveCategorias = elegidas.join(',');
  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    setCargando(true);
    platosDeCategorias(organizationId, claveCategorias ? claveCategorias.split(',').map(Number) : null)
      .then((p) => {
        if (!cancelado) {
          setPlatos(p);
          setError(null);
        }
      })
      .catch(() => !cancelado && setError('No se pudieron cargar los platos del Inventario.'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [abierto, organizationId, claveCategorias]);

  // Categorías de la carta en orden: las elegidas, o todas las que tienen platos.
  const categoriasCarta = useMemo<number[]>(() => {
    if (elegidas.length > 0) return elegidas;
    const conPlatos = new Set(platos.map((p) => p.category_id).filter((c): c is number => c !== null));
    return categorias.filter((c) => conPlatos.has(c.id)).map((c) => c.id);
  }, [elegidas, platos, categorias]);
  const nombreCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c.name])), [categorias]);
  const grupos = useMemo(
    () => ordenarCarta(platos, categoriasCarta, carta, { incluirOcultos: true }),
    [platos, categoriasCarta, carta],
  );
  const platoPorId = useMemo(() => new Map(platos.map((p) => [p.id, p])), [platos]);

  // Datos de la sede (precio vigente y ajuste) de las categorías de la carta.
  const claveCartaSede = `${sede?.branchId ?? ''}|${categoriasCarta.join(',')}`;
  useEffect(() => {
    if (!abierto || !sede || categoriasCarta.length === 0) {
      setDatosSede(null);
      return;
    }
    let cancelado = false;
    leerCartaDeSede(sede.branchId, categoriasCarta)
      .then((d) => !cancelado && setDatosSede(d))
      .catch(() => !cancelado && setDatosSede(null));
    return () => {
      cancelado = true;
    };
    // claveCartaSede resume sede y categorías.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, claveCartaSede]);

  // Plato que llega del lienzo: seleccionado y a la vista.
  useEffect(() => {
    if (!abierto || !platoInicial) return;
    setSeleccionado(platoInicial);
    setPestana('carta');
    const t = setTimeout(() => refsPlato.current[platoInicial]?.scrollIntoView({ block: 'center' }), 50);
    return () => clearTimeout(t);
  }, [abierto, platoInicial]);

  // Búsqueda en el Inventario.
  useEffect(() => {
    if (!busqueda.trim()) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    const t = setTimeout(() => {
      buscarPlatos(organizationId, busqueda)
        .then((r) => !cancelado && setResultados(r))
        .catch(() => !cancelado && setResultados([]));
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [busqueda, organizationId]);

  // ── Cambios del contenido de la sección ──
  const cambiarCarta = (siguiente: typeof carta) => onCambiarContenido(conCartaPlatos(content, siguiente));
  const fijarCategorias = (lista: number[]) => onCambiarContenido({ ...content, selected_category_ids: lista });

  const alternarCategoria = (id: number, enCarta: boolean) => {
    const base = categoriasCarta;
    fijarCategorias(enCarta ? (base.includes(id) ? base : [...base, id]) : base.filter((c) => c !== id));
  };
  const moverCategoria = (id: number, delta: -1 | 1) => {
    const lista = [...categoriasCarta];
    const i = lista.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    fijarCategorias(lista);
  };
  const soltarPlato = (categoria: number | null, destinoId: number) => {
    if (!arrastrando || arrastrando.categoria !== categoria) return;
    const grupo = grupos.find((g) => g.categoryId === categoria);
    if (!grupo) return;
    const visibles = grupo.platos.map((p) => p.id);
    cambiarCarta(moverPlato(carta, categoria, visibles, arrastrando.id, visibles.indexOf(destinoId)));
    setArrastrando(null);
  };
  const moverPlatoTeclado = (categoria: number | null, id: number, delta: -1 | 1) => {
    const grupo = grupos.find((g) => g.categoryId === categoria);
    if (!grupo) return;
    const visibles = grupo.platos.map((p) => p.id);
    const i = visibles.indexOf(id);
    if (i + delta < 0 || i + delta >= visibles.length) return;
    cambiarCarta(moverPlato(carta, categoria, visibles, id, i + delta));
  };

  // ── Cambios de la sede (sin guardar → vista en vivo) ──
  const cambiarSede = (productId: number, parche: Omit<CambioProducto, 'product_id'>) => {
    if (!sede) return;
    const siguiente = new Map(borradorSede);
    siguiente.set(productId, sumarCambio(borradorSede.get(productId), productId, parche));
    setBorradorSede(siguiente);
    onCambiosSede?.(sede.branchId, Array.from(siguiente.values()));
  };
  const guardarSede = async () => {
    if (!sede || borradorSede.size === 0) return;
    setGuardandoSede(true);
    try {
      const r = await guardarCartaDeSede(sede.branchId, Array.from(borradorSede.values()));
      setBorradorSede(new Map());
      onCambiosSede?.(sede.branchId, []);
      setDatosSede(await leerCartaDeSede(sede.branchId, categoriasCarta));
      toast({ title: `Carta de ${sede.nombre} guardada`, description: `${r.guardados} plato(s). Se ven en la web en cuanto se actualice la caché.` });
    } catch (e) {
      toast({ title: 'No se guardaron los cambios de la sede', description: e instanceof Error ? e.message : 'Inténtalo de nuevo.', variant: 'destructive' });
    } finally {
      setGuardandoSede(false);
    }
  };

  const plato = seleccionado ? platoPorId.get(seleccionado) ?? resultados.find((r) => r.id === seleccionado) ?? null : null;
  const enCarta = plato ? plato.category_id !== null && categoriasCarta.includes(plato.category_id) : false;
  const texto = plato ? carta.textos[String(plato.id)] ?? {} : {};
  const productoSede = plato && datosSede ? datosSede.productos.get(plato.id) ?? null : null;
  const vistaSede = productoSede ? vistaDe(productoSede, borradorSede.get(productoSede.id)) : null;
  const campoMenus = getSectionDefinition('menu_full')?.contentFields.find((f) => f.key === 'menus');

  // ── Piezas ──
  const filaPlato = (p: PlatoInventario, categoria: number | null) => {
    const oculto = carta.ocultos.includes(p.id);
    const destacado = carta.destacados.includes(p.id);
    const ps = datosSede?.productos.get(p.id);
    const vs = ps ? vistaDe(ps, borradorSede.get(p.id)) : null;
    const activo = seleccionado === p.id;
    return (
      <li
        key={p.id}
        ref={(el) => {
          refsPlato.current[p.id] = el;
        }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          setArrastrando({ categoria, id: p.id });
        }}
        onDragOver={(e) => {
          if (arrastrando?.categoria === categoria) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          soltarPlato(categoria, p.id);
        }}
        onDragEnd={() => setArrastrando(null)}
        data-plato={p.id}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-2 py-1.5',
          activo ? 'border-line-brand bg-brand-tint' : 'border-transparent hover:bg-hover',
          arrastrando?.id === p.id && 'opacity-50',
        )}
      >
        <GripVertical aria-hidden className="h-4 w-4 shrink-0 cursor-grab text-fg-muted" />
        <button
          type="button"
          onClick={() => setSeleccionado(p.id)}
          aria-pressed={activo}
          className={cn('min-w-0 flex-1 truncate text-left text-sm', oculto ? 'text-fg-muted line-through' : activo ? 'text-brand-deep' : 'text-fg')}
        >
          {p.name}
        </button>
        {destacado ? <Star aria-label="Destacado" className="h-3.5 w-3.5 shrink-0 fill-current text-warning" /> : null}
        {vs && !vs.is_listed ? <span className="shrink-0 rounded-full bg-subtle px-1.5 text-[11px] text-fg-secondary">Oculto en la sede</span> : null}
        {vs?.is_sold_out ? <span className="shrink-0 rounded-full bg-warning-subtle px-1.5 text-[11px] text-warning-text">Agotado</span> : null}
        {activo ? (
          <span className="flex shrink-0">
            <button type="button" aria-label="Subir" onClick={() => moverPlatoTeclado(categoria, p.id, -1)} className="rounded p-1 hover:bg-surface">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="Bajar" onClick={() => moverPlatoTeclado(categoria, p.id, 1)} className="rounded p-1 hover:bg-surface">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : null}
        <button
          type="button"
          aria-label={oculto ? 'Mostrar en la carta' : 'Ocultar de la carta'}
          onClick={() => cambiarCarta(fijarOculto(carta, p.id, !oculto))}
          className="shrink-0 rounded p-1 text-fg-secondary hover:bg-surface"
        >
          {oculto ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </li>
    );
  };

  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent side="right" hideCloseButton className="flex w-full max-w-[1080px] flex-col gap-0 bg-surface p-0 sm:max-w-[1080px]">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg font-semibold text-fg">Carta{sede ? ` · ${sede.nombre}` : ''}</SheetTitle>
            <SheetDescription className="text-[13px] text-fg-secondary">
              Orden, ocultos, destacados y textos de la carta van al {sede ? 'sitio de la sede' : 'sitio'}. Los platos y su precio base se crean en Inventario.
            </SheetDescription>
          </div>
          <div role="tablist" className="flex rounded-lg bg-subtle p-1">
            {(['carta', 'horarios'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={pestana === p}
                onClick={() => setPestana(p)}
                className={cn('rounded-md px-3 py-1 text-sm', pestana === p ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-secondary')}
              >
                {p === 'carta' ? 'Carta' : 'Cartas por horario'}
              </button>
            ))}
          </div>
          <button type="button" aria-label="Cerrar" onClick={() => onAbiertoChange(false)} className="rounded-lg p-2 text-fg-secondary hover:bg-hover">
            <X className="h-4 w-4" />
          </button>
        </div>

        {pestana === 'horarios' ? (
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {section.section_variant !== 'tabs' ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-info bg-info-subtle p-3 text-sm text-info-text">
                <Clock aria-hidden className="h-4 w-4" />
                <span className="flex-1">Las cartas por horario (Desayuno, Almuerzo, Bar) se muestran con la variante «Pestañas por horario».</span>
                <button type="button" onClick={() => onCambiarVariante('tabs')} className="h-8 rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium text-fg">
                  Usar pestañas por horario
                </button>
              </div>
            ) : null}
            {campoMenus ? (
              <FieldRenderer
                field={campoMenus}
                value={content.menus}
                onChange={(v) => onCambiarContenido({ ...content, menus: v })}
                organizationId={organizationId}
              />
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Izquierda: Inventario */}
            <aside aria-label="Inventario" className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line p-4">
              <p className="text-xs font-semibold uppercase text-fg-muted">Añadir a la carta</p>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar plato en Inventario…"
                  aria-label="Buscar plato en Inventario"
                  className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              {busqueda.trim() ? (
                <ul className="space-y-1">
                  {resultados.length === 0 ? <li className="text-xs text-fg-muted">Ningún plato coincide.</li> : null}
                  {resultados.map((r) => {
                    const dentro = r.category_id !== null && categoriasCarta.includes(r.category_id);
                    return (
                      <li key={r.id} className="flex items-center gap-2">
                        <button type="button" onClick={() => setSeleccionado(r.id)} className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm hover:bg-hover">
                          {r.name}
                          <span className="block truncate text-xs text-fg-muted">
                            {r.category_id ? nombreCategoria.get(r.category_id) ?? 'Sin categoría' : 'Sin categoría'}
                          </span>
                        </button>
                        {!dentro && r.category_id ? (
                          <button
                            type="button"
                            onClick={() => alternarCategoria(r.category_id as number, true)}
                            className="shrink-0 rounded-lg border border-line-strong px-2 py-1 text-xs text-fg hover:bg-hover"
                          >
                            Añadir su categoría
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <p className="pt-2 text-xs font-semibold uppercase text-fg-muted">Categorías del Inventario</p>
              <ul className="space-y-1">
                {categorias.map((c) => {
                  const dentro = categoriasCarta.includes(c.id);
                  return (
                    <li key={c.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-hover">
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => alternarCategoria(c.id, !dentro)}
                        aria-pressed={dentro}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                          dentro ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong text-fg-secondary',
                        )}
                      >
                        {dentro ? 'En la carta' : (<><Plus aria-hidden className="h-3 w-3" />Añadir</>)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Derecha: la carta */}
            <section aria-label="La carta" className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                {error ? <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{error}</p> : null}
                {cargando ? (
                  <p className="flex items-center gap-2 text-sm text-fg-secondary">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando la carta…
                  </p>
                ) : null}
                {!cargando && grupos.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-fg-secondary">
                    La carta está vacía. Añade categorías del Inventario desde la izquierda.
                  </p>
                ) : null}
                {grupos.map((g, i) => (
                  <div key={String(g.categoryId)} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                        {g.categoryId ? nombreCategoria.get(g.categoryId) ?? `Categoría ${g.categoryId}` : 'Sin categoría'}
                        <span className="ml-2 text-xs font-medium text-fg-secondary">{g.platos.length}</span>
                      </h3>
                      {g.categoryId !== null ? (
                        <>
                          <button type="button" aria-label="Subir sección" disabled={i === 0} onClick={() => moverCategoria(g.categoryId as number, -1)} className="rounded p-1 text-fg-secondary hover:bg-hover disabled:opacity-40">
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" aria-label="Bajar sección" disabled={i === grupos.length - 1} onClick={() => moverCategoria(g.categoryId as number, 1)} className="rounded p-1 text-fg-secondary hover:bg-hover disabled:opacity-40">
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => alternarCategoria(g.categoryId as number, false)} className="rounded px-2 py-1 text-xs text-fg-secondary hover:bg-hover">
                            Quitar
                          </button>
                        </>
                      ) : null}
                    </div>
                    <ul className="space-y-0.5">{g.platos.map((p) => filaPlato(p, g.categoryId))}</ul>
                  </div>
                ))}
              </div>

              {/* Plato elegido */}
              {plato ? (
                <div className="max-h-[48%] shrink-0 space-y-3 overflow-y-auto border-t border-line bg-subtle/40 p-4">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-base font-semibold text-fg">{plato.name}</p>
                    <button type="button" aria-label="Cerrar plato" onClick={() => setSeleccionado(null)} className="rounded p-1 text-fg-secondary hover:bg-hover">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {!enCarta ? (
                    <p className="text-sm text-fg-secondary">Este plato no está en la carta: añade su categoría para que salga.</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-3">
                        <label className="flex items-center justify-between gap-3 text-sm text-fg">
                          Ocultar de la carta
                          <Switch aria-label="Ocultar de la carta" checked={carta.ocultos.includes(plato.id)} onCheckedChange={(v) => cambiarCarta(fijarOculto(carta, plato.id, v))} />
                        </label>
                        <label className="flex items-center justify-between gap-3 text-sm text-fg">
                          Destacar
                          <Switch aria-label="Destacar" checked={carta.destacados.includes(plato.id)} onCheckedChange={(v) => cambiarCarta(fijarDestacado(carta, plato.id, v))} />
                        </label>
                        <label className="block space-y-1 text-sm text-fg">
                          Descripción en la carta
                          <textarea
                            value={texto.descripcion ?? ''}
                            onChange={(e) => cambiarCarta(fijarTexto(carta, plato.id, { descripcion: e.target.value }))}
                            placeholder={plato.description || 'La del producto en Inventario'}
                            maxLength={500}
                            rows={3}
                            className="w-full rounded-lg border border-line-strong bg-surface p-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand"
                          />
                        </label>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-fg">Foto en la carta</p>
                        <FieldRenderer
                          field={CAMPO_FOTO}
                          value={texto.foto_url ?? ''}
                          onChange={(v) => cambiarCarta(fijarTexto(carta, plato.id, { foto_url: typeof v === 'string' ? v : '' }))}
                          organizationId={organizationId}
                        />
                        <p className="text-xs text-fg-muted">Vacío: la foto del producto en Inventario.</p>
                      </div>
                    </div>
                  )}

                  {sede ? (
                    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-fg">
                        <Store aria-hidden className="h-4 w-4" /> En {sede.nombre}
                      </p>
                      {!productoSede || !vistaSede ? (
                        <p className="text-xs text-fg-muted">Cargando los datos de la sede…</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <span className="text-fg-secondary">Precio web</span>
                            <CampoNumero
                              valor={vistaSede.web_price}
                              onValorChange={(n) => cambiarSede(plato.id, { web_price: n })}
                              decimales={2}
                              minimo={0}
                              placeholder={productoSede.precio_vigente !== null ? String(productoSede.precio_vigente) : 'Sin precio'}
                              disabled={!datosSede?.puedeEditar}
                              tamano="sm"
                              className="w-36"
                            />
                            <span className="text-xs text-fg-muted">
                              Vacío: el de Inventario{productoSede.precio_origen === 'sede' ? ' para la sede' : ''}.
                            </span>
                          </div>
                          <label className="flex items-center justify-between gap-3 text-sm text-fg">
                            Oculto en esta sede
                            <Switch aria-label={`Oculto en ${sede.nombre}`} checked={!vistaSede.is_listed} disabled={!datosSede?.puedeEditar} onCheckedChange={(v) => cambiarSede(plato.id, { is_listed: !v })} />
                          </label>
                          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg">
                            <span className="flex items-center gap-3">
                              Agotado
                              <Switch aria-label={`Agotado en ${sede.nombre}`} checked={vistaSede.is_sold_out} disabled={!datosSede?.puedeEditar} onCheckedChange={(v) => cambiarSede(plato.id, { is_sold_out: v })} />
                            </span>
                            {vistaSede.is_sold_out ? (
                              <CampoFecha
                                valor={vistaSede.agotado_hasta}
                                onValorChange={(d) => cambiarSede(plato.id, { is_sold_out: true, agotado_hasta: d || null })}
                                min={datosSede?.hoy}
                                hoy={datosSede?.hoy}
                                limpiable
                                placeholder="Hasta (opcional)"
                                disabled={!datosSede?.puedeEditar}
                                tamano="sm"
                              />
                            ) : null}
                          </div>
                          {!esVistaPrincipal(vistaSede) ? (
                            <button
                              type="button"
                              onClick={() => cambiarSede(plato.id, { restablecer: true })}
                              className="inline-flex items-center gap-1 text-xs text-fg-secondary hover:text-fg"
                            >
                              <RotateCcw aria-hidden className="h-3 w-3" /> Como el sitio principal
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-fg-muted">
                      Precio web, agotado y oculto por sede se editan desde el sitio de cada sede o en Sitio web › Carta por sede.
                    </p>
                  )}
                </div>
              ) : null}

              {sede && borradorSede.size > 0 ? (
                <div className="flex items-center gap-3 border-t border-line px-4 py-3">
                  <p className="flex-1 text-sm text-fg-secondary">
                    {borradorSede.size} cambio(s) de {sede.nombre} sin guardar. Se ven en el lienzo; la web no cambia hasta guardar.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setBorradorSede(new Map());
                      onCambiosSede?.(sede.branchId, []);
                    }}
                    className="h-9 rounded-lg border border-line-strong px-3 text-sm text-fg hover:bg-hover"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => void guardarSede()}
                    disabled={guardandoSede}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-action px-3 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover disabled:opacity-50"
                  >
                    {guardandoSede ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Guardar cambios de la sede
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
