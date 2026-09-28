'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ChefHat, Info, Loader2, LogOut } from 'lucide-react';
import { Dialogo, StatusBadge } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { cn } from '@/utils/Utils';
import { MOTIVO_MAX, MOTIVO_MIN, type AccionLiberacion, type OpcionLiberacion } from '@/lib/pos/mesas/liberacionMesa';
import {
  ejecutarLiberacion,
  LiberacionMesaError,
  obtenerEstadoLiberacion,
  type EstadoLiberacion,
  type ResultadoLiberacion,
} from './liberacionMesaCliente';

/**
 * «Liberar mesa» (decisión del dueño 2026-09-23): si la venta de la mesa tiene
 * saldo, se muestra la información (mesa, mesero, tiempo, cocina pendiente,
 * total, pagado, saldo) y se pide resolverlo antes de soltar la mesa:
 * cobrar ahora, dejarlo en la cartera del cliente o anular la venta con motivo.
 * Sin saldo, es una confirmación simple. Qué opción está disponible y por qué
 * no lo está otra lo decide el servidor (`GET /api/pos/mesas/[id]/liberar`).
 */
export interface LiberarMesaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  tableId: string | null;
  /** Nombre para el título mientras carga el resumen. */
  mesaNombre?: string;
  /** Hay caja abierta: sin ella «Cobrar ahora» no está disponible. */
  cajaAbierta: boolean;
  /** Abre el cobro del POS para esta mesa (el diálogo ya se cerró). */
  onCobrar: () => void;
  /** La mesa quedó libre. */
  onLiberada: (resultado: ResultadoLiberacion) => void;
}

type Eleccion = 'cobrar' | Exclude<AccionLiberacion, 'liberar'>;

/** Aviso (toast) tras liberar: una sola redacción para el plano y el detalle. */
export function useAvisoLiberacion() {
  const t = useTranslations('posMesaLiberar');
  const { formatear } = useMonedaOrganizacion();
  return useCallback(
    (resultado: ResultadoLiberacion, mesa: string): { title: string; description?: string } => {
      const detalle: string[] = [];
      if (resultado.resolucion === 'cartera_creada') {
        detalle.push(t('toast.cartera', { saldo: formatear(resultado.saldo), factura: resultado.invoice_number ?? '' }));
      } else if (resultado.resolucion === 'cartera_existente') {
        detalle.push(t('toast.carteraExistente'));
      } else if (resultado.resolucion === 'anulada') {
        detalle.push(t('toast.anulada', { n: resultado.items_cocina_cancelados }));
      }
      if (resultado.items_cocina_sin_cocinar > 0) {
        detalle.push(t('toast.sinCocinar', { n: resultado.items_cocina_sin_cocinar }));
      }
      return { title: t('toast.liberada', { mesa }), description: detalle.join(' ') || undefined };
    },
    [t, formatear],
  );
}

function duracion(t: ReturnType<typeof useTranslations>, minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? t('tiempo.horasMinutos', { h, m }) : t('tiempo.minutos', { m });
}

export function LiberarMesaDialog({
  abierto,
  onAbiertoChange,
  tableId,
  mesaNombre,
  cajaAbierta,
  onCobrar,
  onLiberada,
}: LiberarMesaDialogProps) {
  const t = useTranslations('posMesaLiberar');
  const { formatear } = useMonedaOrganizacion();
  const idMotivo = useId();
  const [estado, setEstado] = useState<EstadoLiberacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [eleccion, setEleccion] = useState<Eleccion | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!tableId) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      const e = await obtenerEstadoLiberacion(tableId);
      setEstado(e);
      const o = e.decision.opciones;
      setEleccion(
        !e.decision.requiereResolucion ? null
          : o.cobrar.disponible && cajaAbierta ? 'cobrar'
            : o.cartera.disponible ? 'cartera'
              : o.anular.disponible ? 'anular'
                : null,
      );
    } catch (err) {
      setErrorCarga(err instanceof LiberacionMesaError ? err.codigo : 'error_interno');
    } finally {
      setCargando(false);
    }
  }, [tableId, cajaAbierta]);

  useEffect(() => {
    if (!abierto) {
      setEstado(null);
      setEleccion(null);
      setMotivo('');
      setErrorAccion(null);
      setErrorCarga(null);
      return;
    }
    void cargar();
  }, [abierto, cargar]);

  const textoError = (codigo: string) => (t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.error_interno'));

  const resumen = estado?.resumen;
  const decision = estado?.decision;
  const requiere = !!decision?.requiereResolucion;
  const motivoLimpio = motivo.trim();

  const opcionCobrar: OpcionLiberacion =
    decision && decision.opciones.cobrar.disponible && !cajaAbierta
      ? { disponible: false }
      : decision?.opciones.cobrar ?? { disponible: false };

  const ejecutar = async (accion: AccionLiberacion) => {
    if (!tableId) return;
    setEnviando(true);
    setErrorAccion(null);
    try {
      const resultado = await ejecutarLiberacion(tableId, accion, motivoLimpio || null);
      onLiberada(resultado);
      onAbiertoChange(false);
    } catch (err) {
      const codigo = err instanceof LiberacionMesaError ? err.codigo : 'error_interno';
      setErrorAccion(codigo);
      // El saldo cambió mientras el diálogo estaba abierto: se recarga.
      if (['saldo_pendiente', 'sin_saldo', 'venta_con_pagos', 'venta_con_factura'].includes(codigo)) void cargar();
    } finally {
      setEnviando(false);
    }
  };

  let primario: Parameters<typeof Dialogo>[0]['primario'];
  if (!decision) {
    primario = { etiqueta: t('acciones.liberar'), onClick: () => undefined, deshabilitada: true, motivo: t('cargando') };
  } else if (decision.bloqueo) {
    primario = { etiqueta: t('acciones.liberar'), onClick: () => undefined, deshabilitada: true, motivo: textoError(decision.bloqueo) };
  } else if (!requiere) {
    primario = { etiqueta: t('acciones.liberar'), onClick: () => void ejecutar('liberar'), cargando: enviando };
  } else if (eleccion === 'cobrar') {
    primario = {
      etiqueta: t('acciones.cobrar'),
      onClick: () => {
        onAbiertoChange(false);
        onCobrar();
      },
      deshabilitada: !opcionCobrar.disponible,
      motivo: t('motivos.sin_caja'),
    };
  } else if (eleccion === 'cartera') {
    primario = { etiqueta: t('acciones.cartera'), onClick: () => void ejecutar('cartera'), cargando: enviando };
  } else if (eleccion === 'anular') {
    const faltaMotivo = motivoLimpio.length < MOTIVO_MIN;
    primario = {
      etiqueta: t('acciones.anular'),
      onClick: () => void ejecutar('anular'),
      destructiva: true,
      cargando: enviando,
      deshabilitada: faltaMotivo,
      motivo: t('motivoRequerido', { min: MOTIVO_MIN }),
    };
  } else {
    primario = { etiqueta: t('acciones.elegir'), onClick: () => undefined, deshabilitada: true, motivo: t('acciones.elegir') };
  }

  const nombre = resumen?.mesa.nombre ?? mesaNombre ?? '';
  const venta = resumen?.venta;

  const opciones: { id: Eleccion; opcion: OpcionLiberacion; motivoNo?: string }[] = decision
    ? [
        {
          id: 'cobrar',
          opcion: opcionCobrar,
          motivoNo: !cajaAbierta && decision.opciones.cobrar.disponible ? t('motivos.sin_caja') : undefined,
        },
        { id: 'cartera', opcion: decision.opciones.cartera },
        { id: 'anular', opcion: decision.opciones.anular },
      ]
    : [];

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={requiere ? t('tituloConSaldo', { mesa: nombre }) : t('titulo', { mesa: nombre })}
      descripcion={requiere ? t('descripcionConSaldo') : t('descripcion')}
      icono={requiere ? AlertTriangle : LogOut}
      ancho={560}
      primario={primario}
    >
      {cargando && !estado && (
        <p className="flex items-center gap-2 text-sm text-fg-secondary" role="status">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {t('cargando')}
        </p>
      )}

      {errorCarga && (
        <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">
          {textoError(errorCarga)}
        </p>
      )}

      {resumen && (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-fg-secondary">{t('campos.mesa')}</dt>
            <dd className="text-right font-medium text-fg">
              {resumen.mesa.nombre}
              {resumen.mesa.zona ? ` · ${resumen.mesa.zona}` : ''}
            </dd>
            <dt className="text-fg-secondary">{t('campos.mesero')}</dt>
            <dd className="text-right text-fg">{resumen.sesion?.mesero ?? t('sinDato')}</dd>
            <dt className="text-fg-secondary">{t('campos.tiempo')}</dt>
            <dd className="text-right text-fg">
              {resumen.sesion ? duracion(t, resumen.sesion.minutos_abierta) : t('sinDato')}
            </dd>
            <dt className="text-fg-secondary">{t('campos.cliente')}</dt>
            <dd className="text-right text-fg">{resumen.cliente?.nombre ?? t('sinCliente')}</dd>
          </dl>

          {venta && (
            <dl className="grid grid-cols-3 gap-2 rounded-lg border border-line p-3 text-sm">
              <div>
                <dt className="text-fg-secondary">{t('campos.total')}</dt>
                <dd className="font-medium tabular-nums text-fg">{formatear(venta.total)}</dd>
              </div>
              <div>
                <dt className="text-fg-secondary">{t('campos.pagado')}</dt>
                <dd className="font-medium tabular-nums text-fg">{formatear(venta.pagado)}</dd>
              </div>
              <div>
                <dt className="text-fg-secondary">{t('campos.saldo')}</dt>
                <dd className={cn('font-semibold tabular-nums', venta.saldo > 0 ? 'text-danger-text' : 'text-fg')}>
                  {formatear(venta.saldo)}
                </dd>
              </div>
            </dl>
          )}

          {resumen.cocina.length > 0 && (
            <section aria-labelledby={`${idMotivo}-cocina`} className="flex flex-col gap-2">
              <h3 id={`${idMotivo}-cocina`} className="flex items-center gap-2 text-sm font-medium text-fg">
                <ChefHat aria-hidden className="size-4" strokeWidth={1.5} />
                {t('cocina.titulo', { n: resumen.cocina.length })}
              </h3>
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {resumen.cocina.map((item, i) => (
                  <li key={`${item.ticket_id}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-fg">
                      {Number(item.cantidad)} × {item.producto}
                    </span>
                    <StatusBadge
                      estado={item.estado}
                      etiqueta={t.has(`cocina.estados.${item.estado}`) ? t(`cocina.estados.${item.estado}`) : item.estado}
                    />
                  </li>
                ))}
              </ul>
              <p className="text-xs text-fg-secondary">
                {eleccion === 'anular' ? t('cocina.alAnular') : t('cocina.alLiberar')}
              </p>
            </section>
          )}

          {decision?.bloqueo && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              {textoError(decision.bloqueo)}
            </p>
          )}

          {requiere && !decision?.bloqueo && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-fg">{t('queHacer')}</legend>
              {opciones.map(({ id, opcion, motivoNo }) => {
                const inputId = `${idMotivo}-${id}`;
                const razon = !opcion.disponible ? motivoNo ?? (opcion.motivo ? t(`motivos.${opcion.motivo}`) : undefined) : undefined;
                return (
                  <label
                    key={id}
                    htmlFor={inputId}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
                      eleccion === id ? 'border-brand bg-brand-tint' : 'border-line',
                      !opcion.disponible && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name={`${idMotivo}-eleccion`}
                      className="mt-1 size-4 shrink-0 accent-brand"
                      checked={eleccion === id}
                      disabled={!opcion.disponible || enviando}
                      onChange={() => setEleccion(id)}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cn('text-sm font-medium', id === 'anular' ? 'text-danger-text' : 'text-fg')}>
                        {t(`opciones.${id}.titulo`)}
                      </span>
                      <span className="text-xs text-fg-secondary">
                        {id === 'cartera' && decision?.opciones.cartera.modo === 'existente'
                          ? t('opciones.cartera.existente')
                          : t(`opciones.${id}.descripcion`)}
                      </span>
                      {razon && <span className="text-xs text-warning-text">{razon}</span>}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}

          {requiere && (eleccion === 'anular' || eleccion === 'cartera') && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idMotivo}-motivo`} className="text-sm font-medium text-fg">
                {eleccion === 'anular' ? t('motivo.anular') : t('motivo.cartera')}
                {eleccion === 'anular' && <span aria-hidden="true" className="ml-0.5 text-danger-text">*</span>}
              </label>
              <textarea
                id={`${idMotivo}-motivo`}
                value={motivo}
                maxLength={MOTIVO_MAX}
                rows={2}
                required={eleccion === 'anular'}
                disabled={enviando}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={eleccion === 'anular' ? t('motivo.placeholderAnular') : t('motivo.placeholderCartera')}
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </div>
          )}

          {!requiere && !decision?.bloqueo && (
            <p className="flex items-start gap-2 rounded-lg bg-info-subtle p-3 text-sm text-info-text">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              {t('sinSaldo')}
            </p>
          )}

          {errorAccion && (
            <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">
              {textoError(errorAccion)}
            </p>
          )}
        </>
      )}
    </Dialogo>
  );
}
