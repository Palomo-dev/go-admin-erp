'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { QualifyLeadDialog } from '@/components/crm/kit/QualifyLeadDialog';
import { OpportunityForm } from '@/components/crm/kit/OpportunityForm';
import type { LeadFila } from '@/components/crm/kit/leadRowLogica';
import type { ValoresOportunidad } from '@/components/crm/kit/opportunityFormLogica';
import type { CatalogosCrm } from '@/components/crm/acciones/catalogosCrmLogica';
import { claveError, emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { cuerpoCalificar, pasoSiguiente, type PasoCalificar } from './calificarLogica';

/**
 * «Calificar → crear oportunidad» (Figma 767:3240 paso 1 y 772:21705 paso 2):
 * `QualifyLeadDialog` → `OpportunityForm Origen=lead` (diálogo en escritorio,
 * hoja en móvil) → `POST /api/crm/leads/[id]/qualify`. La oportunidad nace en
 * el pipeline de ventas por defecto; el cliente pasa a 'opportunity' por el
 * disparador (la pantalla no toca `lifecycle_stage`).
 */
export interface CalificarLeadProps {
  lead: LeadFila | null;
  onCerrar: () => void;
  onDescartar: (lead: LeadFila) => void;
  catalogos: CatalogosCrm;
  moneda: ContextoMoneda;
  puedeDescartar: boolean;
  onCalificado: (oportunidadId: string | null) => void;
}

export function CalificarLead({ lead, onCerrar, onDescartar, catalogos, moneda, puedeDescartar, onCalificado }: CalificarLeadProps) {
  const t = useTranslations('crm.pantallaLeads.calificar');
  const te = useTranslations('crm.accionesRapidas.errores');
  const [paso, setPaso] = useState<PasoCalificar>(1);
  const [prefill, setPrefill] = useState<Partial<ValoresOportunidad>>({});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = () => {
    if (ocupado) return;
    setPaso(1);
    setError(null);
    onCerrar();
  };

  const enviar = async (cuerpo: Record<string, unknown>) => {
    if (!lead) return;
    setOcupado(true);
    setError(null);
    try {
      const { data } = await pedirCrm<{ id?: string; opportunity_id?: string }>(`/api/crm/leads/${lead.id}/qualify`, { method: 'POST', cuerpo: cuerpoCalificar(cuerpo) });
      const id = data?.id ?? data?.opportunity_id ?? null;
      toast({ title: t('hecho', { nombre: lead.full_name ?? '' }) });
      emitirCambioCrm({ entidad: 'lead', id: lead.id, accion: 'calificar' });
      setPaso(1);
      onCalificado(id);
    } catch (e) {
      setError(te(claveError(e)));
    } finally {
      setOcupado(false);
    }
  };

  if (!lead) return null;
  return (
    <>
      <QualifyLeadDialog
        abierto={paso === 1}
        onAbiertoChange={(x) => !x && cerrar()}
        lead={lead}
        moneda={moneda}
        usuarios={catalogos.usuarios}
        responsableId={lead.responsable?.id ?? catalogos.usuarioId}
        puedeDescartar={puedeDescartar}
        onDescartar={() => onDescartar(lead)}
        onContinuar={(p) => {
          setPrefill(p);
          setPaso(pasoSiguiente(1));
        }}
      />
      <OpportunityForm
        layout="dialog"
        origen="lead"
        abierto={paso === 2}
        onAbiertoChange={(x) => !x && cerrar()}
        prefill={prefill}
        contextoOrigen={{ titulo: t('contexto', { nombre: lead.full_name ?? '' }), detalle: t('contextoDetalle') }}
        origenRef={{ customer_id: lead.id }}
        pipelines={catalogos.pipelines}
        etapas={catalogos.etapas}
        usuarios={catalogos.usuarios}
        usuarioActualId={catalogos.usuarioId}
        monedaBase={moneda}
        clienteNombre={lead.full_name}
        onEnviar={(c) => void enviar(c as Record<string, unknown>)}
        onCancelar={cerrar}
        ocupado={ocupado}
        error={error}
      />
    </>
  );
}
