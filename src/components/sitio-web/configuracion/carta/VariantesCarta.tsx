'use client';

/**
 * Pestaña «Variantes y extras» del detalle de una carta (Figma B/13-02): para
 * cada producto de la carta que tiene variantes o grupos de extras en
 * Inventario, un interruptor «Mostrar en la carta» por opción. Las opciones,
 * sus precios y sus nombres se editan en Inventario (B/13-07 nota 1): aquí solo
 * se decide cuáles salen en ESTA carta.
 *
 * Controlado: cada interruptor cambia el borrador de `useDetalleCarta`
 * (`alternarOpcion`) y se guarda en el mismo lote que el resto del detalle.
 */
import Link from 'next/link';
import { Layers, PenSquare } from 'lucide-react';
import { AvisoTonal, EmptyState, Tarjeta, clasesBoton } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import type { CategoriaCarta, OpcionCarta, ProductoCarta } from '@/lib/website/carta';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../../ui/iconosSitio';
import { enlacesConfiguracion } from '../enlaces';
import type { TraductorConfiguracion } from '../textos';

export interface VariantesCartaProps {
  t: TraductorConfiguracion;
  categorias: CategoriaCarta[];
  /** `false` mientras falte la migración de opciones ocultas: solo lectura. */
  disponible: boolean;
  deshabilitado?: boolean;
  onCambiar: (productoId: number, tipo: 'variantes' | 'extras', opcionId: number, mostrar: boolean) => void;
}

const tieneOpciones = (p: ProductoCarta) => (p.variantes?.length ?? 0) > 0 || (p.extras?.length ?? 0) > 0;

export function VariantesCarta({ t, categorias, disponible, deshabilitado, onCambiar }: VariantesCartaProps) {
  const productos = enlacesConfiguracion.productos();
  const grupos = categorias.map((c) => ({ ...c, productos: c.productos.filter(tieneOpciones) })).filter((c) => c.productos.length > 0);
  const bloqueado = deshabilitado || !disponible;

  if (grupos.length === 0) {
    return (
      <EmptyState
        icono={Layers}
        titulo={t('variantes.vacioTitulo')}
        descripcion={t('variantes.vacioDescripcion')}
        accion={productos ? { etiqueta: t('detalle.variantesIr'), href: productos } : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {!disponible && <AvisoTonal tono="informacion" titulo={t('variantes.pendienteTitulo')} descripcion={t('variantes.pendienteDescripcion')} />}
      <p className="text-sm text-fg-secondary">{t('detalle.variantesDescripcion')}</p>
      {grupos.map((c) => (
        <Tarjeta key={c.id} titulo={c.nombre} sinRelleno>
          <ul className="divide-y divide-line">
            {c.productos.map((p) => {
              const ficha = enlacesConfiguracion.producto(p.id);
              return (
                <li key={p.id} className="flex flex-col gap-3 px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-fg">{p.nombre}</p>
                    {ficha && (
                      <Link href={ficha} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                        <PenSquare aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                        {t('variantes.editarInventario')}
                      </Link>
                    )}
                  </div>
                  <ListaOpciones t={t} titulo={t('variantes.variantes')} opciones={p.variantes} bloqueado={bloqueado} producto={p.nombre} onCambiar={(id, v) => onCambiar(p.id, 'variantes', id, v)} />
                  <ListaOpciones t={t} titulo={t('variantes.extras')} opciones={p.extras} bloqueado={bloqueado} producto={p.nombre} onCambiar={(id, v) => onCambiar(p.id, 'extras', id, v)} />
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      ))}
    </div>
  );
}

function ListaOpciones({
  t,
  titulo,
  opciones,
  bloqueado,
  producto,
  onCambiar,
}: {
  t: TraductorConfiguracion;
  titulo: string;
  opciones: OpcionCarta[] | undefined;
  bloqueado: boolean;
  producto: string;
  onCambiar: (id: number, mostrar: boolean) => void;
}) {
  if (!opciones || opciones.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-fg-secondary">{titulo}</p>
      <ul className="flex flex-col gap-1">
        {opciones.map((o) => {
          const id = `opcion-${producto}-${titulo}-${o.id}`.replace(/\s+/g, '-');
          return (
            <li key={o.id} className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
              <label htmlFor={id} className="min-w-0 text-sm text-fg">
                <span className={o.oculta ? 'text-fg-muted line-through' : undefined}>{o.nombre}</span>
                {o.opciones !== undefined && <span className="ml-2 text-xs text-fg-muted">{t('variantes.nOpciones', { n: o.opciones })}</span>}
              </label>
              <span className="flex shrink-0 items-center gap-2 text-xs text-fg-secondary">
                {t('variantes.mostrar')}
                <Switch id={id} checked={!o.oculta} disabled={bloqueado} onCheckedChange={(v) => onCambiar(o.id, v)} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
