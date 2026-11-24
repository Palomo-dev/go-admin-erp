'use client';

/**
 * Niveles de partner en hoja lateral («Editar» de la tarjeta Niveles,
 * «Configurar niveles» del estado vacío, Figma 1319:94585 y 1411:41956):
 * umbrales (`min_deals`, `min_revenue`), tasa y beneficios, edición en su
 * sitio, alta y borrado con confirmación (409 si está en uso). La promoción
 * automática usa exactamente estos umbrales (`partnerTierFor`).
 *
 * F12-misc: crear/editar/borrar solo con `canManage` (el booleano que el GET
 * de partners calcula en el servidor); un Empleado solo lee.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Award, Plus, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { clasesBoton } from '@/components/kit/botonClases';
import type { PartnerTier } from '@/lib/services/crm/partnerService';
import { formatRate } from '@/lib/services/crm/partnerModel';
import { rankTiers } from '@/lib/services/crm/partnerTierFor';
import { cn } from '@/utils/Utils';
import { TierForm } from './TierForm';
import { beneficiosNivel } from './redPartnersLogica';
import { claveErrorPartners } from './redPartnersErrores';

interface Props {
  abierto: boolean;
  tiers: PartnerTier[];
  /** F12-misc: mismo booleano que el directorio (`can_manage` del GET de partners); un Empleado solo lee. */
  canManage: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onGuardar: (payload: Record<string, unknown>, id?: string) => Promise<unknown>;
  onBorrar: (id: string) => Promise<void>;
}

export function TierEditor({ abierto, tiers, canManage, onAbiertoChange, onGuardar, onBorrar }: Props) {
  const t = useTranslations('crm.redPartners');
  const idioma = useLocale();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [aBorrar, setABorrar] = useState<PartnerTier | null>(null);
  const [borrando, setBorrando] = useState(false);
  const nuevoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setEditandoId(null);
    setCreando(canManage && tiers.length === 0);
  }, [abierto, canManage, tiers.length]);

  const borrar = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      await onBorrar(aBorrar.id);
      toast({ title: t('niveles.borrado', { nombre: aBorrar.name }) });
      setABorrar(null);
    } catch (e) {
      toast({ title: t('niveles.errorBorrar'), description: t(claveErrorPartners(e)), variant: 'destructive' });
    } finally {
      setBorrando(false);
    }
  };

  const ordenados = rankTiers(tiers);
  const entero = (n: number | string) => new Intl.NumberFormat(idioma).format(Number(n));

  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto bg-canvas p-0 sm:max-w-xl">
        <SheetHeader className="text-left border-b border-line bg-surface px-6 pr-8 py-4">
          <SheetTitle className="text-fg">{t('niveles.titulo')}</SheetTitle>
          <SheetDescription className="text-fg-secondary">{t('niveles.descripcion')}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">{t('niveles.cuantos', { n: tiers.length })}</h3>
            {canManage && (
              <button ref={nuevoRef} type="button" className={clasesBoton({ variante: creando ? 'tinte' : 'secundario', tamano: 'sm' })} onClick={() => { setEditandoId(null); setCreando(true); }}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('niveles.nuevo')}
              </button>
            )}
          </div>
          {canManage && creando && (
            <section aria-label={t('niveles.nuevo')} className="rounded-xl border border-line-brand bg-surface p-4">
              <TierForm tier={null} onGuardar={onGuardar} onCancelar={() => setCreando(false)} />
            </section>
          )}
          <ol className="space-y-2" aria-label={t('niveles.titulo')}>
            {ordenados.map((x) => {
              const editando = editandoId === x.id;
              const beneficios = beneficiosNivel(x.benefits);
              return (
                <li key={x.id} className={cn('rounded-xl border bg-surface p-4', editando ? 'border-line-brand' : 'border-line')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium text-fg">
                        <Award aria-hidden="true" className="size-4 shrink-0 text-warning-text" strokeWidth={1.5} />
                        {x.name} · {formatRate(x.commission_rate)}
                      </p>
                      <p className="text-xs text-fg-secondary">{t('niveles.umbral', { deals: entero(x.min_deals), monto: entero(x.min_revenue) })}</p>
                      {beneficios.length > 0 && <p className="mt-1 text-xs text-fg">{beneficios.join(' · ')}</p>}
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" aria-expanded={editando} className={clasesBoton({ variante: editando ? 'tinte' : 'secundario', tamano: 'sm' })} onClick={() => { setCreando(false); setEditandoId(editando ? null : x.id); }}>
                          {editando ? t('niveles.cerrar') : t('niveles.editar')}
                        </button>
                        <button type="button" aria-label={t('niveles.eliminarAria', { nombre: x.name })} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'size-8 px-0 text-danger-text' })} onClick={() => setABorrar(x)}>
                          <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </div>
                  {canManage && editando && (
                    <div className="mt-4 border-t border-line pt-4">
                      <TierForm tier={x} onGuardar={onGuardar} onCancelar={() => setEditandoId(null)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <ConfirmDialog
          abierto={aBorrar !== null}
          onAbiertoChange={(a) => { if (!a && !borrando) setABorrar(null); }}
          titulo={t('niveles.eliminarTitulo')}
          descripcion={t('niveles.eliminarDescripcion', { nombre: aBorrar?.name ?? '' })}
          textoConfirmar={t('niveles.eliminar')}
          tono="peligro"
          onConfirmar={borrar}
          cargando={borrando}
        />
      </SheetContent>
    </Sheet>
  );
}
