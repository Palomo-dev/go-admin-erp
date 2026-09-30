'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Ban, Info, Loader2, TrendingUp } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { FormField } from '@/components/kit/FormField';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { CLASE_AREA, CLASE_AVISO_INFO, CLASE_CAMPO, simboloMoneda, type OpcionUsuario } from './camposCrm';
import { bandaScore, detalleContacto, origenValido, TONO_BANDA, type LeadFila } from './leadRowLogica';
import type { Temperatura } from './opportunityCardLogica';
import type { ValoresOportunidad } from './opportunityFormLogica';
import { SelectCrm } from './SelectCrm';
import { DECISORES, esValida, prefillDesdeLead, validarCalificacion, valoresInicialesCalificacion, type ValoresCalificacion } from './qualifyLeadLogica';

/**
 * Paso 1 de «Calificar → crear oportunidad» (Figma `QualifyLeadDialog`
 * 759:445219): diálogo en escritorio, hoja en móvil (`PanelAdaptable`).
 * «Continuar» entrega el prellenado de `OpportunityForm Origen=lead` (paso 2);
 * no escribe nada ni cambia `lifecycle_stage` (lo hace el sistema al crear la
 * oportunidad). «Descartar lead» lo resuelve la pantalla (pide motivo).
 */
export interface QualifyLeadDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  lead: LeadFila;
  moneda: ContextoMoneda;
  usuarios: readonly OpcionUsuario[];
  /** Responsable por defecto: el del lead o el usuario actual. */
  responsableId?: string | null;
  onContinuar: (prefill: Partial<ValoresOportunidad>) => void;
  onDescartar?: () => void;
  /** `crm.leads.edit`, resuelto en el servidor. */
  puedeDescartar?: boolean;
  ocupado?: boolean;
  error?: string | null;
}

const TEMPERATURAS: readonly Temperatura[] = ['cold', 'warm', 'hot'];

export function QualifyLeadDialog({ abierto, onAbiertoChange, lead, moneda, usuarios, responsableId, onContinuar, onDescartar, puedeDescartar = true, ocupado, error }: QualifyLeadDialogProps) {
  const t = useTranslations('crm.kit.calificar');
  const tl = useTranslations('crm.kit.leads');
  const { getToday } = useFormatDate();
  const [v, setV] = useState<ValoresCalificacion>(() => valoresInicialesCalificacion({ responsableId }));
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (abierto) {
      setV(valoresInicialesCalificacion({ responsableId }));
      setIntentado(false);
    }
  }, [abierto, responsableId]);

  const errores = validarCalificacion(v, getToday());
  const err = (campo: keyof typeof errores) => (intentado && errores[campo] ? t(`error.${errores[campo]}`) : null);
  const cambiar = (parcial: Partial<ValoresCalificacion>) => setV((x) => ({ ...x, ...parcial }));
  const nombre = lead.full_name?.trim() || tl('sinNombre');
  const origen = origenValido(lead.lead_source);
  const banda = bandaScore(lead.lead_score);

  const continuar = () => {
    setIntentado(true);
    if (esValida(errores)) onContinuar(prefillDesdeLead(lead, v));
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('paso')}
      icono={TrendingUp}
      ancho={560}
      ocupado={ocupado}
      pie={
        <>
          {puedeDescartar && onDescartar && (
            <button type="button" onClick={onDescartar} disabled={ocupado} className={clasesBoton({ variante: 'fantasma', className: 'sm:mr-auto' })}>
              <Ban aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('descartar')}
            </button>
          )}
          <button type="button" onClick={() => onAbiertoChange(false)} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>
            {t('cancelar')}
          </button>
          <button type="button" onClick={continuar} disabled={ocupado} aria-busy={ocupado || undefined} className={clasesBoton()}>
            {ocupado ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {t('continuar')}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3 rounded-lg bg-subtle p-3">
        <AvatarIniciales nombre={nombre} src={lead.avatar_url} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-semibold text-fg">{nombre}</span>
          <span className="truncate text-xs text-fg-muted">{detalleContacto(lead) || tl('sinContacto')}</span>
          <span className="flex flex-wrap gap-1">
            {origen && <Badge tono="informacion" apariencia="contorno" tamano="sm">{tl(`origen.${origen}`)}</Badge>}
            {banda && <Badge tono={TONO_BANDA[banda]} tamano="sm">{tl('score', { score: lead.lead_score ?? 0, banda: tl(`banda.${banda}`) })}</Badge>}
          </span>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}

      <FormField etiqueta={t('necesidad')} obligatorio error={err('necesidad')}>
        <textarea value={v.necesidad} onChange={(e) => cambiar({ necesidad: e.target.value })} rows={2} className={cn(CLASE_AREA, 'min-h-[56px]')} placeholder={t('necesidadEj')} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField etiqueta={t('presupuesto')} error={err('presupuesto')}>
          <input inputMode="decimal" value={v.presupuesto} onChange={(e) => cambiar({ presupuesto: e.target.value })} placeholder={`${simboloMoneda(moneda)} 0`} className={CLASE_CAMPO} />
        </FormField>
        <FormField etiqueta={t('cierre')} error={err('cierre')}>
          <CampoFecha valor={v.cierre} min={getToday()} hoy={getToday()} onValorChange={(cierre) => cambiar({ cierre })} />
        </FormField>
        <FormField etiqueta={t('decisor')}>
          <SelectCrm
            valor={v.decisor}
            onValorChange={(decisor) => cambiar({ decisor: decisor as ValoresCalificacion['decisor'] })}
            opcionVacia={t('elegir')}
            opciones={DECISORES.map((d) => ({ valor: d, etiqueta: t(`decisores.${d}`) }))}
          />
        </FormField>
        <FormField etiqueta={t('responsable')}>
          <SelectCrm
            valor={v.responsableId}
            onValorChange={(responsableId) => cambiar({ responsableId })}
            opcionVacia={t('sinResponsable')}
            opciones={usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
          />
        </FormField>
      </div>
      <FormField etiqueta={t('temperatura')}>
        {(campo) => (
          <SegmentedControl<Temperatura>
            aria-labelledby={campo.idEtiqueta}
            opciones={TEMPERATURAS.map((x) => ({ valor: x, etiqueta: t(`temperaturas.${x}`) }))}
            valor={v.temperatura}
            onValorChange={(temperatura) => cambiar({ temperatura })}
          />
        )}
      </FormField>
      <p className={CLASE_AVISO_INFO}>
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        {t('aviso')}
      </p>
    </PanelAdaptable>
  );
}
