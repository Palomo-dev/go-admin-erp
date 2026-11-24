'use client';

/**
 * Cambiar y anular un boleto (Figma «23 Transporte» › 16: cambiar 2900:17661, anular
 * 2900:17768) con las reglas de Configuración › Transporte: cambio sin costo hasta N minutos
 * antes (fuera de plazo solo quien gestiona Transporte) y anulación con reembolso % hasta N horas
 * antes. La base decide (fn_transporte_cambiar_boleto / fn_transporte_anular_boleto); aquí se
 * anticipa el resultado. El reembolso queda calculado en el boleto: devolver el dinero va por la
 * caja (pendiente de integrar con posService).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, Dialogo } from '@/components/kit';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { AJUSTES_TRANSPORTE_POR_DEFECTO, normalizarAjustesTransporte, type AjustesTransporte } from '@/lib/transporte/ajustesTransporte';
import { cambioSinCosto, reembolsoAlAnular, type PuestoViaje } from '@/lib/transporte/pasajes';
import { anularBoleto, cambiarBoleto, puestosDeViaje, viajesVendibles, type ViajeVendible } from '@/lib/services/transporte/pasajesService';
import { PlanoPuestos } from './PlanoPuestos';

export interface BoletoParaGestionar {
  id: string;
  ticket_number: string;
  trip_id: string;
  seat_number?: string | null;
  total: number;
  payment_status?: string | null;
  salida?: string | null;
}

function useAjustesTransporte(): AjustesTransporte {
  const [a, setA] = useState<AjustesTransporte>(AJUSTES_TRANSPORTE_POR_DEFECTO);
  useEffect(() => {
    const org = Number(getOrganizationId()) || null;
    fetch('/api/transporte/ajustes', { credentials: 'same-origin', cache: 'no-store', headers: org ? { 'x-organization-id': String(org) } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => c?.ajustes && setA(normalizarAjustesTransporte(c.ajustes)))
      .catch(() => undefined);
  }, []);
  return a;
}

export function DialogoCambiarBoleto({ boleto, onCerrar, onHecho }: { boleto: BoletoParaGestionar; onCerrar: () => void; onHecho: () => void }) {
  const t = useTranslations('transporte.pasajes.cambiar');
  const tr = useTranslations('transporte.pasajes.respuestas');
  const { formatTime, formatPlain, getToday } = useFormatDate();
  const ajustes = useAjustesTransporte();
  const [viajes, setViajes] = useState<ViajeVendible[]>([]);
  const [viajeId, setViajeId] = useState(boleto.trip_id);
  const [puestos, setPuestos] = useState<PuestoViaje[]>([]);
  const [puesto, setPuesto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const org = Number(getOrganizationId()) || null;
    if (org) viajesVendibles(supabase, org, getToday()).then(setViajes).catch(() => setViajes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setPuesto(null);
    puestosDeViaje(supabase, viajeId).then(setPuestos).catch(() => setPuestos([]));
  }, [viajeId]);

  const sinCosto = boleto.salida ? cambioSinCosto(boleto.salida, new Date(), ajustes.cambioSinCostoMin) : true;

  const cambiar = async () => {
    if (!puesto) return;
    setOcupado(true);
    const r = await cambiarBoleto(supabase, boleto.id, viajeId, puesto);
    setOcupado(false);
    if (r.estado === 'cambiado') {
      toastSuccess(t('hecho', { numero: boleto.ticket_number, puesto }));
      onHecho();
      onCerrar();
    } else toastError(tr(r.estado === 'error' ? 'error' : r.estado));
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !a && !ocupado && onCerrar()}
      titulo={t('titulo', { numero: boleto.ticket_number })}
      descripcion={t('descripcion', { puesto: boleto.seat_number ?? '—' })}
      ancho={672}
      textoCancelar={t('cancelar')}
      primario={{ etiqueta: t('confirmar'), onClick: () => void cambiar(), cargando: ocupado, deshabilitada: !puesto || ocupado, motivo: t('eligePuesto') }}
    >
      <div className="flex flex-col gap-3">
        <AvisoTonal
          tono={sinCosto ? 'informacion' : 'advertencia'}
          compacto
          titulo={sinCosto ? t('sinCosto', { n: ajustes.cambioSinCostoMin }) : t('fueraDePlazo', { n: ajustes.cambioSinCostoMin })}
        />
        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          {t('viaje')}
          <Select value={viajeId} onValueChange={setViajeId}>
            <SelectTrigger className="h-10 border-line-strong bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {viajes.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {[v.codigo, `${formatPlain(v.fecha)} ${formatTime(v.salida)}`, v.ruta].filter(Boolean).join(' · ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {puestos.length > 0 ? <PlanoPuestos puestos={puestos} seleccionado={puesto} onElegir={setPuesto} deshabilitado={ocupado} /> : <p className="text-sm text-fg-muted">{t('sinPlano')}</p>}
      </div>
    </Dialogo>
  );
}

export function DialogoAnularBoleto({ boleto, onCerrar, onHecho }: { boleto: BoletoParaGestionar; onCerrar: () => void; onHecho: () => void }) {
  const t = useTranslations('transporte.pasajes.anular');
  const tr = useTranslations('transporte.pasajes.respuestas');
  const moneda = useMonedaOrganizacion();
  const ajustes = useAjustesTransporte();
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const previo = useMemo(
    () =>
      boleto.salida
        ? reembolsoAlAnular({ salida: boleto.salida, ahora: new Date(), horas: ajustes.anulacionHoras, porcentaje: ajustes.reembolsoPct, total: Number(boleto.total) || 0, pagado: boleto.payment_status === 'paid' })
        : null,
    [boleto, ajustes],
  );

  const anular = async () => {
    setOcupado(true);
    const r = await anularBoleto(supabase, boleto.id, motivo);
    setOcupado(false);
    if (r.estado === 'anulado') {
      toastSuccess(r.reembolso ? t('hechoReembolso', { numero: boleto.ticket_number, valor: moneda.formatear(r.reembolso) }) : t('hecho', { numero: boleto.ticket_number }));
      onHecho();
      onCerrar();
    } else toastError(tr(r.estado === 'error' ? 'error' : r.estado));
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !a && !ocupado && onCerrar()}
      titulo={t('titulo', { numero: boleto.ticket_number })}
      descripcion={t('descripcion')}
      ancho={520}
      textoCancelar={t('volver')}
      primario={{ etiqueta: t('confirmar'), destructiva: true, onClick: () => void anular(), cargando: ocupado, deshabilitada: motivo.trim().length < 5 || ocupado, motivo: t('faltaMotivo') }}
    >
      <div className="flex flex-col gap-3">
        {previo && (
          <AvisoTonal
            tono={previo.reembolso > 0 ? 'informacion' : 'advertencia'}
            compacto
            titulo={
              previo.reembolso > 0
                ? t('conReembolso', { valor: moneda.formatear(previo.reembolso), pct: ajustes.reembolsoPct })
                : previo.aTiempo
                  ? t('sinPago')
                  : t('fueraDePlazo', { n: ajustes.anulacionHoras })
            }
            descripcion={previo.reembolso > 0 ? t('notaCaja') : undefined}
          />
        )}
        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          {t('motivo')}
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 300))} rows={2} />
        </label>
      </div>
    </Dialogo>
  );
}
