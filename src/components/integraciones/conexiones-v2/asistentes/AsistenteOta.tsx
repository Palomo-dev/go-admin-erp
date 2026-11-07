'use client';

/**
 * Booking.com y Expedia (diseño 85-20…27): Modo → Autorizar → Verificar → Habitaciones → Sincronizar.
 *
 * El modo «conexión completa» necesita que GO Admin sea proveedor de conectividad de la OTA
 * (cuenta de socio). Sin ella, el servidor responde 409 `CUENTA_SOCIO` y esta pantalla lo dice
 * (85-24) y ofrece el modo «solo calendario» (iCal), que sí funciona hoy. Nunca se simula éxito.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { AvisoTonal, FormField, Skeleton, StatusBadge, TarjetaSeleccionable } from '@/components/kit';
import type { ItemCatalogo } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { apiAsistentes, type CanalOta, type EspacioPms } from './apiAsistentes';
import { AsistenteIcal } from './AsistenteIcal';
import { ListaNumerada, MarcoAsistente, type BotonMarco } from './MarcoAsistente';
import { pasoAnterior, pasosOta, relacionesParaGuardar, type ModoOta, type PasoOta, type ResultadoVerificacionOta } from './pasosLogica';
import { useNombreServicio } from './useNombreServicio';

export interface AsistenteOtaProps {
  item: ItemCatalogo;
  abierto: boolean;
  onCerrar: () => void;
  onConectado: (conexionId: string | null) => void;
}

export function AsistenteOta({ item, abierto, onCerrar, onConectado }: AsistenteOtaProps) {
  const t = useTranslations('integracionesConexiones');
  const nombre = useNombreServicio(item);
  const canal: CanalOta = item.id === 'expedia' ? 'expedia' : 'booking';

  const [modo, setModo] = useState<ModoOta>('api');
  const [enIcal, setEnIcal] = useState(false);
  const [paso, setPaso] = useState<PasoOta>('modo');
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [cuentaSocio, setCuentaSocio] = useState(false);
  const [espacios, setEspacios] = useState<EspacioPms[]>([]);
  const [propiedadId, setPropiedadId] = useState('');
  const [conexionId, setConexionId] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [verificacion, setVerificacion] = useState<{ resultado: ResultadoVerificacionOta; mensaje: string | null } | null>(null);
  const [relaciones, setRelaciones] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [errorPaso, setErrorPaso] = useState<string | null>(null);
  const [sincronia, setSincronia] = useState<'pendiente' | 'ok' | 'error' | null>(null);

  const pasos = useMemo(() => pasosOta(modo), [modo]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const r = await apiAsistentes.ota(canal);
      setCuentaSocio(r.cuentaSocio);
      setEspacios(r.espacios);
      setRelaciones(Object.fromEntries(r.espacios.map((e) => [e.id, ''])));
      if (r.conexion) {
        setConexionId(r.conexion.id);
        setPropiedadId(r.conexion.propiedadId);
      }
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('comun.errorCarga'));
    } finally {
      setCargando(false);
    }
  }, [canal, t]);

  useEffect(() => {
    if (abierto) void cargar();
    else {
      setPaso('modo');
      setModo('api');
      setEnIcal(false);
      setVerificacion(null);
      setErrorPaso(null);
      setSincronia(null);
    }
  }, [abierto, cargar]);

  if (enIcal) {
    return <AsistenteIcal item={item} abierto={abierto} onCerrar={onCerrar} onConectado={onConectado} onAtras={() => setEnIcal(false)} />;
  }

  const irA = (p: PasoOta | null) => {
    setErrorPaso(null);
    if (p) setPaso(p);
  };

  const verificar = async () => {
    setVerificando(true);
    setErrorPaso(null);
    try {
      const r = await apiAsistentes.verificarOta(canal, propiedadId.trim());
      setVerificacion({ resultado: r.resultado, mensaje: r.mensaje });
      if (r.conexionId) setConexionId(r.conexionId);
    } catch (err) {
      setVerificacion({ resultado: 'error', mensaje: err instanceof Error ? err.message : null });
    } finally {
      setVerificando(false);
    }
  };

  const guardarRelaciones = async () => {
    if (!conexionId) return;
    const { lista } = relacionesParaGuardar(relaciones);
    setGuardando(true);
    setErrorPaso(null);
    try {
      if (lista.length > 0) await apiAsistentes.guardarHabitaciones(conexionId, lista);
      irA('sincronizar');
    } catch (err) {
      setErrorPaso(err instanceof Error ? err.message : t('asistente.ota.errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const sincronizar = async () => {
    if (!conexionId) return;
    setSincronia('pendiente');
    try {
      await apiAsistentes.sincronizarOta(canal, conexionId);
      setSincronia('ok');
    } catch {
      setSincronia('error');
    }
  };

  const numero = pasos.indexOf(paso) + 1;
  const subtitulo = t('asistente.comun.pasoDe', { n: numero, total: pasos.length, texto: t(`asistente.ota.subtitulos.${paso}`) });
  const pasosStepper = pasos.map((p) => ({ valor: p, etiqueta: t(`asistente.ota.pasos.${p}`) }));
  const atras: BotonMarco = { etiqueta: t('comun.atras'), onClick: () => irA(pasoAnterior(pasos, paso)) };

  let contenido: ReactNode;
  let botones: BotonMarco[];

  if (cargando || errorCarga) {
    contenido = errorCarga ? (
      <AvisoTonal tono="peligro" rol="alert" titulo={t('comun.errorCarga')} descripcion={errorCarga} accion={{ etiqueta: t('comun.reintentar'), onClick: () => void cargar() }} />
    ) : (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
    botones = [{ etiqueta: t('comun.cancelar'), onClick: onCerrar }];
  } else if (paso === 'modo') {
    contenido = (
      <div className="flex flex-col gap-3" role="radiogroup" aria-label={t('asistente.ota.pasos.modo')}>
        <TarjetaSeleccionable
          rol="radio"
          orientacion="horizontal"
          titulo={t('asistente.ota.modo.api.titulo')}
          descripcion={t('asistente.ota.modo.api.descripcion')}
          seleccionada={modo === 'api'}
          onSeleccionar={() => setModo('api')}
        />
        <TarjetaSeleccionable
          rol="radio"
          orientacion="horizontal"
          titulo={t('asistente.ota.modo.ical.titulo')}
          descripcion={t('asistente.ota.modo.ical.descripcion')}
          seleccionada={modo === 'ical'}
          onSeleccionar={() => setModo('ical')}
        />
        {modo === 'api' && !cuentaSocio && (
          <AvisoTonal tono="advertencia" titulo={t('asistente.ota.cuentaSocio.titulo', { nombre })} descripcion={t('asistente.ota.cuentaSocio.descripcion', { nombre })} />
        )}
      </div>
    );
    botones = [
      { etiqueta: t('comun.cancelar'), onClick: onCerrar },
      { etiqueta: t('comun.siguiente'), onClick: () => (modo === 'ical' ? setEnIcal(true) : irA('autorizar')) },
    ];
  } else if (paso === 'autorizar') {
    contenido = (
      <div className="flex flex-col gap-4">
        <ListaNumerada items={[1, 2, 3].map((n) => t(`asistente.ota.autorizar.${canal}.p${n}`))} />
        <FormField etiqueta={t(`asistente.ota.autorizar.${canal}.propiedad`)} obligatorio ayuda={t(`asistente.ota.autorizar.${canal}.ayudaPropiedad`)}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={propiedadId}
            onChange={(e) => setPropiedadId(e.target.value.replace(/[^0-9A-Za-z_-]/g, '').slice(0, 40))}
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          />
        </FormField>
      </div>
    );
    botones = [atras, { etiqueta: t('asistente.ota.yaAutorice'), onClick: () => irA('verificar'), deshabilitado: !propiedadId.trim() }];
  } else if (paso === 'verificar') {
    const r = verificacion?.resultado;
    contenido = (
      <div className="flex flex-col gap-3">
        {!verificacion && <p className="text-sm text-fg-secondary">{t('asistente.ota.verificar.explicacion', { nombre, propiedad: propiedadId })}</p>}
        {r === 'verificada' && <AvisoTonal tono="exito" rol="status" titulo={t('asistente.ota.verificar.ok.titulo', { nombre })} descripcion={t('asistente.ota.verificar.ok.descripcion', { propiedad: propiedadId })} />}
        {r === 'sin_autorizar' && <AvisoTonal tono="peligro" rol="alert" titulo={t('asistente.ota.verificar.sinAutorizar.titulo')} descripcion={t('asistente.ota.verificar.sinAutorizar.descripcion', { nombre })} />}
        {r === 'cuenta_socio' && (
          <AvisoTonal
            tono="advertencia"
            rol="alert"
            titulo={t('asistente.ota.cuentaSocio.titulo', { nombre })}
            descripcion={t('asistente.ota.cuentaSocio.descripcion', { nombre })}
            accion={{ etiqueta: t('asistente.ota.usarIcal'), onClick: () => setEnIcal(true) }}
          />
        )}
        {r === 'ya_existe' && <AvisoTonal tono="advertencia" rol="alert" titulo={t('asistente.ota.verificar.yaExiste')} descripcion={verificacion?.mensaje ?? undefined} />}
        {r === 'error' && <AvisoTonal tono="peligro" rol="alert" titulo={t('asistente.ota.verificar.error')} descripcion={verificacion?.mensaje ?? undefined} />}
      </div>
    );
    botones =
      r === 'verificada'
        ? [atras, { etiqueta: t('comun.siguiente'), onClick: () => irA('habitaciones') }]
        : r === 'cuenta_socio'
          ? [atras, { etiqueta: t('asistente.ota.usarIcal'), onClick: () => setEnIcal(true) }]
          : [atras, { etiqueta: r ? t('comun.reintentar') : t('asistente.ota.verificar.boton'), onClick: () => void verificar(), cargando: verificando }];
  } else if (paso === 'habitaciones') {
    const { sinRelacionar } = relacionesParaGuardar(relaciones);
    contenido = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-secondary">{t('asistente.ota.habitaciones.explicacion', { nombre })}</p>
        {espacios.length === 0 && <AvisoTonal tono="advertencia" titulo={t('asistente.ical.sinEspacios.titulo')} descripcion={t('asistente.ical.sinEspacios.descripcion')} />}
        {espacios.map((e) => (
          <div key={e.id} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{e.nombre}</p>
              {e.sucursal && <p className="truncate text-[13px] text-fg-secondary">{e.sucursal}</p>}
            </div>
            <ArrowRight aria-hidden="true" className="hidden size-4 text-fg-tertiary sm:block" />
            <input
              type="text"
              aria-label={t('asistente.ota.habitaciones.idExterno', { nombre, espacio: e.nombre })}
              placeholder={t('asistente.ota.habitaciones.placeholder', { nombre })}
              value={relaciones[e.id] ?? ''}
              onChange={(ev) => setRelaciones((r) => ({ ...r, [e.id]: ev.target.value.slice(0, 60) }))}
              className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            />
          </div>
        ))}
        {sinRelacionar > 0 && espacios.length > 0 && (
          <AvisoTonal tono="advertencia" titulo={t('asistente.ota.habitaciones.sinRelacionar', { n: sinRelacionar })} descripcion={t('asistente.ota.habitaciones.sinRelacionarDescripcion', { nombre })} />
        )}
        {errorPaso && <AvisoTonal tono="peligro" rol="alert" titulo={t('asistente.ota.errorGuardar')} descripcion={errorPaso} />}
      </div>
    );
    botones = [atras, { etiqueta: t('comun.siguiente'), onClick: () => void guardarRelaciones(), cargando: guardando, deshabilitado: !conexionId }];
  } else {
    // sincronizar
    contenido = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-secondary">{t('asistente.ota.sincronizar.explicacion', { nombre })}</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-sm" role="status">
          <span>{t('asistente.ota.sincronizar.reservas')}</span>
          <StatusBadge
            estado={sincronia ?? 'pendiente'}
            tono={sincronia === 'ok' ? 'exito' : sincronia === 'error' ? 'peligro' : 'neutro'}
            etiqueta={t(`asistente.ota.sincronizar.estado.${sincronia ?? 'sinIniciar'}`)}
          />
        </div>
        {sincronia === 'error' && <AvisoTonal tono="advertencia" titulo={t('asistente.ota.sincronizar.fallo')} descripcion={t('asistente.ota.sincronizar.falloDescripcion')} />}
      </div>
    );
    botones =
      sincronia === 'ok'
        ? [{ etiqueta: t('asistente.ota.verConexion'), onClick: () => onConectado(conexionId) }]
        : [atras, { etiqueta: sincronia === 'error' ? t('comun.reintentar') : t('asistente.ota.sincronizar.boton'), onClick: () => void sincronizar(), cargando: sincronia === 'pendiente' }];
  }

  return (
    <MarcoAsistente
      abierto={abierto}
      onCerrar={onCerrar}
      servicioId={item.id}
      titulo={t('asistente.comun.titulo', { nombre })}
      subtitulo={subtitulo}
      pasos={pasosStepper}
      actual={paso}
      botones={botones}
      ocupado={verificando || guardando || sincronia === 'pendiente'}
    >
      {contenido}
    </MarcoAsistente>
  );
}
