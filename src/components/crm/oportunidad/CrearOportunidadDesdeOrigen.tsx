'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink, Loader2, TrendingUp } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import { OpportunityForm } from '@/components/crm/kit/OpportunityForm';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { claveError, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { formatMoneda } from '@/lib/utils/moneda';
import type { OrigenOportunidad, TipoOrigenOportunidad } from '@/lib/services/crm/opportunityOriginService';
import { crearOportunidad } from './apiOportunidades';
import { LineasOportunidad } from './LineasOportunidad';
import { cantidadLineas, cuerpoLineas, lineasValidas, LINEAS_VACIAS, totalLineas, type Lineas } from './lineasLogica';

/** Finanzas/Chat abren el formulario único. La RPC deriva y enlaza el origen, nunca el navegador. */
export function CrearOportunidadDesdeOrigen({ tipo, id }: { tipo: TipoOrigenOportunidad; id: string }) {
  const t = useTranslations('crm.origenOportunidad');
  const te = useTranslations('crm.accionesRapidas.errores');
  const cat = useCatalogosCrm();
  const moneda = useMonedaOrganizacion();
  const { formatDateTime } = useFormatDate();
  const [abierto, setAbierto] = useState(false);
  const [origen, setOrigen] = useState<OrigenOportunidad | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [lineas, setLineas] = useState<Lineas>(LINEAS_VACIAS);
  const [lineasAbiertas, setLineasAbiertas] = useState(false);
  const lock = useRef(false);
  const revision = useRef(0);
  const orgOrigen = useRef<number | null>(null);
  const cargar = useCallback(async () => {
    const actual = ++revision.current;
    orgOrigen.current = getOrganizationId();
    setCargando(true);
    setError(null);
    try {
      const { data } = await pedirCrm<OrigenOportunidad>(`/api/crm/opportunity-origins/${tipo}/${encodeURIComponent(id)}`);
      if (revision.current === actual && getOrganizationId() === orgOrigen.current) setOrigen(data);
    } catch (e) {
      if (revision.current === actual) setError(te(claveError(e)));
    } finally {
      if (revision.current === actual) setCargando(false);
    }
  }, [tipo, id, te]);
  useEffect(() => {
    revision.current += 1;
    setOrigen(null);
    setAbierto(false);
    setLineas(LINEAS_VACIAS);
  }, [tipo, id]);
  useEffect(() => {
    const cambiar = () => { revision.current += 1; setAbierto(false); setOrigen(null); setLineasAbiertas(false); };
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, cambiar);
    return () => { revision.current += 1; window.removeEventListener(ORGANIZATION_CHANGED_EVENT, cambiar); };
  }, []);

  const enviar = async (cuerpo: Record<string, unknown>) => {
    if (lock.current || !origen) return;
    if (orgOrigen.current !== getOrganizationId()) { setError(te('organizacionCambiada')); return; }
    if (!lineasValidas(lineas)) { setError(te('datos')); return; }
    lock.current = true;
    setOcupado(true);
    setError(null);
    const actual = revision.current;
    try {
      const nueva = await crearOportunidad({ ...cuerpo, ...(tipo === 'conversacion' && cantidadLineas(lineas) ? { ...cuerpoLineas(lineas), amount: totalLineas(lineas) } : {}) });
      if (!nueva?.id) throw new Error('Respuesta incompleta');
      if (revision.current === actual) {
        setOrigen({ ...origen, opportunity_id: nueva.id });
        setAbierto(false);
      }
    } catch (e) {
      if (revision.current === actual) setError(te(claveError(e)));
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  };
  if (!cat.permisos['crm.opportunities.create']) return null;
  const docMoneda = moneda.paraDocumento(origen?.currency);
  const contexto = origen ? tipo === 'conversacion'
    ? { titulo: t('desdeConversacion', { canal: origen.canal ?? '', cliente: origen.cliente_nombre ?? '' }), detalle: t('conversacionDetalle', { canal: origen.canal ?? '', fecha: origen.occurred_at ? formatDateTime(origen.occurred_at) : '' }) }
    : { titulo: t(tipo === 'factura' ? 'desdeFactura' : 'desdeCotizacion', { numero: origen.numero ?? '' }), detalle: t('documentoDetalle', { cliente: origen.cliente_nombre ?? '', monto: formatMoneda(origen.amount, docMoneda), n: origen.lineas.length }) }
    : null;
  return (
    <>
      {origen?.opportunity_id ? (
        <Link href={`/app/crm/oportunidades/${origen.opportunity_id}`} className={clasesBoton({ variante: 'secundario' })}><ExternalLink aria-hidden="true" className="size-4" />{t('ver')}</Link>
      ) : (
        <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => { setLineas(LINEAS_VACIAS); setAbierto(true); void cargar(); }} disabled={cat.cargando || ocupado}>
          <TrendingUp aria-hidden="true" className="size-4" strokeWidth={1.5} />{t('crear')}
        </button>
      )}
      {abierto && (!origen || cargando || origen.opportunity_id) ? (
        <PanelAdaptable abierto onAbiertoChange={setAbierto} titulo={t('crear')}>
          {cargando ? <Loader2 aria-label={t('cargando')} className="size-5 animate-spin" /> : origen?.opportunity_id ? (
            <Link href={`/app/crm/oportunidades/${origen.opportunity_id}`} className={clasesBoton()}>{t('ver')}</Link>
          ) : <><p role="alert" className="text-danger-text">{error}</p><button type="button" onClick={() => void cargar()} className={clasesBoton()}>{t('reintentar')}</button></>}
        </PanelAdaptable>
      ) : abierto && origen ? (
        <OpportunityForm layout="sheet" origen={tipo === 'conversacion' ? 'conversacion' : 'factura'} abierto onAbiertoChange={(a) => !lock.current && setAbierto(a)}
          contextoOrigen={contexto} origenRef={{ tipo, id: origen.id, updated_at: origen.updated_at }}
          prefill={{ customer_id: origen.customer_id, name: tipo === 'conversacion' ? t('nombreConversacion', { cliente: origen.cliente_nombre ?? '' }) : `${origen.numero ?? ''} · ${origen.cliente_nombre ?? ''}`, amount: String(origen.amount), currency: origen.currency ?? moneda.code }}
          pipelines={cat.pipelines} etapas={cat.etapas} usuarios={cat.usuarios} usuarioActualId={cat.usuarioId} clienteNombre={origen.cliente_nombre} monedaBase={docMoneda}
          lineasFactura={tipo !== 'conversacion' ? { numero: origen.numero ?? '', lineas: origen.lineas } : null}
          onAgregarLineas={tipo === 'conversacion' ? () => setLineasAbiertas(true) : undefined}
          montoCalculado={tipo === 'conversacion' && cantidadLineas(lineas) ? totalLineas(lineas) : null}
          onEnviar={(c) => void enviar(c as Record<string, unknown>)} ocupado={ocupado} error={error} />
      ) : null}
      <PanelAdaptable abierto={lineasAbiertas} onAbiertoChange={setLineasAbiertas} titulo={t('lineas')} ancho={800} pie={<button type="button" onClick={() => setLineasAbiertas(false)} className={clasesBoton()}>{t('volver')}</button>}>
        <LineasOportunidad lineas={lineas} onCambiar={setLineas} moneda={docMoneda} deshabilitado={ocupado} />
      </PanelAdaptable>
    </>
  );
}
