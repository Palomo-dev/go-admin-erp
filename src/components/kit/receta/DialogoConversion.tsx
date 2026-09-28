'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { unitConversionService } from '@/lib/services/unitConversionService';
import { CampoNumero } from '../CampoNumero';
import { Dialogo } from '../Dialogo';
import { FormField } from '../FormField';
import { unidadLimpia, type UnidadReceta } from './recetaLogica';

/**
 * «Nueva conversión» desde una fila de receta sin conversión (Figma
 * `DialogoConversion` 959-168518): de → a con su factor, la inversa opcional y
 * la vista previa «1 PAQ = 6 UN · 1 UN = 0,1667 PAQ». Valida mismo tipo de
 * unidad y factor > 0. Se guarda para toda la organización: la conversión solo
 * para un producto (B2) llega con la pestaña Unidades del detalle (§3.5).
 */
export interface DialogoConversionProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  de: string;
  a: string;
  unidades: readonly UnidadReceta[];
  /** Nombre del ingrediente para el subtítulo. */
  ingrediente?: string;
  onCreada: () => void;
}

const formato = (n: number) => String(Math.round(n * 10000) / 10000);

export function DialogoConversion({ abierto, onAbiertoChange, organizacionId, de, a, unidades, ingrediente, onCreada }: DialogoConversionProps) {
  const t = useTranslations('receta.conversion');
  const [factor, setFactor] = useState<number | null>(null);
  const [inversa, setInversa] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setFactor(null);
      setInversa(true);
      setErrorServidor(null);
    }
  }, [abierto, de, a]);

  const tipoDe = unidades.find((u) => unidadLimpia(u.code) === unidadLimpia(de))?.unit_type ?? null;
  const tipoA = unidades.find((u) => unidadLimpia(u.code) === unidadLimpia(a))?.unit_type ?? null;
  const tiposDistintos = !!tipoDe && !!tipoA && tipoDe !== tipoA;
  const factorValido = factor !== null && factor > 0;
  const puedeGuardar = factorValido && !tiposDistintos && !guardando;

  const guardar = async () => {
    if (!puedeGuardar || factor === null) return;
    setGuardando(true);
    setErrorServidor(null);
    try {
      await unitConversionService.createConversion({ from_unit_code: unidadLimpia(de), to_unit_code: unidadLimpia(a), factor, organization_id: organizacionId });
      if (inversa) {
        await unitConversionService.createConversion({ from_unit_code: unidadLimpia(a), to_unit_code: unidadLimpia(de), factor: 1 / factor, organization_id: organizacionId });
      }
      onCreada();
      onAbiertoChange(false);
    } catch (e) {
      setErrorServidor(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={ingrediente ? t('descripcion', { ingrediente, unidad: unidadLimpia(a) }) : undefined}
      ancho={440}
      primario={{ etiqueta: t('guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: !puedeGuardar }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <FormField etiqueta={t('de')}>
            <p className="flex h-10 items-center rounded-lg border border-line bg-subtle px-3 text-sm text-fg">1 {unidadLimpia(de)}</p>
          </FormField>
          <span className="pb-2.5 text-sm text-fg-muted">=</span>
          <FormField etiqueta={t('factor', { unidad: unidadLimpia(a) })} error={factor !== null && !factorValido ? t('factorInvalido') : null}>
            <CampoNumero valor={factor} onValorChange={setFactor} decimales={6} minimo={0} sufijo={unidadLimpia(a)} autoFocus />
          </FormField>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
          <Checkbox checked={inversa} onCheckedChange={(v) => setInversa(v === true)} className="size-[18px] rounded" />
          {factorValido
            ? t('inversaCon', { vista: `1 ${unidadLimpia(a)} = ${formato(1 / (factor as number))} ${unidadLimpia(de)}` })
            : t('inversa')}
        </label>
        {tiposDistintos ? (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-subtle p-3 text-xs text-danger-text">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            {t('tiposDistintos', { de: unidadLimpia(de), a: unidadLimpia(a) })}
          </p>
        ) : factorValido ? (
          <p className="flex items-start gap-2 rounded-lg bg-info-subtle p-3 text-xs text-info-text">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            {t('vistaPrevia', {
              ida: `1 ${unidadLimpia(de)} = ${formato(factor as number)} ${unidadLimpia(a)}`,
              vuelta: `1 ${unidadLimpia(a)} = ${formato(1 / (factor as number))} ${unidadLimpia(de)}`,
            })}
          </p>
        ) : null}
        <p className="text-xs text-fg-muted">{t('alcanceOrganizacion')}</p>
        {errorServidor && (
          <p role="alert" className="text-xs text-danger-text">
            {t('error', { detalle: errorServidor })}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
