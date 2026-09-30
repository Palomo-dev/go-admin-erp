'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, Info, Loader2, Save, Users } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { FormField } from '@/components/kit/FormField';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { aFechaHoraLocal, deFechaHoraLocal, diaRelativo, fechaCortaPlana } from '@/components/crm/kit/fechasCrm';
import { claveCanal } from '@/components/crm/kit/opportunityCardLogica';
import { claveError } from '@/components/crm/acciones/apiCrm';
import { ScoringSection } from '@/components/crm/oportunidades/ScoringSection';
import { DiscoverySection } from '@/components/crm/pipeline/drawer/DiscoverySection';
import { SalesTeamTerritorySelectors } from '@/components/crm/pipeline/drawer/SalesTeamTerritorySelectors';
import { OpportunityObjectionsBlock } from '@/components/crm/objeciones/OpportunityObjectionsBlock';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { CANALES_CONTACTO, guardarSeguimiento, RESULTADOS_CONTACTO, type OportunidadDetalleApi } from './apiOportunidades';

/**
 * Pestaña Resumen del drawer (Figma 820:64894 / 820:65664; móvil 824:170975):
 * «Próximo paso» (acción, fecha y hora en la zona de la organización, canal,
 * resultado del último contacto y temperatura) por `PATCH …/seguimiento`;
 * información; equipo y responsable, calificación GOC, discovery y objeciones
 * (secciones existentes, que ya escriben por `/api/crm/**`).
 */
export interface ResumenOportunidadProps {
  op: OportunidadDetalleApi;
  puedeEditar: boolean;
  onCambio: () => void;
  ahora?: Date;
}

type Seguimiento = { accion: string; cuando: string; canal: string; resultado: string; temperatura: string };

function Tarjeta({ icono: Icono, titulo, extra, children }: { icono: typeof Clock; titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <header className="flex items-center gap-2">
        <Icono aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
        <h3 className="flex-1 text-sm font-semibold text-fg">{titulo}</h3>
        {extra}
      </header>
      {children}
    </section>
  );
}

export function ResumenOportunidad({ op, puedeEditar, onCambio, ahora = new Date() }: ResumenOportunidadProps) {
  const t = useTranslations('crm.oportunidad.resumen');
  const tt = useTranslations('crm.kit.tarjeta');
  const te = useTranslations('crm.accionesRapidas.errores');
  const idioma = useLocale();
  const { timezone, formatDate } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const inicial = (): Seguimiento => ({ accion: op.next_action ?? '', cuando: aFechaHoraLocal(op.next_contact_at, timezone), canal: op.contact_channel ?? '', resultado: op.contact_result ?? '', temperatura: op.temperature ?? '' });
  const [v, setV] = useState<Seguimiento>(inicial);
  const [guardando, setGuardando] = useState(false);
  // Se reinicia cuando la oportunidad cambia en el servidor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setV(inicial()), [op.id, op.updated_at, timezone]);
  const sucio = JSON.stringify(v) !== JSON.stringify(inicial());
  const ultimo = diaRelativo(op.last_contact_at, ahora, timezone);

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarSeguimiento(op.id, {
        next_action: v.accion.trim() || null,
        next_contact_at: deFechaHoraLocal(v.cuando, timezone),
        temperature: v.temperatura || null,
        contact_channel: v.canal || null,
        contact_result: v.resultado || null,
      });
      toast({ title: t('guardado') });
      onCambio();
    } catch (e) {
      toast({ title: t('errorGuardar'), description: te(claveError(e)), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const monedaOp = moneda.paraDocumento(op.currency);
  const dato = (etiqueta: string, valor: ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-fg-secondary">{etiqueta}</dt>
      <dd className="text-sm font-medium text-fg">{valor}</dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta icono={Clock} titulo={t('proximoPaso')} extra={ultimo && <span className="text-xs text-fg-secondary">{t('ultimoContacto', { canal: tt(`canal.${claveCanal(op.contact_channel)}`), cuando: ultimo.tipo === 'hoy' ? t('hoy') : t('hace', { dias: 'dias' in ultimo ? ultimo.dias : 1 }) })}</span>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('accion')}>
            <input value={v.accion} onChange={(e) => setV({ ...v, accion: e.target.value })} disabled={!puedeEditar} maxLength={500} className={CLASE_CAMPO} />
          </FormField>
          <FormField etiqueta={t('fechaHora')} ayuda={t('zona', { zona: timezone })}>
            <input type="datetime-local" value={v.cuando} onChange={(e) => setV({ ...v, cuando: e.target.value })} disabled={!puedeEditar} className={CLASE_CAMPO} />
          </FormField>
          <FormField etiqueta={t('canal')}>
            <select value={v.canal} onChange={(e) => setV({ ...v, canal: e.target.value })} disabled={!puedeEditar} className={CLASE_CAMPO}>
              <option value="">—</option>
              {CANALES_CONTACTO.map((c) => <option key={c} value={c}>{t(`canales.${c}`)}</option>)}
            </select>
          </FormField>
          <FormField etiqueta={t('resultado')}>
            <select value={v.resultado} onChange={(e) => setV({ ...v, resultado: e.target.value })} disabled={!puedeEditar} className={CLASE_CAMPO}>
              <option value="">—</option>
              {RESULTADOS_CONTACTO.map((c) => <option key={c} value={c}>{t(`resultados.${c}`)}</option>)}
            </select>
          </FormField>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-fg">{t('temperatura')}</span>
            <SegmentedControl etiqueta={t('temperatura')} valor={v.temperatura || 'none'} onValorChange={(x) => setV({ ...v, temperatura: x === 'none' ? '' : x })} deshabilitado={!puedeEditar} opciones={(['cold', 'warm', 'hot'] as const).map((x) => ({ valor: x, etiqueta: t(`temperaturas.${x}`) }))} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-muted">{sucio ? t('cambiosSinGuardar') : t('sinCambios')}</span>
            {puedeEditar && (
              <button type="button" onClick={() => void guardar()} disabled={!sucio || guardando} aria-busy={guardando || undefined} className={clasesBoton()}>
                {guardando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" />}
                {t('guardar')}
              </button>
            )}
          </div>
        </div>
      </Tarjeta>
      <Tarjeta icono={Info} titulo={t('informacion')}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {dato(t('monto'), formatMoneda(op.amount, monedaOp))}
          {dato(t('moneda'), monedaOp.code === moneda.code ? t('monedaBase', { codigo: monedaOp.code }) : monedaOp.code)}
          {dato(t('cierre'), op.expected_close_date ? fechaCortaPlana(op.expected_close_date, idioma, true) : '—')}
          {dato(t('creada'), op.created_at ? formatDate(op.created_at) : '—')}
        </dl>
      </Tarjeta>
      <Tarjeta icono={Users} titulo={t('equipo')}>
        <SalesTeamTerritorySelectors opportunityId={op.id} initialTeamId={op.sales_team_id} initialTerritoryId={op.territory_id} initialSalespersonId={op.salesperson_id} onUpdated={onCambio} />
      </Tarjeta>
      <ScoringSection opportunityId={op.id} />
      <DiscoverySection opportunityId={op.id} initialData={op.discovery_data ?? null} onUpdated={onCambio} />
      <OpportunityObjectionsBlock opportunityId={op.id} onChanged={onCambio} />
    </div>
  );
}
