"use client";

import React, { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Percent, TriangleAlert } from 'lucide-react';
import { BarraProgreso, Dialogo, FormField, Tarjeta, clasesBoton, formatearTarifa } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { setOrganizationDefaultTax, SIN_TARIFA_POR_DEFECTO } from '@/lib/services/defaultTaxService';
import { cobertura, type UsoProductos } from './impuestosLogica';

interface ImpuestoOpcion {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
}

interface TarifaPorDefectoCardProps {
  organizationId: number;
  taxes: ImpuestoOpcion[];
  /** Cobertura de productos (`fn_impuestos_uso_productos`); null mientras carga o si falló. */
  uso: UsoProductos | null;
  /** Sin permiso de gestión de impuestos no se ofrece «Cambiar tarifa». */
  puedeGestionar: boolean;
  /** Se llama tras guardar para recargar la tabla. */
  onSaved: () => void;
}

/**
 * «Tarifa para productos sin impuesto» (Figma 1012:86383): la marca
 * `is_default` de `organization_taxes` que usa `resolveLineTax` cuando el
 * producto no tiene impuestos propios. Una sola a la vez, o ninguna. Se cambia
 * con `setOrganizationDefaultTax` (RPC `fn_impuesto_fijar_por_defecto`).
 */
export default function TarifaPorDefectoCard({ organizationId, taxes, uso, puedeGestionar, onSaved }: TarifaPorDefectoCardProps) {
  const t = useTranslations('finanzasImpuestos.tarifa');
  const locale = useLocale();
  const { toast } = useToast();

  const vigente = taxes.find((x) => x.is_default && x.is_active) ?? null;
  const actual = vigente?.id ?? SIN_TARIFA_POR_DEFECTO;
  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<string>(actual);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) setSeleccion(actual);
  }, [actual, abierto]);

  const activos = taxes.filter((x) => x.is_active);
  const tasa = (rate: number) => formatearTarifa(Number(rate), locale) ?? `${rate} %`;
  const entero = (n: number) => n.toLocaleString(locale);
  const pct = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  const guardar = async () => {
    setGuardando(true);
    try {
      await setOrganizationDefaultTax(supabase, organizationId, seleccion === SIN_TARIFA_POR_DEFECTO ? null : seleccion);
      toast({
        title: t('guardadaTitulo'),
        description: seleccion === SIN_TARIFA_POR_DEFECTO ? t('guardadaNinguna') : t('guardadaTarifa'),
      });
      setAbierto(false);
      onSaved();
    } catch (error) {
      console.error('Error al guardar la tarifa por defecto:', error);
      toast({ title: t('errorTitulo'), description: t('error'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  // Sin tarifa por defecto, la tarjeta va en tono advertencia (esas ventas salen sin IVA).
  const sinDefecto = actual === SIN_TARIFA_POR_DEFECTO;
  const nombreTarifa = vigente ? `${vigente.name} (${tasa(vigente.rate)})` : t('ninguna', { tasa: tasa(0) });
  const cob = uso ? cobertura(uso) : null;

  return (
    <>
      <Tarjeta
        titulo={t('titulo', { tarifa: nombreTarifa })}
        icono={sinDefecto ? TriangleAlert : Percent}
        tono={sinDefecto ? 'advertencia' : 'neutro'}
        descripcion={
          uso && uso.total > 0 && cob
            ? t('cobertura', {
                con: entero(uso.conImpuesto + uso.exentos),
                total: entero(uso.total),
                sin: entero(cob.sinConfigurar),
              })
            : t('ayuda')
        }
        accion={
          puedeGestionar ? (
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setAbierto(true)}>
              {t('cambiar')}
            </button>
          ) : undefined
        }
      >
        {uso && uso.total > 0 && cob ? (
          <div className="flex flex-col gap-1.5">
            <BarraProgreso
              valor={uso.conImpuesto + uso.exentos}
              max={uso.total}
              etiqueta={t('barraEtiqueta')}
              textoValor={t('leyenda', { con: pct(cob.pctConImpuesto), exentos: pct(cob.pctExentos), sin: pct(cob.pctSinConfigurar) })}
              tono={sinDefecto ? 'advertencia' : 'marca'}
              tamano="sm"
              className="max-w-xl"
            />
            <p className="text-xs text-fg-secondary">
              {t('leyenda', { con: pct(cob.pctConImpuesto), exentos: pct(cob.pctExentos), sin: pct(cob.pctSinConfigurar) })}
            </p>
          </div>
        ) : null}
      </Tarjeta>

      <Dialogo
        abierto={abierto}
        onAbiertoChange={(v) => !guardando && setAbierto(v)}
        titulo={t('dialogoTitulo')}
        descripcion={t('ayuda')}
        icono={Percent}
        ancho={440}
        primario={{ etiqueta: t('guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: seleccion === actual }}
      >
        <FormField etiqueta={t('etiqueta')}>
          {(c) => (
            <Select value={seleccion} onValueChange={setSeleccion} disabled={guardando}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('elegir')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_TARIFA_POR_DEFECTO}>{t('opcionNinguna')}</SelectItem>
                {activos.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name} ({tasa(x.rate)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </Dialogo>
    </>
  );
}
