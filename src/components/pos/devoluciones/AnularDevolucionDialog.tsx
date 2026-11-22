'use client';

/**
 * «Anular devolución» (Figma 05 POS y ventas, sección 873:573997). Al abrir
 * pide el diagnóstico (`GET /api/pos/devoluciones/[id]/anular`) y muestra el
 * diálogo que corresponde:
 *
 * - Nota crédito sin transmitir o rechazada (2719:190434 / 2719:190511):
 *   `DialogoMotivo` con el aviso, «Qué se revierte», la fecha del asiento
 *   espejo (Hoy · Fecha original, deshabilitada si su periodo está cerrado),
 *   motivos rápidos y motivo obligatorio.
 * - Nota crédito aceptada por la DIAN (2719:190584): no se anula; ofrece
 *   «Registrar venta nueva» con los productos de la devolución.
 * - Otro impedimento (sin caja abierta, saldo a favor anulado, sin permiso…):
 *   el mismo diálogo con el primario deshabilitado y la razón.
 * - Contador 2026-11-22 (Figma 2729:192869 / 2729:192931): casilla «El
 *   cliente se lleva otra vez la mercancía» (si se queda en la bodega, venta
 *   nueva) y, si ya usó parte del saldo a favor, el aviso y la casilla de que
 *   ese valor queda como cuenta por cobrar en su cartera.
 *
 * La anulación la hace la RPC (`fn_devolucion_anular`) en una transacción.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, TriangleAlert } from 'lucide-react';
import { AvisoTonal, Dialogo, DialogoMotivo, SegmentedControl } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { cn } from '@/utils/Utils';
import { ErrorPeticionDevoluciones, enviarAnulacionDevolucion, pedirDiagnosticoAnulacion } from '@/lib/pos/devoluciones/clienteDevoluciones';
import {
  bloqueoAnulacion,
  claveErrorAnulacion,
  codigoErrorAnulacion,
  comprasDelSaldo,
  consecuenciasAnulacion,
  diaDeFecha,
  dialogoAnulacion,
  mesDeFecha,
  MOTIVO_MINIMO_ANULACION,
  opcionesFechaEspejo,
  saldoUsado,
  type Consecuencia,
  type DiagnosticoAnulacion,
  type FechaEspejo,
} from '@/lib/pos/devoluciones/anularDevolucionLogica';
import type { DetalleDevolucion } from '@/lib/pos/devoluciones/detalleServidor';

export interface AnularDevolucionDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  devolucion: DetalleDevolucion;
  /** La devolución quedó anulada: la pantalla recarga el detalle. */
  onAnulada: () => void;
}

export function AnularDevolucionDialog({ abierto, onAbiertoChange, devolucion, onAnulada }: AnularDevolucionDialogProps) {
  const t = useTranslations('posDevolucionesAnular');
  const router = useRouter();
  const locale = useLocaleIntl();
  const { formatear } = useMonedaOrganizacion();
  const { timezone } = useFormatDate();

  const [diag, setDiag] = useState<DiagnosticoAnulacion | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [fecha, setFecha] = useState<FechaEspejo>('hoy');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mercanciaVuelve, setMercanciaVuelve] = useState(false);
  const [entiendeSaldo, setEntiendeSaldo] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setDiag(null);
    setErrorCarga(false);
    setError(null);
    setMercanciaVuelve(false);
    setEntiendeSaldo(false);
    pedirDiagnosticoAnulacion(devolucion.id)
      .then((d) => {
        if (!vigente) return;
        setDiag(d);
        setFecha(opcionesFechaEspejo(d).inicial ?? 'hoy');
      })
      .catch(() => vigente && setErrorCarga(true));
    return () => {
      vigente = false;
    };
  }, [abierto, devolucion.id]);

  const opciones = useMemo(() => (diag ? opcionesFechaEspejo(diag) : null), [diag]);
  const consecuencias = useMemo(
    () =>
      diag
        ? consecuenciasAnulacion(
            diag,
            devolucion.lineas.map((l) => ({ nombre: l.producto.nombre, cantidad: l.cantidad, repuesta: l.repuesta })),
          )
        : [],
    [diag, devolucion.lineas],
  );

  const monto = formatear(devolucion.total);
  const fechaDevolucion = devolucion.fecha ? formatDateTimeInTz(devolucion.fecha, timezone, { locale, day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const nota = diag?.nota ?? devolucion.nota_credito;
  const numeroNota = diag?.nota?.numero ?? devolucion.nota_credito?.numero ?? '—';
  const descripcion = [
    devolucion.metodo === 'store_credit' ? t('dialogo.descSaldo', { monto }) : t('dialogo.descEfectivo', { monto }),
    fechaDevolucion,
    diag?.nota ? t('dialogo.descNota', { numero: numeroNota, estado: t(`estadosNota.${diag.nota.estado_dian}`) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const textoConsecuencia = (c: Consecuencia): string => {
    switch (c.clave) {
      case 'asientos':
        return t('consecuencias.asientos', { numeros: c.numeros });
      case 'sinAsientos':
        return t('consecuencias.sinAsientos');
      case 'inventario':
        return t('consecuencias.inventario', { unidades: c.unidades, productos: c.productos || '—', sucursal: devolucion.sucursal.nombre ?? '—' });
      case 'notaRechazada':
      case 'notaSinTransmitir':
        return t(`consecuencias.${c.clave}`, { numero: c.numero });
      case 'caja':
        return t('consecuencias.caja', { monto, sesion: c.sesion });
      case 'cajaSinSesion':
        return t('consecuencias.cajaSinSesion', { monto });
      case 'saldo':
        return t('consecuencias.saldo', { monto });
      case 'saldoUsado':
        return t('consecuencias.saldoUsado', { disponible: formatear(c.disponible), usado: formatear(c.usado) });
      case 'venta':
        return t('consecuencias.venta', { venta: devolucion.venta.factura?.numero ?? t('consecuencias.laVenta') });
    }
  };

  const usado = diag ? saldoUsado(diag) : 0;
  const venderDeNuevo = () => {
    onAbiertoChange(false);
    router.push(`/app/pos/ventas/nuevo?devolucion=${devolucion.id}`);
  };

  const confirmar = async (motivo: string) => {
    if (!diag) return;
    if (!mercanciaVuelve) {
      setError(t('confirmaciones.faltaMercancia'));
      return;
    }
    if (usado > 0 && !entiendeSaldo) {
      setError(t('confirmaciones.faltaSaldo', { usado: formatear(usado) }));
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await enviarAnulacionDevolucion(devolucion.id, motivo, fecha, { saldoUsado: usado > 0 && entiendeSaldo, mercanciaVuelve });
      if (r.asientos_pendientes) toastSuccess(t('hechoPendiente', { numero: devolucion.numero, n: r.asientos_pendientes }));
      else toastSuccess(t('hecho', { numero: devolucion.numero }));
      onAbiertoChange(false);
      onAnulada();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionDevoluciones ? codigoErrorAnulacion({ message: e.codigo }) : 'generico';
      setError(t(`errores.${claveErrorAnulacion(codigo)}`));
    } finally {
      setEnviando(false);
    }
  };

  const titulo = t('dialogo.titulo', { numero: devolucion.numero });
  const tipo = diag ? dialogoAnulacion(diag) : null;

  // ── Nota crédito aceptada por la DIAN (2719:190584) ──────────────────────
  if (tipo === 'no_se_puede') {
    const aceptada = diag?.nota?.fecha_aceptacion
      ? formatDateTimeInTz(diag.nota.fecha_aceptacion, timezone, { locale, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;
    return (
      <Dialogo
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo={t('noSePuede.titulo', { numero: devolucion.numero })}
        descripcion={aceptada ? t('noSePuede.descripcion', { numero: numeroNota, fecha: aceptada }) : t('noSePuede.descripcionSinFecha', { numero: numeroNota })}
        icono={TriangleAlert}
        textoCancelar={t('noSePuede.cerrar')}
        primario={{
          etiqueta: t('noSePuede.registrarVenta'),
          onClick: venderDeNuevo,
        }}
      >
        <AvisoTonal tono="advertencia" titulo={t('noSePuede.avisoTitulo', { numero: numeroNota })} descripcion={t('noSePuede.avisoTexto')} />
        <div>
          <p className="text-sm font-medium text-fg">{t('noSePuede.queHacer')}</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-5 text-fg-secondary">
            <li>{t('noSePuede.pasos.venta')}</li>
            <li>{t('noSePuede.pasos.enlace')}</li>
            <li>{t('noSePuede.pasos.sinCambios')}</li>
          </ul>
        </div>
      </Dialogo>
    );
  }

  // ── Anulable o bloqueada (2719:190434 / 2719:190511) ─────────────────────
  const codigoBloqueo = diag ? bloqueoAnulacion(diag) : null;
  const bloqueo = errorCarga ? t('errorCarga') : codigoBloqueo ? t(`errores.${claveErrorAnulacion(codigoBloqueo)}`) : null;
  const mesOriginal = diag ? mesDeFecha(diag.fecha_original, locale) : '';
  const mesHoy = diag ? mesDeFecha(diag.hoy, locale) : '';
  const ayudaCerrada = opciones?.ayuda === 'original_cerrado' || opciones?.ayuda === 'hoy_cerrado' || opciones?.ayuda === 'ambos_cerrados';
  const aviso =
    nota && diag?.nota?.estado_dian === 'rechazada'
      ? { titulo: t('dialogo.avisoRechazada.titulo', { numero: numeroNota }), texto: t('dialogo.avisoRechazada.texto') }
      : diag?.nota
        ? { titulo: t('dialogo.avisoSinTransmitir.titulo', { numero: numeroNota }), texto: t('dialogo.avisoSinTransmitir.texto') }
        : { titulo: t('dialogo.avisoSinNota.titulo'), texto: t('dialogo.avisoSinNota.texto') };
  const textoAviso = opciones?.ayuda === 'original_cerrado' ? `${aviso.texto} ${t('dialogo.periodoCerradoHoy')}` : aviso.texto;

  return (
    <DialogoMotivo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={descripcion}
      icono={Ban}
      textoConfirmar={t('confirmar')}
      onConfirmar={confirmar}
      motivosRapidos={[t('motivosRapidos.error'), t('motivosRapidos.producto'), t('motivosRapidos.noDevolvio')]}
      etiquetaMotivo={t('etiquetaMotivo')}
      placeholder={t('placeholder')}
      minimo={MOTIVO_MINIMO_ANULACION}
      cargando={enviando}
      bloqueo={diag || errorCarga ? bloqueo : t('cargando')}
      error={error}
    >
      {diag && !bloqueo && opciones && (
        <>
          <AvisoTonal tono="informacion" titulo={aviso.titulo} descripcion={textoAviso} />
          {usado > 0 && (
            <AvisoTonal
              tono="advertencia"
              titulo={t('saldoUsado.titulo', { usado: formatear(usado) })}
              descripcion={
                comprasDelSaldo(diag)
                  ? t('saldoUsado.texto', { cliente: diag.saldo_a_favor?.cliente?.nombre ?? t('saldoUsado.elCliente'), compras: comprasDelSaldo(diag) ?? '' })
                  : t('saldoUsado.textoSinCompra', { cliente: diag.saldo_a_favor?.cliente?.nombre ?? t('saldoUsado.elCliente') })
              }
            />
          )}
          <div>
            <p className="text-sm font-medium text-fg">{t('queSeRevierte')}</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-5 text-fg-secondary">
              {consecuencias.map((c) => (
                <li key={c.clave}>{textoConsecuencia(c)}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <p id="anular-devolucion-fecha" className="text-sm font-medium text-fg">
              {t('fecha.etiqueta')}
            </p>
            <SegmentedControl<FechaEspejo>
              aria-labelledby="anular-devolucion-fecha"
              aria-describedby="anular-devolucion-fecha-ayuda"
              anchoCompleto
              valor={fecha}
              onValorChange={setFecha}
              opciones={[
                {
                  valor: 'hoy',
                  etiqueta: opciones.hoy ? t('fecha.hoy', { dia: diaDeFecha(diag.hoy, locale) }) : t('fecha.hoyCerrado'),
                  deshabilitada: !opciones.hoy,
                },
                {
                  valor: 'original',
                  etiqueta: opciones.original ? t('fecha.original', { dia: diaDeFecha(diag.fecha_original, locale) }) : t('fecha.originalCerrado'),
                  deshabilitada: !opciones.original,
                },
              ]}
            />
            <p id="anular-devolucion-fecha-ayuda" className={cn('text-xs leading-4', ayudaCerrada ? 'text-warning-text' : 'text-fg-secondary')}>
              {opciones.ayuda === 'original_abierto'
                ? t('fecha.ayudaAbierto', { mes: mesOriginal, mesHoy })
                : opciones.ayuda === 'mismo_mes'
                  ? t('fecha.ayudaMismoMes', { mes: mesOriginal })
                  : opciones.ayuda === 'original_cerrado'
                    ? t('fecha.ayudaCerrado', { mes: mesOriginal })
                    : t('fecha.ayudaHoyCerrado', { mesHoy })}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="anular-devolucion-mercancia"
                className="mt-0.5"
                checked={mercanciaVuelve}
                aria-describedby="anular-devolucion-mercancia-ayuda"
                onCheckedChange={(v) => {
                  setMercanciaVuelve(v === true);
                  setError(null);
                }}
              />
              <div className="flex flex-col gap-0.5">
                <label htmlFor="anular-devolucion-mercancia" className="cursor-pointer text-sm text-fg">
                  {t('confirmaciones.mercancia')}
                </label>
                <p id="anular-devolucion-mercancia-ayuda" className="text-xs leading-4 text-fg-secondary">
                  {t('confirmaciones.mercanciaAyudaAntes')}{' '}
                  <button type="button" onClick={venderDeNuevo} className="font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    {t('confirmaciones.mercanciaAyudaEnlace')}
                  </button>
                  {t('confirmaciones.mercanciaAyudaDespues')}
                </p>
              </div>
            </div>
            {usado > 0 && (
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="anular-devolucion-saldo"
                  className="mt-0.5"
                  checked={entiendeSaldo}
                  onCheckedChange={(v) => {
                    setEntiendeSaldo(v === true);
                    setError(null);
                  }}
                />
                <label htmlFor="anular-devolucion-saldo" className="cursor-pointer text-sm text-fg">
                  {t('confirmaciones.saldo', { usado: formatear(usado) })}
                </label>
              </div>
            )}
          </div>
        </>
      )}
    </DialogoMotivo>
  );
}
