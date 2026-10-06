'use client';

/**
 * «Categorías de esta carta» (Figma B/13-02, columna derecha): grupos por
 * categoría del inventario, arrastrables, con sus productos. Por producto solo
 * se deciden las EXCEPCIONES de esta carta (B/13-07 nota 3): destacar, ocultar
 * en esta carta y el orden. Precio, foto y modificadores son de Inventario
 * («Editar en inventario»). Al pie, la leyenda de etiquetas de dieta.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { EyeOff, Eye, GripVertical, PenSquare, Plus, Star, Trash2 } from 'lucide-react';
import { Dialogo, FormField, RowActionsMenu, Tarjeta, clasesBoton, useArrastreArbol } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import { mover, type CategoriaCarta, type EtiquetaProductoCarta, type ProductoCarta } from '@/lib/website/carta';
import { EtiquetaDieta } from '../../ui/EtiquetaDieta';
import { formatearPrecio } from '../../ui/PriceTag';
import { enlacesConfiguracion } from '../enlaces';
import type { TraductorConfiguracion } from '../textos';
import { moverConTeclado } from './teclado';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../../ui/iconosSitio';

export interface CategoriasCartaProps {
  t: TraductorConfiguracion;
  categorias: CategoriaCarta[];
  disponibles: { id: number; nombre: string }[];
  moneda: string;
  onCambiar: (categorias: CategoriaCarta[]) => void;
  deshabilitado?: boolean;
}

/** Fija el orden de los productos de una categoría (todos pasan a tener orden propio). */
export function conOrden(productos: readonly ProductoCarta[]): ProductoCarta[] {
  return productos.map((p, i) => ({ ...p, orden: i }));
}

function FilaProducto({
  t,
  producto: p,
  moneda,
  onCambiar,
  arrastre,
  onMover,
  deshabilitado,
}: {
  t: TraductorConfiguracion;
  producto: ProductoCarta;
  moneda: string;
  onCambiar: (p: ProductoCarta) => void;
  arrastre?: ReturnType<ReturnType<typeof useArrastreArbol>['nodo']>;
  onMover: (dir: -1 | 1) => void;
  deshabilitado?: boolean;
}) {
  const inventario = enlacesConfiguracion.producto(p.id);
  return (
    <div
      {...(arrastre?.props ?? {})}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      onKeyDown={(e) => moverConTeclado(e, onMover)}
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5', arrastre?.esOrigen && 'opacity-50', arrastre?.esDestino && 'ring-2 ring-inset ring-brand')}
    >
      <GripVertical aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-muted')} strokeWidth={TRAZO_ICONO} />
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('text-sm', p.oculto ? 'text-fg-muted' : 'font-medium text-fg')}>{p.nombre}</span>
          {p.destacado && !p.oculto && (
            <Badge variant="outline" className="border-brand/40 bg-brand-tint text-link">
              {t('detalle.destacado')}
            </Badge>
          )}
          {p.oculto && <Badge variant="outline">{t('detalle.ocultoEnCarta')}</Badge>}
        </div>
        {p.etiquetas.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {p.etiquetas.map((e) => (
              <EtiquetaDieta key={e.nombre} texto={e.nombre} tipo={e.tipo} />
            ))}
          </div>
        )}
      </div>
      <div className="w-24 text-right">
        <p className={cn('text-sm font-semibold tabular-nums', p.oculto ? 'text-fg-muted' : 'text-fg')}>
          {p.precio === null ? t('detalle.sinPrecio') : formatearPrecio(p.precio, moneda)}
        </p>
        <p className="text-[11px] text-fg-muted">{t('detalle.delInventario')}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-pressed={p.destacado}
          aria-label={p.destacado ? t('detalle.quitarDestacado', { nombre: p.nombre }) : t('detalle.destacar', { nombre: p.nombre })}
          title={p.destacado ? t('detalle.quitarDestacado', { nombre: p.nombre }) : t('detalle.destacar', { nombre: p.nombre })}
          disabled={deshabilitado || p.oculto}
          onClick={() => onCambiar({ ...p, destacado: !p.destacado })}
          className={cn(
            'flex size-8 items-center justify-center rounded-md border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
            p.destacado ? 'bg-brand-tint text-brand' : 'text-fg-secondary hover:bg-hover',
          )}
        >
          <Star aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, p.destacado && 'fill-current')} strokeWidth={TRAZO_ICONO} />
        </button>
        <button
          type="button"
          aria-pressed={p.oculto}
          aria-label={p.oculto ? t('detalle.mostrar', { nombre: p.nombre }) : t('detalle.ocultar', { nombre: p.nombre })}
          title={p.oculto ? t('detalle.mostrar', { nombre: p.nombre }) : t('detalle.ocultar', { nombre: p.nombre })}
          disabled={deshabilitado}
          onClick={() => onCambiar({ ...p, oculto: !p.oculto, destacado: p.oculto ? p.destacado : false })}
          className={cn(
            'flex size-8 items-center justify-center rounded-md border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
            p.oculto ? 'bg-hover text-fg' : 'text-fg-secondary hover:bg-hover',
          )}
        >
          {p.oculto ? <Eye aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} /> : <EyeOff aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />}
        </button>
        {inventario && (
          <Link href={inventario} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <PenSquare aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            <span className="hidden sm:inline">{t('detalle.editarInventario')}</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function GrupoCategoria({
  t,
  categoria,
  moneda,
  onCambiar,
  onQuitar,
  arrastre,
  onMover,
  deshabilitado,
}: {
  t: TraductorConfiguracion;
  categoria: CategoriaCarta;
  moneda: string;
  onCambiar: (c: CategoriaCarta) => void;
  onQuitar: () => void;
  arrastre?: ReturnType<ReturnType<typeof useArrastreArbol>['nodo']>;
  onMover: (dir: -1 | 1) => void;
  deshabilitado?: boolean;
}) {
  const productos = categoria.productos;
  const moverProducto = (desde: number, hasta: number) => onCambiar({ ...categoria, productos: conOrden(mover(productos, desde, hasta)) });
  const arrastreProductos = useArrastreArbol({
    puedeSoltar: (o, d) => (d === null || o === d ? t('carta.mover') : true),
    onSoltar: (o, d) => d !== null && moverProducto(o, d),
    deshabilitado,
    ayuda: t('carta.mover'),
  });

  return (
    <section aria-label={categoria.nombre} className="overflow-hidden rounded-lg border border-line">
      <div
        {...(arrastre?.props ?? {})}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        onKeyDown={(e) => e.target === e.currentTarget && moverConTeclado(e, onMover)}
        className={cn('flex items-center gap-2 bg-canvas px-3 py-2', arrastre?.esOrigen && 'opacity-50', arrastre?.esDestino && 'ring-2 ring-inset ring-brand')}
      >
        <GripVertical aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-muted')} strokeWidth={TRAZO_ICONO} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{categoria.nombre}</h3>
        <span className="text-xs text-fg-secondary">
          {productos.length === 1 ? t('detalle.unProducto') : t('detalle.productosN', { n: productos.length })}
        </span>
        <RowActionsMenu
          titulo={categoria.nombre}
          acciones={[{ id: 'quitar', etiqueta: t('detalle.quitarCategoria'), icono: Trash2, destructiva: true, onSelect: onQuitar, deshabilitada: deshabilitado }]}
        />
      </div>
      {productos.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-fg-secondary">{categoria.nueva ? t('detalle.alGuardar') : t('detalle.sinProductos')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {productos.map((p, i) => (
            <li key={p.id}>
              <FilaProducto
                t={t}
                producto={p}
                moneda={moneda}
                deshabilitado={deshabilitado}
                arrastre={deshabilitado ? undefined : arrastreProductos.nodo(i)}
                onMover={(dir) => i + dir >= 0 && i + dir < productos.length && moverProducto(i, i + dir)}
                onCambiar={(x) => onCambiar({ ...categoria, productos: productos.map((y) => (y.id === x.id ? x : y)) })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CategoriasCarta({ t, categorias, disponibles, moneda, onCambiar, deshabilitado }: CategoriasCartaProps) {
  const [anadir, setAnadir] = useState(false);
  const [elegida, setElegida] = useState<string>('');
  const libres = disponibles.filter((d) => !categorias.some((c) => c.id === d.id));
  const etiquetasCarta = useMemo(() => {
    const vistas = new Map<string, EtiquetaProductoCarta>();
    for (const c of categorias) for (const p of c.productos) for (const e of p.etiquetas) vistas.set(e.nombre, e);
    return [...vistas.values()];
  }, [categorias]);
  const etiquetas = enlacesConfiguracion.etiquetas();

  const arrastre = useArrastreArbol({
    puedeSoltar: (o, d) => (d === null || o === d ? t('carta.mover') : true),
    onSoltar: (o, d) => d !== null && onCambiar(mover(categorias, o, d)),
    deshabilitado,
    ayuda: t('carta.mover'),
  });

  return (
    <Tarjeta
      titulo={t('detalle.categorias')}
      accion={
        <button
          type="button"
          className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
          disabled={deshabilitado || libres.length === 0}
          title={libres.length === 0 ? t('detalle.todasAnadidas') : undefined}
          onClick={() => {
            setElegida(String(libres[0]?.id ?? ''));
            setAnadir(true);
          }}
        >
          <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('detalle.anadirCategoria')}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-secondary">{t('detalle.notaCategorias')}</p>
        {categorias.length === 0 && <p className="text-sm text-fg-secondary">{t('detalle.sinCategorias')}</p>}
        {categorias.map((c, i) => (
          <GrupoCategoria
            key={c.id}
            t={t}
            categoria={c}
            moneda={moneda}
            deshabilitado={deshabilitado}
            arrastre={deshabilitado ? undefined : arrastre.nodo(i)}
            onMover={(dir) => i + dir >= 0 && i + dir < categorias.length && onCambiar(mover(categorias, i, i + dir))}
            onQuitar={() => onCambiar(categorias.filter((x) => x.id !== c.id))}
            onCambiar={(x) => onCambiar(categorias.map((y) => (y.id === x.id ? x : y)))}
          />
        ))}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-fg-secondary">
          {etiquetasCarta.length > 0 ? (
            <>
              <span>{t('detalle.leyenda')}</span>
              {etiquetasCarta.map((e) => (
                <EtiquetaDieta key={e.nombre} texto={e.nombre} tipo={e.tipo} />
              ))}
            </>
          ) : (
            <span>
              {t('detalle.sinEtiquetas')}{' '}
              {etiquetas && (
                <Link href={etiquetas} className="font-medium text-link hover:underline">
                  {t('detalle.variantesIr')}
                </Link>
              )}
            </span>
          )}
        </div>
      </div>

      <Dialogo
        abierto={anadir}
        onAbiertoChange={setAnadir}
        titulo={t('detalle.dialogoCategoria')}
        descripcion={t('detalle.dialogoCategoriaDescripcion')}
        ancho={440}
        primario={{
          etiqueta: t('detalle.anadir'),
          deshabilitada: !elegida,
          onClick: () => {
            const cat = libres.find((l) => String(l.id) === elegida);
            if (cat) onCambiar([...categorias, { id: cat.id, nombre: cat.nombre, productos: [], nueva: true }]);
            setAnadir(false);
          },
        }}
      >
        <FormField etiqueta={t('detalle.categoria')}>
          {(campo) => (
            <Select value={elegida} onValueChange={setElegida}>
              <SelectTrigger className="h-10 rounded-lg" aria-labelledby={campo.idEtiqueta}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {libres.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </Dialogo>
    </Tarjeta>
  );
}
