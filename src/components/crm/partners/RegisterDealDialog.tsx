'use client';

/**
 * «Registrar deal» (Figma 1318:91569, anotación 1318:91785): oportunidad
 * obligatoria (buscador sobre las oportunidades de la organización), tipo
 * (CHECK `partner_deals.deal_type`), resumen con monto, tasa efectiva y
 * comisión sugerida (`computePartnerCommission`, la misma que usa el
 * servidor), comisión editable y el aviso de que nace «Pendiente».
 *
 * Ajustar la comisión es de admin/manager: a cualquier otro rol el campo se
 * muestra fijo y el servidor ignora el valor (`POST /api/crm/partners/[id]/deals`
 * guarda quién la cambió y cuándo). Tras guardar, el servidor reevalúa el nivel.
 */

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Briefcase } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { SelectorEntidad } from '@/components/kit/SelectorEntidad';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { DEAL_TYPES, computePartnerCommission, type DealType } from '@/lib/services/crm/partnerCommission';
import { formatMoney, formatRate } from '@/lib/services/crm/partnerModel';
import type { RegisterDealResult } from '@/lib/services/crm/partnerService';
import { buscarOportunidadesPartner, type OportunidadElegible } from './buscarOportunidadesPartner';
import { fuenteTasa, type PartnerFila } from './redPartnersLogica';
import { claveErrorPartners } from './redPartnersErrores';
import type { PayloadDeal } from './usePartners';

interface Props {
  abierto: boolean;
  partner: PartnerFila | null;
  puedeAjustar: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onRegistrar: (partnerId: string, payload: PayloadDeal) => Promise<RegisterDealResult>;
}

export function RegisterDealDialog({ abierto, partner, puedeAjustar, onAbiertoChange, onRegistrar }: Props) {
  const t = useTranslations('crm.redPartners.registrar');
  const tr = useTranslations('crm.redPartners');
  const idioma = useLocale();
  const [opp, setOpp] = useState<OportunidadElegible | null>(null);
  const [tipo, setTipo] = useState<DealType>('referral');
  const [comision, setComision] = useState<number | null>(null);
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [errorComision, setErrorComision] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setOpp(null);
    setTipo('referral');
    setComision(null);
    setErrorCampo(null);
    setErrorComision(null);
    setError(null);
  }, [abierto, partner?.id]);

  const tasa = partner?.effective_rate ?? 0;
  const sugerida = opp ? computePartnerCommission(opp.amount, tasa) : null;
  const fuente = partner ? fuenteTasa(partner) : 'sinNivel';
  const moneda = opp?.currency ?? null;

  const elegir = (o: OportunidadElegible) => {
    setOpp(o);
    setComision(computePartnerCommission(o.amount, tasa));
    setErrorCampo(null);
    setErrorComision(null);
  };

  const enviar = async () => {
    if (!partner) return;
    if (!opp) {
      setErrorCampo(t('errorOportunidad'));
      return;
    }
    const tope = opp.amount ?? 0;
    if (puedeAjustar && comision !== null && (comision < 0 || (tope > 0 && comision > tope))) {
      setErrorComision(t('errorComision'));
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const payload: PayloadDeal = { opportunity_id: opp.id, deal_type: tipo };
      if (puedeAjustar && comision !== null && comision !== sugerida) payload.commission_amount = comision;
      const r = await onRegistrar(partner.id, payload);
      toast({
        title: t('hecho'),
        description: `${t('hechoDetalle', { monto: formatMoney(r.deal.commission_amount, r.deal.opportunity?.currency ?? moneda), tasa: formatRate(r.commission_rate) })}${r.promoted_to ? ` ${t('subeNivel', { nombre: partner.name, nivel: r.promoted_to.name })}` : ''}`,
      });
      onAbiertoChange(false);
    } catch (e) {
      setError(tr(claveErrorPartners(e)));
    } finally {
      setGuardando(false);
    }
  };

  const etiquetaTasa =
    fuente === 'nivel' && partner?.tier ? t('tasaNivel', { nivel: partner.tier.name }) : fuente === 'propia' ? t('tasaPropia') : t('tasaSinNivel');

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => {
        if (!guardando) onAbiertoChange(a);
      }}
      titulo={t('titulo')}
      descripcion={partner ? t('descripcion', { nombre: partner.name }) : undefined}
      ancho={560}
      primario={{ etiqueta: guardando ? t('registrando') : t('registrar'), onClick: () => void enviar(), cargando: guardando }}
    >
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <FormField etiqueta={t('oportunidad')} obligatorio error={errorCampo}>
          {(campo) => (
            <SelectorEntidad<OportunidadElegible>
              id={campo.id}
              aria-describedby={campo['aria-describedby']}
              aria-invalid={campo['aria-invalid']}
              valor={opp}
              aOpcion={(o) => ({
                id: o.id,
                titulo: [o.name, o.customer_name].filter(Boolean).join(' · '),
                subtitulo: o.amount != null ? formatMoney(o.amount, o.currency) : t('sinMonto'),
              })}
              buscar={(texto, senal) => buscarOportunidadesPartner(texto, senal)}
              onCambiar={elegir}
              onQuitar={() => {
                setOpp(null);
                setComision(null);
              }}
              icono={Briefcase}
              layout="campo"
              etiqueta={t('oportunidad')}
              textos={{
                placeholder: t('buscarPlaceholder'),
                buscar: t('buscarPlaceholder'),
                titulo: t('oportunidad'),
                vacio: t('buscarVacio'),
                sinResultados: t('buscarSinResultados'),
                error: t('buscarError'),
              }}
            />
          )}
        </FormField>

        <div className="flex flex-col gap-2">
          <span id="deal-tipo-etiqueta" className="text-sm font-medium text-fg">{t('tipo')}</span>
          <ChipsOpcion<DealType>
            aria-labelledby="deal-tipo-etiqueta"
            opciones={DEAL_TYPES.map((v) => ({ valor: v, etiqueta: tr(`tipos.${v}`) }))}
            valor={tipo}
            onValorChange={setTipo}
          />
        </div>

        <dl className="flex flex-col gap-2 rounded-xl bg-brand-tint/60 px-4 py-3 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-secondary">{t('montoOportunidad')}</dt>
            <dd className="tabular-nums text-fg">{opp?.amount != null ? formatMoney(opp.amount, moneda) : '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-secondary">{etiquetaTasa}</dt>
            <dd className="tabular-nums text-fg">{formatRate(tasa)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-secondary">{t('comisionSugerida')}</dt>
            <dd className="text-lg font-semibold tabular-nums text-fg">{sugerida !== null ? formatMoney(sugerida, moneda) : '—'}</dd>
          </div>
        </dl>

        <FormField
          etiqueta={t('comision')}
          error={errorComision}
          ayuda={puedeAjustar ? t('comisionAyuda') : t('comisionSoloGestion')}
        >
          {(campo) => (
            <CampoNumero
              id={campo.id}
              aria-describedby={campo['aria-describedby']}
              aria-invalid={campo['aria-invalid']}
              valor={comision}
              onValorChange={(v) => {
                setComision(v);
                setErrorComision(null);
              }}
              prefijo="$"
              decimales={2}
              minimo={0}
              alinear="izquierda"
              disabled={!puedeAjustar || !opp}
              lang={idioma}
            />
          )}
        </FormField>

        <AvisoTonal tono="informacion" titulo={t('aviso')} compacto rol="note" />

        {error && <AvisoTonal tono="peligro" titulo={t('error')} descripcion={error} rol="alert" />}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          {t('registrar')}
        </button>
      </form>
    </Dialogo>
  );
}
