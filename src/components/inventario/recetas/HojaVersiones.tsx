'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { StatusBadge } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { recipeService, type CostoReceta, type VersionReceta } from '@/lib/services/recipeService';
import { cn } from '@/utils/Utils';
import { useFormatoCantidad } from '../produccion/piezas';
import { useMensajeErrorReceta } from './piezas';

/**
 * Versiones de la receta (Figma G6 970:177494): una tarjeta por versión con
 * fecha, autor, ingredientes, costo por unidad en la sucursal y órdenes que la
 * usan. «Ver» despliega sus ingredientes; «Reactivar» copia esa versión como
 * versión nueva (`fn_receta_reactivar`): las versiones nunca se editan ni se
 * borran, las órdenes y el kardex apuntan a ellas.
 */
export interface HojaVersionesProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  producto: { id: number; nombre: string };
  sucursalId: number | null;
  puedeEditar: boolean;
  onReactivada: () => void;
}

export function HojaVersiones({ abierto, onAbiertoChange, producto, sucursalId, puedeEditar, onReactivada }: HojaVersionesProps) {
  const t = useTranslations('inventarioRecetas.versiones');
  const { toast } = useToast();
  const { formatDate } = useFormatDate();
  const { formatear: moneda } = useMonedaOrganizacion();
  const cantidad = useFormatoCantidad();
  const mensajeError = useMensajeErrorReceta();
  const [lista, setLista] = useState<VersionReceta[] | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [lineas, setLineas] = useState<Record<number, CostoReceta | 'cargando' | 'error'>>({});
  const [trabajando, setTrabajando] = useState<number | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!abierto) return;
    setLista(null);
    recipeService
      .versiones(getOrganizationId(), producto.id, sucursalId)
      .then(setLista)
      .catch(() => setLista([]));
  }, [abierto, producto.id, sucursalId, recarga]);

  const ver = (id: number) => {
    setAbierta((a) => (a === id ? null : id));
    if (lineas[id]) return;
    setLineas((l) => ({ ...l, [id]: 'cargando' }));
    recipeService
      .costo(getOrganizationId(), sucursalId, { recipe_id: id })
      .then((c) => setLineas((l) => ({ ...l, [id]: c })))
      .catch(() => setLineas((l) => ({ ...l, [id]: 'error' })));
  };

  const reactivar = async (v: VersionReceta) => {
    setTrabajando(v.recipe_id);
    try {
      const r = await recipeService.reactivar(getOrganizationId(), v.recipe_id);
      toast({ title: r.cambio ? t('reactivada', { version: v.version, nueva: r.version }) : t('igualActiva') });
      setRecarga((n) => n + 1);
      onReactivada();
    } catch (e) {
      toast({ variant: 'destructive', title: t('errorReactivar'), description: mensajeError(e) });
    } finally {
      setTrabajando(null);
    }
  };

  const activa = lista?.find((v) => v.activa);

  return (
    <HojaDetalle
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      insignia={activa ? <StatusBadge estado="activa" etiqueta={t('activaCorta', { version: activa.version })} /> : undefined}
      subtitulo={producto.nombre}
      ocupado={trabajando !== null}
      ancho={560}
    >
      <div className="flex flex-col gap-3">
        {lista === null && <p className="text-sm text-fg-secondary">{t('cargando')}</p>}
        {lista?.length === 0 && <p className="text-sm text-fg-secondary">{t('vacio')}</p>}
        {lista?.map((v) => {
          const detalle = lineas[v.recipe_id];
          return (
            <article
              key={v.recipe_id}
              aria-labelledby={`version-${v.recipe_id}`}
              className={cn('flex flex-col gap-2 rounded-xl border p-4', v.activa ? 'border-brand/40 bg-brand-tint' : 'border-line bg-surface')}
            >
              <div className="flex items-center gap-2">
                <h3 id={`version-${v.recipe_id}`} className="text-base font-semibold text-fg">
                  {t('version', { version: v.version })}
                </h3>
                <StatusBadge estado={v.activa ? 'activa' : 'inactiva'} etiqueta={v.activa ? t('activa') : t('inactiva')} />
              </div>
              <p className="text-sm text-fg-secondary">
                {[v.creada_en ? formatDate(v.creada_en) : null, v.autor, t('nIngredientes', { count: v.ingredientes }), v.costo_unidad !== null ? moneda(v.costo_unidad) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="text-xs text-fg-muted">
                {v.ordenes_abiertas > 0 ? t('nAbiertas', { count: v.ordenes_abiertas }) : t('nOrdenes', { count: v.ordenes })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" className="h-9 gap-1.5 px-3" onClick={() => ver(v.recipe_id)} aria-expanded={abierta === v.recipe_id}>
                  {abierta === v.recipe_id ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
                  {t('ver')}
                </Button>
                {!v.activa && puedeEditar && (
                  <Button variant="outline" className="h-9 gap-1.5 px-3" onClick={() => reactivar(v)} disabled={trabajando !== null}>
                    <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    {t('reactivar', { nueva: (lista[0]?.version ?? v.version) + 1 })}
                  </Button>
                )}
              </div>
              {abierta === v.recipe_id && (
                <div className="rounded-lg bg-surface px-3 py-2">
                  {detalle === 'cargando' && <p className="text-sm text-fg-secondary">{t('cargando')}</p>}
                  {detalle === 'error' && <p className="text-sm text-danger-text">{t('errorLineas')}</p>}
                  {detalle && typeof detalle === 'object' && (
                    <ul className="flex flex-col gap-1 text-[13px]">
                      {detalle.lineas.map((l) => (
                        <li key={l.orden} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate text-fg">
                            {l.nombre ?? `#${l.ingredient_product_id}`}
                            {l.merma_pct > 0 ? ` · ${t('merma', { pct: l.merma_pct })}` : ''}
                            {l.opcional ? ` · ${t('opcional')}` : ''}
                          </span>
                          <span className="shrink-0 tabular-nums text-fg-secondary">{cantidad(l.cantidad_neta, l.unidad_receta)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>
          );
        })}
        <p className="text-xs text-fg-muted">{t('nota')}</p>
      </div>
    </HojaDetalle>
  );
}
