'use client';

/**
 * La carta tal como la ve el cliente (Figma B/13-05 y la vista lateral de
 * B/13-01): chips de las cartas vigentes, chips de categorías, tarjetas de
 * producto con etiquetas de dieta, «Destacado», precio y «Pedir a la mesa».
 * Pinta lo que devuelve `get_public_menu` (vía la API): no decide qué carta
 * está vigente. Se usa en la vista lateral de Carta y en «Vista previa».
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { CartaPublica } from '@/lib/website/carta';
import { EtiquetaDieta } from '../../ui/EtiquetaDieta';
import { formatearPrecio } from '../../ui/PriceTag';
import type { TraductorConfiguracion } from '../textos';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../../ui/iconosSitio';

export interface CartaPublicaVistaProps {
  t: TraductorConfiguracion;
  cartas: CartaPublica[];
  moneda: string;
  /** «Tu marca · Sede Centro» y la línea bajo el título (celular). */
  encabezado?: { titulo: string; linea?: string };
  /** Vista lateral de 13-01: sin encabezado ni botón de pedir y con menos aire. */
  compacto?: boolean;
  /** Muestra «Pedir a la mesa» (modo QR con pedido a la mesa). */
  conPedir?: boolean;
}

export function CartaPublicaVista({ t, cartas, moneda, encabezado, compacto, conPedir }: CartaPublicaVistaProps) {
  const [cartaId, setCartaId] = useState<string | null>(cartas[0]?.id ?? null);
  useEffect(() => setCartaId(cartas[0]?.id ?? null), [cartas]);
  const carta = cartas.find((c) => c.id === cartaId) ?? cartas[0] ?? null;
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const secciones = useMemo(() => carta?.secciones.filter((s) => s.productos.length > 0) ?? [], [carta]);
  useEffect(() => setCategoriaId(secciones[0]?.categoriaId ?? null), [secciones]);
  const seccion = secciones.find((s) => s.categoriaId === categoriaId) ?? secciones[0] ?? null;

  const chip = (activo: boolean) =>
    cn(
      'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      activo ? 'border-brand bg-brand-tint text-link' : 'border-line bg-surface text-fg-secondary hover:text-fg',
    );

  return (
    <div className={cn('flex flex-col', compacto ? 'gap-3' : 'gap-4')}>
      {encabezado && (
        <div className="-mx-4 -mt-4 bg-brand-tint px-4 pb-3 pt-4">
          <p className="text-lg font-semibold text-link">{encabezado.titulo}</p>
          {encabezado.linea && <p className="text-[13px] text-fg-secondary">{encabezado.linea}</p>}
        </div>
      )}
      {cartas.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('carta.titulo')}>
          {cartas.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === carta?.id} className={chip(c.id === carta?.id)} onClick={() => setCartaId(c.id)}>
              {c.id === carta?.id && <Check aria-hidden="true" className={CLASE_TAMANO_ICONO.meta} strokeWidth={TRAZO_ICONO} />}
              {c.nombre}
            </button>
          ))}
        </div>
      )}
      {secciones.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('detalle.categorias')}>
          {secciones.map((s) => (
            <button
              key={s.categoriaId}
              type="button"
              role="tab"
              aria-selected={s.categoriaId === seccion?.categoriaId}
              className={chip(s.categoriaId === seccion?.categoriaId)}
              onClick={() => setCategoriaId(s.categoriaId)}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      )}
      {seccion && (
        <section aria-label={seccion.nombre} className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-fg">{seccion.nombre}</h3>
          <ul className="flex flex-col gap-2">
            {seccion.productos.map((p) => (
              <li key={p.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{p.nombre}</p>
                  {p.descripcion && <p className="line-clamp-2 text-xs text-fg-secondary">{p.descripcion}</p>}
                  {(p.destacado || p.etiquetas.length > 0 || p.agotado) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.destacado && (
                        <Badge variant="outline" className="border-brand/40 bg-brand-tint text-link">
                          {t('detalle.destacado')}
                        </Badge>
                      )}
                      {p.etiquetas.map((e) => (
                        <EtiquetaDieta key={e.nombre} texto={e.nombre} tipo={e.tipo} />
                      ))}
                      {p.agotado && <Badge variant="outline">{t('vistaPrevia.agotado')}</Badge>}
                    </div>
                  )}
                  {p.precio !== null && <p className="mt-1 text-sm font-semibold tabular-nums text-fg">{formatearPrecio(p.precio, moneda)}</p>}
                </div>
                {!compacto && (
                  <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-canvas text-fg-muted">
                    <ImageIcon className={CLASE_TAMANO_ICONO.fila} strokeWidth={TRAZO_ICONO} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {conPedir && !compacto && (
        <button type="button" className="mt-2 h-11 w-full rounded-lg bg-brand-action text-sm font-semibold text-fg-on-brand" tabIndex={-1}>
          {t('vistaPrevia.pedir')}
        </button>
      )}
    </div>
  );
}
