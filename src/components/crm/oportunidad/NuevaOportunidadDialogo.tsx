'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { OpportunityForm } from '@/components/crm/kit/OpportunityForm';
import { CustomerLinkPicker } from '@/components/crm/kit/CustomerLinkPicker';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import type { EtapaFormulario } from '@/components/crm/kit/opportunityFormLogica';
import type { PipelineOpcion } from '@/components/crm/kit/OpportunityFormCampos';
import { buscarClientesCrm } from '@/components/crm/acciones/buscarClientes';
import { claveError } from '@/components/crm/acciones/apiCrm';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearOportunidad } from './apiOportunidades';

/**
 * «Nueva oportunidad» en diálogo desde el «+» de una columna o «+ Nueva
 * oportunidad» del Pipeline (Figma 778:33942): el MISMO `OpportunityForm` del
 * kit (`layout=dialog`, hoja en móvil) con el embudo y la etapa de la
 * columna prellenados; cliente con `CustomerLinkPicker`. `POST
 * /api/crm/opportunities`. Las líneas se agregan en la página completa.
 */
export interface NuevaOportunidadDialogoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  pipelineId: string | null;
  etapaId?: string | null;
  pipelines: readonly PipelineOpcion[];
  etapas: readonly EtapaFormulario[];
  usuarios: readonly OpcionUsuario[];
  usuarioId: string | null;
  onCreada: (id: string) => void;
  /** «Agregar productos o conceptos» → la página completa con lo mismo prellenado. */
  onPaginaCompleta?: () => void;
}

export function NuevaOportunidadDialogo(p: NuevaOportunidadDialogoProps) {
  const t = useTranslations('crm.oportunidad.nueva');
  const te = useTranslations('crm.accionesRapidas.errores');
  const moneda = useMonedaOrganizacion();
  const [cliente, setCliente] = useState<{ id: string; nombre: string | null } | null>(null);
  const [picker, setPicker] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (cuerpo: Record<string, unknown>) => {
    setOcupado(true);
    setError(null);
    try {
      const nueva = await crearOportunidad(cuerpo);
      toast({ title: t('creada') });
      setCliente(null);
      p.onAbiertoChange(false);
      if (nueva?.id) p.onCreada(nueva.id);
    } catch (e) {
      setError(te(claveError(e)));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <OpportunityForm
        layout="dialog"
        origen="general"
        abierto={p.abierto}
        onAbiertoChange={(a) => {
          if (!a) setCliente(null);
          p.onAbiertoChange(a);
        }}
        prefill={{ pipeline_id: p.pipelineId ?? undefined, stage_id: p.etapaId ?? undefined }}
        pipelines={p.pipelines}
        etapas={p.etapas}
        usuarios={p.usuarios}
        usuarioActualId={p.usuarioId}
        monedaBase={moneda}
        clienteNombre={cliente?.nombre ?? null}
        clienteId={cliente?.id ?? null}
        onElegirCliente={() => setPicker(true)}
        onAgregarLineas={p.onPaginaCompleta}
        onEnviar={(c) => void enviar(c as Record<string, unknown>)}
        ocupado={ocupado}
        error={error}
      />
      <CustomerLinkPicker abierto={picker} onAbiertoChange={setPicker} buscar={buscarClientesCrm} onSeleccionar={(c) => { setCliente({ id: c.id, nombre: c.full_name }); setPicker(false); }} />
    </>
  );
}
