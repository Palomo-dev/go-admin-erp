'use client';

/**
 * «Cuando el cliente no tiene interés» — Agentes IA › Ajustes (Figma
 * `VozDesinteres/Configuración`: vacío · excepción activa · error de
 * validación · solo lectura · móvil). Configuración de la ORGANIZACIÓN, no de
 * un agente: qué hace el agente de voz ante el desinterés definitivo en una
 * llamada de venta, con excepciones por valor y por etapa.
 *
 * Datos y permisos del servidor: `GET|PUT /api/crm/voice-agents/desinteres`
 * (la organización sale de la sesión; cambiarla exige «Configurar etapas»).
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Info, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { EmptyState } from '@/components/kit/EmptyState';
import { TarjetaSeleccionable } from '@/components/kit/TarjetaSeleccionable';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { describeError, logError } from '@/lib/utils/errorMessage';
import { fetchJson } from '@/lib/utils/fetchJson';
import { MODOS_DESINTERES, type ModoDesinteres } from '@/lib/services/crm/voiceAgent/desinteresConfig';
import {
  borradorDesde,
  cuerpoDesde,
  erroresDesdeServidor,
  hayErrores,
  mismoBorrador,
  validarBorrador,
  type BorradorDesinteres,
  type ErroresBorrador,
  type VistaDesinteres,
} from './desinteresVozLogica';
import { ExcepcionesDesinteres } from './ExcepcionesDesinteres';

const RUTA = '/api/crm/voice-agents/desinteres';

export function DesinteresVozCard() {
  const t = useTranslations('crm.agentesIa.ajustes.desinteres');
  const { formatDateTime } = useFormatDate();
  const idTitulo = useId();
  const idModos = useId();
  const [vista, setVista] = useState<VistaDesinteres | null>(null);
  const [borrador, setBorrador] = useState<BorradorDesinteres | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<ErroresBorrador>({});
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const json = await fetchJson<{ success?: boolean; error?: string; data?: VistaDesinteres }>(RUTA, { cache: 'no-store' });
      if (!json?.success || !json.data) throw new Error(json?.error || t('errorCarga'));
      setVista(json.data);
      setBorrador(borradorDesde(json.data.config, json.data.monedaBase));
      setErrores({});
      setIntentado(false);
    } catch (err) {
      logError('[DesinteresVozCard] cargar', err);
      setError(describeError(err));
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const original = useMemo(() => (vista ? borradorDesde(vista.config, vista.monedaBase) : null), [vista]);
  const sucio = Boolean(borrador && original && !mismoBorrador(borrador, original));
  const erroresVisibles = intentado ? { ...validarBorrador(borrador ?? (original as BorradorDesinteres), vista?.monedas ?? []), ...errores } : errores;
  const cuantosErrores = Object.values(erroresVisibles).filter(Boolean).length;

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="error" titulo={t('errorTitulo')} descripcion={error} onReintentar={() => void cargar()} />
      </div>
    );
  }
  if (!vista || !borrador) {
    return <div aria-busy="true" aria-label={t('cargando')} className="h-96 max-w-3xl animate-pulse rounded-xl border border-line bg-subtle" />;
  }

  const lectura = !vista.puedeEditar;
  const cambiar = (parcial: Partial<BorradorDesinteres>) => {
    setBorrador((b) => (b ? { ...b, ...parcial } : b));
    setErrores({});
  };

  const guardar = async () => {
    setIntentado(true);
    const locales = validarBorrador(borrador, vista.monedas);
    if (hayErrores(locales)) return;
    setGuardando(true);
    try {
      const res = await fetch(RUTA, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpoDesde(borrador)) });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string; data?: VistaDesinteres } | null;
      if (!res.ok || !json?.success || !json.data) {
        const delServidor = erroresDesdeServidor(json);
        if (hayErrores(delServidor)) {
          setErrores(delServidor);
          return;
        }
        throw new Error(res.status === 403 ? t('sinPermiso') : json?.error || t('errorGuardar'));
      }
      setVista(json.data);
      setBorrador(borradorDesde(json.data.config, json.data.monedaBase));
      setErrores({});
      setIntentado(false);
      toast({ title: t('guardado') });
    } catch (err) {
      logError('[DesinteresVozCard] guardar', err);
      toast({ title: t('errorGuardar'), description: describeError(err), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const pie = !vista.config.guardada
    ? t('pie.sinGuardar')
    : vista.config.actualizadaEn
      ? t('pie.guardado', { cuando: formatDateTime(vista.config.actualizadaEn) })
      : t('pie.guardadoSinFecha');

  return (
    <section aria-labelledby={idTitulo} className="flex max-w-3xl flex-col gap-4 rounded-xl border border-line bg-surface p-4 md:px-6 md:py-5">
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <Bot className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={idTitulo} className="text-base font-semibold text-fg">{t('titulo')}</h2>
          <p className="text-sm text-fg-muted">{t('subtitulo')}</p>
        </div>
        {!vista.config.guardada && <Badge tono="neutro" tamano="sm">{t('porDefecto')}</Badge>}
      </header>
      <p className="text-sm text-fg-secondary">{t('descripcion')}</p>

      {lectura && (
        <p className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-sm text-fg-secondary">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('soloLectura')}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p id={idModos} className="text-sm font-medium text-fg">{t('modos.etiqueta')}</p>
        <div role="radiogroup" aria-labelledby={idModos} className="flex flex-col gap-2">
          {MODOS_DESINTERES.map((m: ModoDesinteres) => (
            <TarjetaSeleccionable
              key={m}
              orientacion="horizontal"
              titulo={t(`modos.${m}.titulo`)}
              descripcion={t(`modos.${m}.descripcion`)}
              seleccionada={borrador.modo === m}
              onSeleccionar={() => cambiar({ modo: m })}
              deshabilitada={lectura}
              className="p-3"
            />
          ))}
        </div>
      </div>

      <hr className="border-line" />

      <ExcepcionesDesinteres
        borrador={borrador}
        vista={vista}
        lectura={lectura}
        errores={erroresVisibles}
        cambiar={cambiar}
      />

      <p className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-sm text-fg-secondary">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t('precedencia')}
      </p>

      {!lectura && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <p className={cuantosErrores ? 'flex-1 text-sm text-danger' : 'flex-1 text-sm text-fg-muted'} aria-live="polite">
            {cuantosErrores ? t('pie.revisa', { n: cuantosErrores }) : pie}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario', anchoCompleto: true }) + ' md:w-auto'}
              disabled={!sucio || guardando}
              onClick={() => {
                if (original) setBorrador(original);
                setErrores({});
                setIntentado(false);
              }}
            >
              {t('descartar')}
            </button>
            <button
              type="button"
              className={clasesBoton({ anchoCompleto: true }) + ' md:w-auto'}
              disabled={!sucio || guardando || (intentado && cuantosErrores > 0)}
              onClick={() => void guardar()}
            >
              {guardando ? t('guardando') : t('guardar')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

