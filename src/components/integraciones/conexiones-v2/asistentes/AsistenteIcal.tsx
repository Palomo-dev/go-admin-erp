'use client';

/**
 * Calendario iCal por alojamiento (diseño 85-28): Airbnb, Tripadvisor, Google Vacation Rentals y
 * el modo «solo calendario» de Booking.com y Expedia. Por cada espacio del PMS se pega el enlace
 * de importación del canal y se copia el de exportación de GO Admin (`/api/pms/ical/<token>`).
 * Guarda por `POST /api/integrations/conexiones/ical` y sincroniza con la ruta existente del PMS.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, FormField, StatusBadge, Skeleton } from '@/components/kit';
import type { ItemCatalogo } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { apiAsistentes, type CanalIcal, type EnlaceIcal, type EspacioPms } from './apiAsistentes';
import { CampoCopiar, MarcoAsistente, type BotonMarco } from './MarcoAsistente';
import { enlacesIcalParaGuardar, urlIcalValida } from './pasosLogica';
import { useNombreServicio } from './useNombreServicio';

export interface AsistenteIcalProps {
  item: ItemCatalogo;
  abierto: boolean;
  onCerrar: () => void;
  onConectado: (conexionId: string | null) => void;
  /** Botón «Atrás» cuando viene del paso «Modo» del asistente OTA. */
  onAtras?: () => void;
}

const CANALES: readonly CanalIcal[] = ['airbnb', 'booking', 'expedia', 'tripadvisor', 'google_vacation_rentals'];

export function canalIcalDe(id: string): CanalIcal | null {
  return (CANALES as readonly string[]).includes(id) ? (id as CanalIcal) : null;
}

export function AsistenteIcal({ item, abierto, onCerrar, onConectado, onAtras }: AsistenteIcalProps) {
  const t = useTranslations('integracionesConexiones');
  const nombre = useNombreServicio(item);
  const canal = canalIcalDe(item.id);

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [espacios, setEspacios] = useState<EspacioPms[]>([]);
  const [enlaces, setEnlaces] = useState<Record<string, EnlaceIcal>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [invalidos, setInvalidos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<{ conexionId: string } | null>(null);
  const [sincronia, setSincronia] = useState<'pendiente' | 'ok' | 'error' | null>(null);

  const cargar = useCallback(async () => {
    if (!canal) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      const r = await apiAsistentes.ical(canal);
      setEspacios(r.espacios);
      setEnlaces(Object.fromEntries(r.enlaces.map((e) => [e.espacioId, e])));
      setUrls(Object.fromEntries(r.enlaces.map((e) => [e.espacioId, e.urlImportacion ?? ''])));
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('comun.errorCarga'));
    } finally {
      setCargando(false);
    }
  }, [canal, t]);

  useEffect(() => {
    if (abierto) void cargar();
    else {
      setGuardado(null);
      setSincronia(null);
      setErrorGuardar(null);
      setInvalidos([]);
    }
  }, [abierto, cargar]);

  const guardar = async () => {
    if (!canal) return;
    const { lista, invalidos: malos } = enlacesIcalParaGuardar(urls);
    setInvalidos(malos);
    setErrorGuardar(null);
    if (malos.length > 0 || lista.length === 0) return;
    setGuardando(true);
    try {
      const r = await apiAsistentes.guardarIcal(canal, lista);
      setEnlaces((prev) => {
        const sig = { ...prev };
        for (const e of r.enlaces) {
          sig[e.espacioId] = { ...(sig[e.espacioId] ?? { espacioId: e.espacioId, urlImportacion: null, ultimaSync: null, estadoSync: null, error: null }), urlExportacion: e.urlExportacion };
        }
        return sig;
      });
      setGuardado({ conexionId: r.conexionId });
      setSincronia('pendiente');
      try {
        await apiAsistentes.sincronizarIcal();
        setSincronia('ok');
      } catch {
        setSincronia('error');
      }
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : t('asistente.ical.errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const conEnlace = Object.values(urls).filter((u) => u.trim()).length;
  const botones: BotonMarco[] = guardado
    ? [{ etiqueta: t('asistente.ical.listo'), onClick: () => onConectado(guardado.conexionId) }]
    : [
        onAtras ? { etiqueta: t('comun.atras'), onClick: onAtras, deshabilitado: guardando } : { etiqueta: t('comun.cancelar'), onClick: onCerrar, deshabilitado: guardando },
        { etiqueta: t('asistente.ical.guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitado: cargando || conEnlace === 0 || !canal },
      ];

  return (
    <MarcoAsistente
      abierto={abierto}
      onCerrar={onCerrar}
      servicioId={item.id}
      titulo={t('asistente.comun.titulo', { nombre })}
      subtitulo={t('asistente.ical.subtitulo')}
      botones={botones}
      ocupado={guardando}
    >
      <p className="text-sm leading-5 text-fg-secondary">{t('asistente.ical.explicacion', { nombre })}</p>
      {!canal && <AvisoTonal tono="peligro" titulo={t('asistente.ical.canalNoSoportado')} />}
      {errorCarga && <AvisoTonal tono="peligro" rol="alert" titulo={t('comun.errorCarga')} descripcion={errorCarga} accion={{ etiqueta: t('comun.reintentar'), onClick: () => void cargar() }} />}
      {cargando && !errorCarga && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {!cargando && !errorCarga && espacios.length === 0 && (
        <AvisoTonal tono="advertencia" titulo={t('asistente.ical.sinEspacios.titulo')} descripcion={t('asistente.ical.sinEspacios.descripcion')} accion={{ etiqueta: t('asistente.ical.sinEspacios.accion'), href: '/app/pms/espacios' }} />
      )}
      {!cargando &&
        espacios.map((e) => {
          const enlace = enlaces[e.id];
          const url = urls[e.id] ?? '';
          const invalido = invalidos.includes(e.id) || (url.trim() !== '' && !urlIcalValida(url));
          return (
            <section key={e.id} className="flex flex-col gap-3 rounded-lg border border-line p-4" aria-label={e.nombre}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{e.nombre}</p>
                  {e.sucursal && <p className="truncate text-[13px] text-fg-secondary">{e.sucursal}</p>}
                </div>
                {!url.trim() && <StatusBadge estado="sin_enlace" tono="advertencia" etiqueta={t('asistente.ical.sinEnlace')} />}
                {enlace?.error && <StatusBadge estado="error" tono="peligro" etiqueta={t('asistente.ical.conError')} />}
              </div>
              <FormField
                etiqueta={t('asistente.ical.enlaceDe', { nombre })}
                ayuda={t.has(`asistente.ical.dondeImportar.${item.id}`) ? t(`asistente.ical.dondeImportar.${item.id}`) : t('asistente.ical.dondeImportar.generico', { nombre })}
                error={invalido ? t('asistente.ical.urlInvalida') : null}
              >
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://"
                  disabled={!!guardado}
                  value={url}
                  onChange={(ev) => setUrls((u) => ({ ...u, [e.id]: ev.target.value }))}
                  className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 aria-[invalid=true]:border-danger"
                />
              </FormField>
              {enlace?.urlExportacion && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[13px] text-fg-secondary">{t('asistente.ical.enlaceGoAdmin', { nombre })}</p>
                  <CampoCopiar valor={enlace.urlExportacion} etiquetaCopiar={t('comun.copiar')} etiquetaCopiado={t('comun.copiado')} />
                </div>
              )}
              {enlace?.error && <p className="text-[13px] text-danger-text">{enlace.error}</p>}
            </section>
          );
        })}
      {errorGuardar && <AvisoTonal tono="peligro" rol="alert" titulo={t('asistente.ical.errorGuardar')} descripcion={errorGuardar} />}
      {guardado && (
        <AvisoTonal
          tono={sincronia === 'error' ? 'advertencia' : 'exito'}
          rol="status"
          titulo={t('asistente.ical.guardados')}
          descripcion={
            sincronia === 'pendiente' ? t('asistente.ical.sincronizando') : sincronia === 'ok' ? t('asistente.ical.sincronizado') : t('asistente.ical.sincronizacionFallo')
          }
        />
      )}
      {!guardado && <AvisoTonal tono="informacion" titulo={t('asistente.ical.limite.titulo')} descripcion={t('asistente.ical.limite.descripcion', { nombre })} />}
    </MarcoAsistente>
  );
}
