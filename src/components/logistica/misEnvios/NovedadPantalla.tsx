'use client';

/**
 * No se pudo entregar (Figma 2802:10390): motivo, nota para la tienda, foto de evidencia (con la
 * ubicación del celular) y qué sigue: reintentar hoy a una hora, mañana o devolver a la sede.
 *
 * Una RPC: `logistica_registrar_novedad` (registerFailedAttempt) con la fecha a reprogramar; la
 * hora elegida va en el detalle (la base guarda el día). «Devolver a la sede» registra la novedad
 * y luego `logistica_cambiar_estado(… 'returned')`.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AvisoTonal, ChipsOpcion, EmptyState, FormField, PageHeader, Skeleton, clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Input } from '@/components/ui/input';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { plainDateToInstant, todayInTz } from '@/lib/utils/dateCore';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import { subirImagenEnvio } from '@/lib/services/logistica/misEnviosService';
import {
  MOTIVOS_APP,
  claveDePlan,
  faltanteNovedad,
  fechaReprogramada,
  opcionesReintento,
  planSugerido,
  puedeReportarNovedad,
  type MotivoApp,
  type PlanReintento,
} from '@/lib/logistica/misEnvios';
import { cn } from '@/utils/Utils';
import { useParada } from './useMiRuta';
import { ubicacionActual } from './ParadaPantalla';
import { CapturaFoto } from './CapturaFoto';
import { BarraInferior } from './piezas';
import { RUTA_MIS_ENVIOS, rutaParada } from './rutas';
import { avisarCliente } from '../logisticaApi';

export function NovedadPantalla({ shipmentId }: { shipmentId: string }) {
  const t = useTranslations('logistica.misEnvios.novedad');
  const tm = useTranslations('logistica.misEnvios');
  const router = useRouter();
  const locale = useLocaleIntl();
  const { resolveFor } = useOrgTimezone();
  const { orgId, envio, estado } = useParada(shipmentId);

  const [motivo, setMotivo] = useState<MotivoApp>('not_home');
  const [nota, setNota] = useState('');
  const [fotos, setFotos] = useState<Blob[]>([]);
  const [plan, setPlan] = useState<PlanReintento | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);

  const zona = resolveFor(envio?.branch_id ?? null).timezone;
  const opciones = useMemo(() => opcionesReintento(new Date(), zona), [zona]);
  const planElegido = plan ?? planSugerido(motivo, opciones);
  const hoy = todayInTz(zona);
  const textoHora = (hora: number) =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(
      new Date(plainDateToInstant(hoy, zona, `${String(hora).padStart(2, '0')}:00`)),
    );
  const etiquetaPlan = (p: PlanReintento) => (p.tipo === 'hoy' ? t('plan.hoy', { hora: textoHora(p.hora) }) : t(`plan.${p.tipo}`));

  if (estado === 'cargando') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3" aria-busy="true">
        <PageHeader titulo={t('titulo')} variante="form" volverA={RUTA_MIS_ENVIOS} cargando />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (!envio || !orgId || !puedeReportarNovedad(String(envio.status))) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
        <PageHeader titulo={t('titulo')} variante="form" volverA={RUTA_MIS_ENVIOS} />
        <EmptyState
          variante="empty"
          compacto
          titulo={envio ? t('noAplica.titulo') : tm('parada.noEncontrada.titulo')}
          descripcion={envio ? t('noAplica.descripcion') : tm('parada.noEncontrada.descripcion')}
          accion={{ etiqueta: tm('volver'), onClick: () => router.push(envio ? rutaParada(envio.id) : RUTA_MIS_ENVIOS) }}
        />
      </div>
    );
  }

  const nombre = envio.delivery_contact_name || envio.customer?.full_name || tm('cliente');
  const faltante = faltanteNovedad({ motivo, nota, plan: planElegido });

  const guardar = async () => {
    setIntentado(true);
    if (faltante) return;
    setEnviando(true);
    try {
      const [urls, ubicacion] = await Promise.all([
        Promise.all(fotos.map((f) => subirImagenEnvio(supabase, orgId, envio.id, f, 'novedad'))),
        ubicacionActual(4000),
      ]);
      const detalle = [nota.trim(), planElegido.tipo === 'hoy' ? t('plan.detalleHora', { hora: textoHora(planElegido.hora) }) : null]
        .filter(Boolean)
        .join(' · ');
      const r = await deliveryIntegrationService.registerFailedAttempt(envio.id, {
        reasonCode: motivo,
        reasonText: detalle || undefined,
        rescheduleDate: fechaReprogramada(planElegido, hoy) ?? undefined,
        photoUrls: urls.length > 0 ? urls : undefined,
        latitude: ubicacion?.latitude,
        longitude: ubicacion?.longitude,
      });
      // Aviso «novedad» al cliente (no bloquea: si no sale, la novedad ya quedó registrada).
      void avisarCliente(envio, r.aviso);
      if (planElegido.tipo === 'devolver') {
        await deliveryIntegrationService.changeStatus(envio.id, 'returned', { nota: t('plan.devolver') });
      }
      toastSuccess(t('hecho'));
      router.push(RUTA_MIS_ENVIOS);
    } catch (err) {
      const codigo = err instanceof EnvioError ? err.codigo : 'ERROR';
      toastError(tm('errores.titulo'), tm.has(`errores.${codigo}`) ? tm(`errores.${codigo}`) : tm('errores.ERROR'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
      <PageHeader titulo={t('titulo')} subtitulo={`${envio.shipment_number} · ${nombre}`} variante="form" volverA={rutaParada(envio.id)} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-semibold text-fg">{t('quePaso')}</legend>
        {MOTIVOS_APP.map((m) => (
          <label
            key={m}
            className={cn(
              'flex min-h-[64px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3',
              motivo === m ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface',
            )}
          >
            <input
              type="radio"
              name="motivo"
              value={m}
              checked={motivo === m}
              onChange={() => {
                setMotivo(m);
                setPlan(null);
              }}
              className="size-5 accent-brand-action"
            />
            <span className="flex flex-col">
              <span className="text-[15px] font-medium text-fg">{t(`motivos.${m}.titulo`)}</span>
              <span className="text-[13px] text-fg-muted">{t(`motivos.${m}.descripcion`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <FormField etiqueta={t('nota')} obligatorio={motivo === 'other'} error={intentado && faltante === 'nota' ? t('faltaNota') : null}>
        <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} className="h-12 text-base" />
      </FormField>

      <CapturaFoto titulo={t('foto.titulo')} descripcion={t('foto.ayuda')} fotos={fotos} onFotosChange={setFotos} textoQuitar={tm('entregar.foto.quitar')} />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-fg">{t('yAhora')}</h2>
        <ChipsOpcion<string>
          etiqueta={t('yAhora')}
          valor={claveDePlan(planElegido)}
          onValorChange={(clave) => setPlan(opciones.find((o) => claveDePlan(o) === clave) ?? null)}
          opciones={opciones.map((o) => ({ valor: claveDePlan(o), etiqueta: etiquetaPlan(o) }))}
        />
      </div>

      <AvisoTonal tono="informacion" compacto titulo={planElegido.tipo === 'devolver' ? t('aviso.devolver') : t('aviso.reintento')} />

      <BarraInferior>
        <button type="button" onClick={guardar} disabled={enviando} aria-busy={enviando} className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
          {enviando ? tm('guardando') : t('guardar')}
        </button>
      </BarraInferior>
    </div>
  );
}
