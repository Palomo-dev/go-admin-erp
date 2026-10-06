'use client';

/**
 * Constructor de UN menú del sitio (Figma A/04c «Encabezado», grupos del «Pie de página» y
 * D/04-09): árbol de `MenuLinkRow` con asa, icono del tipo, texto, detalle («Página · /carta»,
 * «Categoría del Inventario · 12 productos»), control «en el menú» y «⋯» (Subir, Bajar, Mover a…, Quitar).
 * Controlado: recibe el menú y devuelve los ítems nuevos con `onCambiar`, para que lo monten
 * Menú y navegación y, cuando el área editor lo adopte, el panel de menús del editor (D/05-20).
 *
 * En el encabezado, las páginas que no están en el menú salen al final atenuadas con la lista
 * tachada (ListX, «Oculto en el menú · la página sigue publicada»; no el ojo tachado, que en el
 * módulo es «Sin publicar»): ese mismo botón las vuelve a poner.
 */
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CornerDownRight, ListMinus, Plus } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo, ZonaSoltarRaiz, type AccionFila } from '@/components/kit';
import type { ItemMenu, MenuSitio, PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import { MenuLinkRow } from '@/components/sitio-web/ui/MenuLinkRow';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';
import { iconoDeItem, iconoDePagina } from './iconosPagina';
import {
  aplanarItems,
  destinosMover,
  moverEntreHermanos,
  moverItem,
  quitarEnlacesAPagina,
  quitarItem,
  tipoEnlace,
  type NodoMenuPlano,
} from './operacionesMenu';
import { esInicio } from './tipoPagina';
import { useArrastreMenu, type ArrastreMenu } from './useArrastreMenu';
import { useTextosPaginas, type TraductorPaginas } from './textos';
import type { CategoriaInventarioMenu } from './tiposPaginas';

export interface ConstructorMenusProps {
  menu: MenuSitio;
  paginas: readonly PaginaSitio[];
  categorias: ReadonlyMap<string, CategoriaInventarioMenu>;
  seleccionado: string | null;
  onSeleccionar: (itemId: string) => void;
  onCambiar: (items: ItemMenu[]) => void;
  soloLectura?: boolean;
  /** Páginas fuera del menú que se listan atenuadas al final (solo el encabezado). */
  ocultas?: readonly PaginaSitio[];
  onMostrarPagina?: (paginaId: string) => void;
  /** Arrastre compartido con la columna de categorías; si falta, el constructor usa el suyo. */
  arrastre?: ArrastreMenu;
  onAnadir?: () => void;
  /** Texto del vacío («El encabezado aún no tiene menú…»). */
  textoVacio: string;
  className?: string;
}

function rutaDe(p: PaginaSitio): string {
  return esInicio(p) ? '/' : `/${p.slug}`;
}

/** Detalle de la fila según el tipo de enlace (A/04c, D/04-09). */
export function detalleEnlace(
  n: NodoMenuPlano,
  paginas: ReadonlyMap<string, PaginaSitio>,
  categorias: ReadonlyMap<string, CategoriaInventarioMenu>,
  t: TraductorPaginas,
): string {
  const { item, nivel } = n;
  const hijos = item.hijos ?? [];
  if (item.tipo === 'page') {
    const p = paginas.get(item.paginaId);
    const ruta = p ? rutaDe(p) : '';
    if (nivel > 0) return t('menu.detalle.subpagina', { ruta });
    if (hijos.some((h) => h.tipo === 'entity' && h.entidad === 'category')) return t('menu.detalle.categoriasSubmenu', { ruta });
    if (hijos.length > 0) return t('menu.detalle.desplegable', { n: hijos.length });
    return t('menu.detalle.pagina', { ruta });
  }
  if (item.tipo === 'entity') {
    const c = categorias.get(item.entidadId);
    return c ? t('menu.detalle.categoria', { n: c.productos }) : t('menu.detalle.categoriaSinConteo');
  }
  if (item.tipo === 'custom') {
    const tipo = tipoEnlace(item);
    const url = item.url.replace(/^tel:/, '').replace(/^https:\/\/wa\.me\//, '+');
    return t(`menu.detalle.${tipo === 'whatsapp' ? 'whatsapp' : tipo === 'telefono' ? 'telefono' : 'externo'}`, { url });
  }
  return item.tipo === 'anchor' ? t('menu.detalle.ancla') : t('menu.detalle.sitio');
}

export function ConstructorMenus({
  menu,
  paginas,
  categorias,
  seleccionado,
  onSeleccionar,
  onCambiar,
  soloLectura,
  ocultas,
  onMostrarPagina,
  arrastre: arrastreExterno,
  onAnadir,
  textoVacio,
  className,
}: ConstructorMenusProps) {
  const t = useTextosPaginas();
  const [mover, setMover] = useState<{ id: string; destino: string | null } | null>(null);
  const porId = useMemo(() => new Map(paginas.map((p) => [p.id, p])), [paginas]);
  const plano = useMemo(() => aplanarItems(menu.items), [menu.items]);
  const interno = useArrastreMenu({
    items: menu.items,
    onCambiar,
    deshabilitado: soloLectura || !!arrastreExterno,
    ayuda: t('menu.arrastrarAnidar'),
  });
  const arrastre = soloLectura ? null : arrastreExterno ?? interno;

  const acciones = (n: NodoMenuPlano, hermanos: number): AccionFila[] => [
    {
      id: 'subir',
      etiqueta: t('menu.accion.subir'),
      icono: ArrowUp,
      deshabilitada: n.indice === 0,
      onSelect: () => onCambiar(moverEntreHermanos(menu.items, n.item.id, -1)),
    },
    {
      id: 'bajar',
      etiqueta: t('menu.accion.bajar'),
      icono: ArrowDown,
      deshabilitada: n.indice >= hermanos - 1,
      onSelect: () => onCambiar(moverEntreHermanos(menu.items, n.item.id, 1)),
    },
    { id: 'mover', etiqueta: t('menu.accion.moverA'), icono: CornerDownRight, onSelect: () => setMover({ id: n.item.id, destino: n.padreId }) },
    {
      id: 'quitar',
      etiqueta: t('menu.accion.quitar'),
      icono: ListMinus,
      destructiva: true,
      separadorAntes: true,
      onSelect: () => onCambiar(quitarItem(menu.items, n.item.id).items),
    },
  ];

  const hermanosDe = (n: NodoMenuPlano) => plano.filter((x) => x.padreId === n.padreId).length;
  const nombreDe = (id: string | null) => (id === null ? '' : plano.find((x) => x.item.id === id)?.item.etiqueta ?? '');
  const itemMover = mover ? plano.find((x) => x.item.id === mover.id) : undefined;
  const destinos = mover ? destinosMover(menu.items, mover.id) : [];

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {plano.length === 0 && (!ocultas || ocultas.length === 0) && <p className="px-2 py-3 text-sm text-fg-secondary">{textoVacio}</p>}
      <ul role="tree" aria-label={menu.nombre} className="flex flex-col gap-1">
        {plano.map((n) => {
          const nodo = arrastre?.nodoItem(n.item.id);
          return (
            <li key={n.item.id} role="treeitem" aria-level={n.nivel + 1} aria-selected={seleccionado === n.item.id}>
              <MenuLinkRow
                etiqueta={n.item.etiqueta}
                tipo={tipoEnlace(n.item)}
                icono={iconoDeItem(n.item, porId)}
                detalle={detalleEnlace(n, porId, categorias, t)}
                nivel={n.nivel}
                seleccionada={seleccionado === n.item.id}
                onSeleccionar={() => onSeleccionar(n.item.id)}
                onAlternarVisible={
                  !soloLectura && n.item.tipo === 'page' && n.nivel === 0 && onMostrarPagina
                    ? () => onCambiar(quitarEnlacesAPagina(menu.items, (n.item as { paginaId: string }).paginaId))
                    : undefined
                }
                acciones={soloLectura ? undefined : acciones(n, hermanosDe(n))}
                arrastre={nodo}
                onMover={soloLectura ? undefined : (d) => onCambiar(moverEntreHermanos(menu.items, n.item.id, d))}
              />
              {nodo?.esDestino && (
                <p
                  aria-live="polite"
                  style={{ paddingLeft: `${32 + (n.nivel + 1) * 24}px` }}
                  className="flex items-center gap-2 py-1 text-[13px] text-brand-deep before:h-px before:w-6 before:bg-brand"
                >
                  {t('menu.soltarAqui', { nombre: n.item.etiqueta })}
                </p>
              )}
            </li>
          );
        })}
        {ocultas?.map((p) => (
          <li key={`oculta-${p.id}`} role="treeitem" aria-level={1} aria-selected={false}>
            <MenuLinkRow
              etiqueta={p.titulo}
              tipo="pagina"
              icono={iconoDePagina(p)}
              detalle={t('menu.ocultoEnMenu')}
              oculta
              onAlternarVisible={soloLectura || !onMostrarPagina ? undefined : () => onMostrarPagina(p.id)}
            />
          </li>
        ))}
      </ul>
      {arrastre && <ZonaSoltarRaiz {...arrastre.raiz} etiqueta={t('menu.soltarRaiz')} className="mt-1" />}
      {!soloLectura && onAnadir && (
        <button
          type="button"
          onClick={onAnadir}
          className="mt-1 inline-flex h-8 items-center gap-2 self-start rounded-md px-2 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('menu.anadirEnlace')}
        </button>
      )}

      <Dialogo
        abierto={mover !== null}
        onAbiertoChange={(v) => !v && setMover(null)}
        titulo={t('menu.moverTitulo', { nombre: itemMover?.item.etiqueta ?? '' })}
        descripcion={t('menu.moverDescripcion')}
        icono={CornerDownRight}
        primario={{
          etiqueta: t('menu.moverConfirmar'),
          onClick: () => {
            if (!mover) return;
            const r = moverItem(menu.items, mover.id, mover.destino);
            if (r.ok) onCambiar(r.items);
            setMover(null);
          },
        }}
      >
        <div role="radiogroup" aria-label={t('menu.moverTitulo', { nombre: itemMover?.item.etiqueta ?? '' })} className="flex flex-col gap-1">
          {destinos.map((d) => {
            const activo = mover?.destino === d;
            return (
              <button
                key={d ?? '__raiz__'}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => mover && setMover({ ...mover, destino: d })}
                className={cn(
                  'flex h-10 items-center rounded-lg border px-3 text-left text-sm',
                  activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg hover:bg-hover',
                )}
              >
                {d === null ? t('menu.moverRaiz') : t('menu.moverDentro', { nombre: nombreDe(d) })}
              </button>
            );
          })}
        </div>
      </Dialogo>
    </div>
  );
}
