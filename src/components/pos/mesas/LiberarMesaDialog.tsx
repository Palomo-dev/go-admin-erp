'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { FilaDato, KbdButton, ListaDatos } from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { DialogoMesa } from './cuenta/DialogoMesa';
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
  /** Resumen ya leído (arnés y pruebas): no se consulta el servidor al abrir. */
  estadoPrecargado?: EstadoLiberacion | null;
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
  estadoPrecargado,
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
    if (estadoPrecargado) {
      setEstado(estadoPrecargado);
      const o = estadoPrecargado.decision.opciones;
      setEleccion(!estadoPrecargado.decision.requiereResolucion ? null : o.cobrar.disponible && cajaAbierta ? 'cobrar' : o.cartera.disponible ? 'cartera' : null);
      return;
    }
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
  }, [tableId, cajaAbierta, estadoPrecargado]);

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

  // Primario del pie (Figma D12): responde a la elección.
  let primario: { etiqueta: string; onClick: () => void; destructiva?: boolean; cargando?: boolean; deshabilitada?: boolean; motivo?: string };
  if (!decision) {
    primario = { etiqueta: t('acciones.liberar'), onClick: () => undefined, deshabilitada: true, motivo: t('cargando') };
  } else if (decision.bloqueo) {
    primario = { etiqueta: t('acciones.liberar'), onClick: () => undefined, deshabilitada: true, motivo: textoError(decision.bloqueo) };
  } else if (!requiere) {
    primario = { etiqueta: t('acciones.liberar'), onClick: () => void ejecutar('liberar'), cargando: enviando };
  } else if (eleccion === 'cobrar') {
    primario = {
      etiqueta: resumen?.venta ? t('acciones.cobrarImporte', { importe: formatear(resumen.venta.saldo) }) : t('acciones.cobrar'),
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
  const titulo = resumen?.mesa.zona ? `${nombre} · ${resumen.mesa.zona}` : nombre;
  const venta = resumen?.venta;
  const enPreparacion = resumen?.cocina.filter((c) => c.estado !== 'ready' && c.estado !== 'delivered').length ?? 0;

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
    <DialogoMesa
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { mesa: titulo })}
      textoCerrar={t('cerrar')}
      ocupado={enviando}
      ancho={560}
      pie={
        <>
          <KbdButton variante="fantasma" tamano="md" onClick={() => onAbiertoChange(false)} disabled={enviando}>
            {t('cancelar')}
          </KbdButton>
          <KbdButton
            variante={primario.destructiva ? 'destructivo' : 'primario'}
            tamano="md"
            onClick={primario.onClick}
            cargando={primario.cargando}
            disabled={primario.deshabilitada}
            title={primario.deshabilitada ? primario.motivo : undefined}
          >
            {primario.etiqueta}
          </KbdButton>
        </>
      }
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
          {requiere && venta ? (
            <AvisoTonal
              tono="advertencia"
              rol="alert"
              titulo={t('avisoSaldo', { saldo: formatear(venta.saldo) })}
              descripcion={enPreparacion > 0 ? t('avisoSaldoCocina', { n: enPreparacion }) : t('descripcionConSaldo')}
            />
          ) : (
            !decision?.bloqueo && (
              <AvisoTonal tono="informacion" titulo={t('sinSaldoTitulo')} descripcion={t('sinSaldo')} />
            )
          )}

          <ListaDatos etiqueta={t('resumen')}>
            <FilaDato etiqueta={t('campos.mesero')} valor={resumen.sesion?.mesero ?? t('sinDato')} />
            <FilaDato etiqueta={t('campos.abiertaHace')} valor={resumen.sesion ? duracion(t, resumen.sesion.minutos_abierta) : t('sinDato')} />
            {venta && <FilaDato etiqueta={t('campos.total')} valor={formatear(venta.total)} tono="fuerte" tamano="lg" />}
            {venta && <FilaDato etiqueta={t('campos.pagado')} valor={formatear(venta.pagado)} />}
            {venta && <FilaDato etiqueta={t('campos.saldo')} valor={formatear(venta.saldo)} tono={venta.saldo > 0 ? 'peligro' : 'neutro'} />}
          </ListaDatos>

          {decision?.bloqueo && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              {textoError(decision.bloqueo)}
            </p>
          )}

          {requiere && !decision?.bloqueo && (
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">{t('queHacer')}</legend>
              {opciones.map(({ id, opcion, motivoNo }) => {
                const inputId = `${idMotivo}-${id}`;
                const razon = !opcion.disponible ? motivoNo ?? (opcion.motivo ? t(`motivos.${opcion.motivo}`) : undefined) : undefined;
                const descripcion =
                  id === 'cobrar' && venta
                    ? t('opciones.cobrar.descripcionImporte', { importe: formatear(venta.saldo) })
                    : id === 'cartera' && decision?.opciones.cartera.modo === 'existente'
                      ? t('opciones.cartera.existente')
                      : id === 'cartera' && resumen.cliente?.nombre
                        ? t('opciones.cartera.descripcionCliente', { cliente: resumen.cliente.nombre })
                        : t(`opciones.${id}.descripcion`);
                return (
                  <label
                    key={id}
                    htmlFor={inputId}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3',
                      eleccion === id ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface',
                      !opcion.disponible && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name={`${idMotivo}-eleccion`}
                      className="mt-0.5 size-4 shrink-0 accent-brand-action"
                      checked={eleccion === id}
                      disabled={!opcion.disponible || enviando}
                      onChange={() => setEleccion(id)}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-fg">{t(`opciones.${id}.titulo`)}</span>
                      <span className="text-[13px] text-fg-secondary">{descripcion}</span>
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

          {errorAccion && (
            <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">
              {textoError(errorAccion)}
            </p>
          )}
        </>
      )}
    </DialogoMesa>
  );
}
