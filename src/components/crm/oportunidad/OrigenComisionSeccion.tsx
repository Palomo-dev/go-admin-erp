'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link2 } from 'lucide-react';
import { FormField } from '@/components/kit/FormField';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { LEAD_SOURCES } from '@/lib/crm/enums';
import { TIPOS_COMISION, type OrigenComision } from './lineasLogica';

/**
 * «Origen y comisión» del formulario en página (Figma 778:32176): origen
 * (`opportunities.source`, catálogo `LEAD_SOURCES`), vertical
 * (`GET /api/crm/verticales`), a quién se paga la comisión
 * (`commission_type`: el responsable, un intermediario o nadie) y el
 * porcentaje (`commission_rate` 0–100). Editable también al editar.
 */
export interface OrigenComisionSeccionProps {
  valor: OrigenComision;
  onCambiar: (v: OrigenComision) => void;
  deshabilitado?: boolean;
}

export function OrigenComisionSeccion({ valor, onCambiar, deshabilitado }: OrigenComisionSeccionProps) {
  const t = useTranslations('crm.oportunidad.origenComision');
  const to = useTranslations('crm.kit.leads.origen');
  const [verticales, setVerticales] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void pedirCrm<{ id: string; name: string }[]>('/api/crm/verticales').then(({ data }) => setVerticales(data ?? []), () => setVerticales([]));
  }, []);
  const cambiar = (p: Partial<OrigenComision>) => onCambiar({ ...valor, ...p });
  return (
    <section aria-labelledby="origen-comision" className="flex flex-col gap-3 border-t border-line pt-4">
      <h3 id="origen-comision" className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Link2 aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
        {t('titulo')}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField etiqueta={t('origen')}>
          <select value={valor.source} onChange={(e) => cambiar({ source: e.target.value })} disabled={deshabilitado} className={CLASE_CAMPO}>
            <option value="">{t('sinOrigen')}</option>
            {LEAD_SOURCES.map((o) => <option key={o} value={o}>{to(o)}</option>)}
            {valor.source && !(LEAD_SOURCES as readonly string[]).includes(valor.source) && <option value={valor.source}>{valor.source}</option>}
          </select>
        </FormField>
        <FormField etiqueta={t('vertical')}>
          <select value={valor.vertical_id} onChange={(e) => cambiar({ vertical_id: e.target.value })} disabled={deshabilitado} className={CLASE_CAMPO}>
            <option value="">{t('sinVertical')}</option>
            {verticales.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </FormField>
        <FormField etiqueta={t('comisionista')}>
          <select value={valor.commission_type} onChange={(e) => cambiar({ commission_type: e.target.value as OrigenComision['commission_type'] })} disabled={deshabilitado} className={CLASE_CAMPO}>
            {TIPOS_COMISION.map((c) => <option key={c} value={c}>{t(`tipos.${c}`)}</option>)}
          </select>
        </FormField>
        <FormField etiqueta={t('comision')} ayuda={t('comisionAyuda')}>
          <input inputMode="decimal" value={valor.commission_rate} onChange={(e) => cambiar({ commission_rate: e.target.value })} disabled={deshabilitado || valor.commission_type === 'none'} placeholder="0" className={CLASE_CAMPO} />
        </FormField>
      </div>
    </section>
  );
}
