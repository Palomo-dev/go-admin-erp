'use client';

/**
 * No se pudo entregar (Figma 2802:10390 y la hoja 3231 «09 Novedad»): motivo, nota para la tienda,
 * foto de evidencia (con la ubicación del celular) y qué sigue: reintentar hoy a una hora, mañana o
 * devolver a la sede. UN solo formulario para dos contenedores: la hoja sobre la parada (celular y
 * computador, también la del supervisor) y la página `/no-entregado`, que sigue funcionando como
 * enlace directo.
 *
 * Una RPC: `logistica_registrar_novedad` (registerFailedAttempt) con la fecha a reprogramar; la
 * hora elegida va en el detalle (la base guarda el día). «Devolver a la sede» registra la novedad
 * y luego `logistica_cambiar_estado(… 'returned')`. La base decide quién puede (el domiciliario del
 * envío o quien gestiona Logística: `fn_logistica_envio_bloquear`).
 *
 * Sin señal no se guarda (decisión 2026-11-25: la cola sin conexión va en otra fase).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, ChipsOpcion, FormField, clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Input } from '@/components/ui/input';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { plainDateToInstant, todayInTz } from '@/lib/utils/dateCore';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import { subirImagenEnvio, type EnvioApp } from '@/lib/services/logistica/misEnviosService';
import {
  MOTIVOS_APP,
  claveDePlan,
  faltanteNovedad,
  fechaReprogramada,
  opcionesReintento,
  planSugerido,
  type MotivoApp,
  type PlanReintento,
} from '@/lib/logistica/misEnvios';
import { cn } from '@/utils/Utils';
import { ubicacionActual } from './ubicacion';
import { CapturaFoto } from './CapturaFoto';
import { AvisoPausaSinConexion, BarraInferior } from './piezas';
import { useEnLinea } from './useEnLinea';
import { avisarCliente } from '../logisticaApi';

export interface FormularioNovedadProps {
  envio: EnvioApp;
  orgId: number;
  /** Después de guardar (la hoja se cierra y la lista se recarga; la página vuelve a la ruta). */
  onHecho: () => void;
  /** `pagina`: botón en la barra fija del pie; `hoja`: botón al final del formulario. */
  variante?: 'pagina' | 'hoja';
  /** La hoja bloquea el cierre mientras guarda. */
  onOcupadoChange?: (ocupado: boolean) => void;
}

export function FormularioNovedad({ envio, orgId, onHecho, variante = 'pagina', onOcupadoChange }: FormularioNovedadProps) {
  const t = useTranslations('logistica.misEnvios.novedad');
  const tm = useTranslations('logistica.misEnvios');
  const locale = useLocaleIntl();
  const { resolveFor } = useOrgTimezone();
  const enLinea = useEnLinea();

  const [motivo, setMotivo] = useState<MotivoApp>('not_home');
  const [nota, setNota] = useState('');
  const [fotos, setFotos] = useState<Blob[]>([]);
  const [plan, setPlan] = useState<PlanReintento | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);

  const zona = resolveFor(envio.branch_id ?? null).timezone;
  const opciones = useMemo(() => opcionesReintento(new Date(), zona), [zona]);
  const planElegido = plan ?? planSugerido(motivo, opciones);
  const hoy = todayInTz(zona);
  const textoHora = (hora: number) =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(
      new Date(plainDateToInstant(hoy, zona, `${String(hora).padStart(2, '0')}:00`)),
    );
  const etiquetaPlan = (p: PlanReintento) => (p.tipo === 'hoy' ? t('plan.hoy', { hora: textoHora(p.hora) }) : t(`plan.${p.tipo}`));
  const faltante = faltanteNovedad({ motivo, nota, plan: planElegido });

  const ocupar = (v: boolean) => {
    setEnviando(v);
    onOcupadoChange?.(v);
  };

  const guardar = async () => {
    setIntentado(true);
    if (faltante || !enLinea) return;
    ocupar(true);
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
      onHecho();
    } catch (err) {
      const codigo = err instanceof EnvioError ? err.codigo : 'ERROR';
      toastError(tm('errores.titulo'), tm.has(`errores.${codigo}`) ? tm(`errores.${codigo}`) : tm('errores.ERROR'));
    } finally {
      ocupar(false);
    }
  };

  const boton = (
    <button
      type="button"
      onClick={guardar}
      disabled={enviando || !enLinea}
      aria-busy={enviando}
      className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}
    >
      {enviando ? tm('guardando') : t('guardar')}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[15px] font-medium text-fg-secondary">{t('quePaso')}</legend>
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
              name={`motivo-${envio.id}`}
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

      <FormField
        etiqueta={t('nota')}
        obligatorio={motivo === 'other'}
        ayuda={t('notaAyuda')}
        error={intentado && faltante === 'nota' ? t('faltaNota') : null}
      >
        <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} className="h-12 text-base" />
      </FormField>

      <CapturaFoto titulo={t('foto.titulo')} descripcion={t('foto.ayuda')} fotos={fotos} onFotosChange={setFotos} maximo={3} textoQuitar={tm('entregar.foto.quitar')} />

      <div className="flex flex-col gap-2">
        <h3 className="text-[15px] font-medium text-fg-secondary">{t('yAhora')}</h3>
        <ChipsOpcion<string>
          etiqueta={t('yAhora')}
          valor={claveDePlan(planElegido)}
          onValorChange={(clave) => setPlan(opciones.find((o) => claveDePlan(o) === clave) ?? null)}
          opciones={opciones.map((o) => ({ valor: claveDePlan(o), etiqueta: etiquetaPlan(o) }))}
        />
      </div>

      <AvisoTonal tono="informacion" compacto titulo={planElegido.tipo === 'devolver' ? t('aviso.devolver') : t('aviso.reintento')} />

      {!enLinea && <AvisoPausaSinConexion />}

      {variante === 'pagina' ? <BarraInferior>{boton}</BarraInferior> : boton}
    </div>
  );
}
