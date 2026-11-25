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
import { MARCADOR_CLIENTE } from '@/lib/services/crm/calificarLoteLogica';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { LineasOportunidad } from '@/components/crm/oportunidad/LineasOportunidad';
import { cantidadLineas, cuerpoLineas, LINEAS_VACIAS, lineasParaLote, lineasValidas, totalesLineas, type Lineas } from '@/components/crm/oportunidad/lineasLogica';
import { AvataresLote, CalificarLoteResultado, VistaPreviaNombres } from './CalificarLoteResultado';
import { cuerpoLote, leadPlantillaLote, RESPONSABLE_DE_CADA_LEAD, type FaseLote, type ResultadoLote } from './calificarLotePantallaLogica';

/**
 * «Calificar en lote» (2 o más leads): el mismo paso 1 (`QualifyLeadDialog`,
 * con los leads como avatares y «El de cada lead» como responsable) y el mismo
 * paso 2 (`OpportunityForm Origen=lead`) que el flujo de un lead; el nombre
 * lleva `{cliente}`, que el servidor reemplaza por el nombre de cada lead.
 * Un solo `POST /api/crm/leads/qualify-bulk`; el resultado (creadas y
 * fallidas con motivo) se muestra en el mismo diálogo.
 *
 * «Qué le vas a vender (a cada uno)» (Figma 1768:890017): las mismas líneas
 * para todos, sin hospedaje; el primario dice cuántas y el valor total
 * («Crear 24 oportunidades · $ 60.690.000») y el resultado, cuántas se
 * crearon con líneas y el valor que entró al pipeline.
 */
export interface CalificarLeadsLoteProps {
  /** Ids seleccionados (null = cerrado). */
  ids: readonly string[] | null;
  /** Filas visibles de los seleccionados (para los avatares). */
  leads: readonly LeadFila[];
  onCerrar: () => void;
  catalogos: CatalogosCrm;
  moneda: ContextoMoneda;
  /** Tras crear al menos una oportunidad (limpia la selección). */
  onCalificados: () => void;
  onVerPipeline: () => void;
}

export function CalificarLeadsLote({ ids, leads, onCerrar, catalogos, moneda, onCalificados, onVerPipeline }: CalificarLeadsLoteProps) {
  const t = useTranslations('crm.pantallaLeads.lote');
  const te = useTranslations('crm.accionesRapidas.errores');
  const [fase, setFase] = useState<FaseLote>('datos');
  const [prefill, setPrefill] = useState<Partial<ValoresOportunidad>>({});
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);
  const [lineas, setLineas] = useState<Lineas>(LINEAS_VACIAS);
  const [patron, setPatron] = useState('');
  const plantilla = lineasParaLote(lineas);
  const hayLineas = cantidadLineas(plantilla) > 0;
  const totalUno = totalesLineas(plantilla).total;

  if (!ids || ids.length === 0) return null;
  const n = ids.length;
  const cadaLead = { valor: RESPONSABLE_DE_CADA_LEAD, etiqueta: t('cadaLead') };

  const cerrar = () => {
    if (fase === 'enviando') return;
    setFase('datos');
    setError(null);
    setResultado(null);
    setLineas(LINEAS_VACIAS);
    onCerrar();
  };

  const enviar = async (cuerpo: Record<string, unknown>) => {
    if (!lineasValidas(plantilla)) {
      setError(t('lineasInvalidas'));
      return;
    }
    setFase('enviando');
    setPatron(typeof cuerpo.name === 'string' ? cuerpo.name : '');
    setError(null);
    setResultado(null);
    try {
      const { data } = await pedirCrm<ResultadoLote>('/api/crm/leads/qualify-bulk', { method: 'POST', cuerpo: cuerpoLote(hayLineas ? { ...cuerpo, ...cuerpoLineas(plantilla, { sinIds: true }), spaces: undefined } : cuerpo, ids) });
      const r: ResultadoLote = { creadas: data?.creadas ?? [], fallidas: data?.fallidas ?? [] };
      setResultado(r);
      setFase('resultado');
      toast({ title: t('creadas', { n: r.creadas.length }), description: r.fallidas.length ? t('fallidas', { n: r.fallidas.length }) : undefined });
      if (r.creadas.length) {
        emitirCambioCrm({ entidad: 'lead', accion: 'calificar' });
        onCalificados();
      }
    } catch (e) {
      setError(te(claveError(e)));
      setFase('formulario');
    }
  };

  return (
    <>
      <QualifyLeadDialog
        abierto={fase === 'datos'}
        onAbiertoChange={(x) => !x && cerrar()}
        lead={leadPlantillaLote(ids[0])}
        moneda={moneda}
        usuarios={catalogos.usuarios}
        responsableId={RESPONSABLE_DE_CADA_LEAD}
        opcionResponsable={cadaLead}
        titulo={t('titulo', { n })}
        cabecera={<AvataresLote leads={leads} total={n} />}
        aviso={t('aviso')}
        onContinuar={(p) => {
          setPrefill(p);
          setFase('formulario');
        }}
      />
      <OpportunityForm
        layout="dialog"
        origen="lead"
        abierto={fase === 'formulario'}
        onAbiertoChange={(x) => !x && cerrar()}
        prefill={prefill}
        contextoOrigen={{ titulo: t('contexto', { n, marcador: MARCADOR_CLIENTE }), detalle: t('contextoDetalle', { marcador: MARCADOR_CLIENTE }) }}
        origenRef={{}}
        pipelines={catalogos.pipelines}
        etapas={catalogos.etapas}
        usuarios={catalogos.usuarios}
        usuarioActualId={catalogos.usuarioId}
        monedaBase={moneda}
        clienteNombre={t('clientes', { n })}
        titulo={t('tituloPaso2', { n })}
        descripcion={t('descripcionPaso2')}
        clienteFijoTexto={t('clientesDistintos', { n })}
        debajoNombre={(patron) => <VistaPreviaNombres patron={patron} leads={leads} total={n} />}
        montoPlaceholder={t('montoPlaceholder')}
        montoAyuda={t('montoAyuda')}
        opcionResponsable={cadaLead}
        montoCalculado={hayLineas ? totalUno : null}
        textoCrear={hayLineas ? t('crearConTotal', { n, total: formatMoneda(totalUno * n, moneda) }) : t('crearN', { n })}
        seccionLineas={<LineasOportunidad variante="dialogo" lote lineas={plantilla} onCambiar={setLineas} moneda={moneda} usuarios={catalogos.usuarios} />}
        onEnviar={(c) => void enviar(c as Record<string, unknown>)}
        onCancelar={cerrar}
        error={error}
      />
      <CalificarLoteResultado
        abierto={fase === 'enviando' || fase === 'resultado'}
        total={n}
        leads={leads}
        patron={patron}
        resultado={fase === 'resultado' ? resultado : null}
        conLineas={hayLineas ? { lineas: cantidadLineas(plantilla), valorPorOportunidad: totalUno, moneda } : null}
        onCerrar={cerrar}
        onVerPipeline={() => {
          cerrar();
          onVerPipeline();
        }}
      />
    </>
  );
}
