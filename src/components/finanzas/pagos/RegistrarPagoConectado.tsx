'use client';

/**
 * Pago único conectado: une el diálogo presentacional del kit
 * (`kit/documento/RegistrarPagoDialog`) con el servidor (`GET /api/pagos/contexto`
 * y `POST /api/pagos`). Lo usan la factura de venta, las cuentas por cobrar de
 * Finanzas y del POS y la cartera del cliente; compras/CxP y el detalle de
 * venta pueden montarlo igual (plan §6).
 *
 * No calcula saldos ni escribe tablas: el reparto FIFO que se muestra es el
 * mismo que valida la RPC y la clave de idempotencia es una por apertura (un
 * reintento tras un corte de red no cobra dos veces).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RegistrarPagoDialog, type DocumentoPago as DocumentoKit, type ValorPago } from '@/components/kit/documento';
import type { MetodoPagoOpcion } from '@/components/kit/metodosPago';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { nuevaClaveIdempotencia, type OrigenPago, type ResultadoPago, type SolicitudPago } from '@/lib/finanzas/pagos/contrato';
import { ErrorPeticionPago, enviarPago, pedirContextoPago, type ContextoPago } from '@/lib/finanzas/pagos/clientePagos';
import { repartirFifo } from '@/lib/finanzas/pagos/reparto';
import { RepartoTercero } from './RepartoTercero';

export type DestinoPagoConectado =
  | { tipo: 'factura'; id: string }
  | { tipo: 'cuenta'; id: string; cuotaId?: string | null }
  | { tipo: 'tercero'; customerId: string };

export interface RegistrarPagoConectadoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  destino: DestinoPagoConectado;
  origen: OrigenPago;
  onRegistrado?: (resultado: ResultadoPago) => void;
  /** Ruta de la caja para «Abrir caja» (por defecto la de Cajas del POS). */
  rutaCaja?: string;
}

const SELECT_CLASES =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function RegistrarPagoConectado({
  abierto,
  onAbiertoChange,
  destino,
  origen,
  onRegistrado,
  rutaCaja = '/app/pos/cajas',
}: RegistrarPagoConectadoProps) {
  const t = useTranslations('pagos');
  const router = useRouter();
  const moneda = useMonedaOrganizacion();
  const [contexto, setContexto] = useState<ContextoPago | null>(null);
  const [cargandoContexto, setCargandoContexto] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorMonto, setErrorMonto] = useState<string | null>(null);
  const [cuotaId, setCuotaId] = useState<string>('');
  const [cuentaBancaria, setCuentaBancaria] = useState<string>('');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [sobranteAFavor, setSobranteAFavor] = useState(false);
  const clave = useRef<string>(nuevaClaveIdempotencia());

  const documentoConsulta = destino.tipo === 'factura' ? 'invoice_sales' : destino.tipo === 'cuenta' ? 'account_receivable' : undefined;
  const idConsulta = destino.tipo === 'tercero' ? undefined : destino.id;
  const clienteConsulta = destino.tipo === 'tercero' ? destino.customerId : undefined;
  const cuotaInicial = destino.tipo === 'cuenta' ? destino.cuotaId ?? '' : '';

  const cargar = useCallback(async () => {
    setCargandoContexto(true);
    setErrorCarga(null);
    try {
      const c = await pedirContextoPago({ direccion: 'cobro', documento: documentoConsulta, id: idConsulta, cliente: clienteConsulta });
      setContexto(c);
      setSeleccion(new Set(c.documentos.map((d) => d.cuenta_id)));
    } catch (e) {
      const clave = `errores.${e instanceof ErrorPeticionPago ? e.codigo : 'error_desconocido'}`;
      setErrorCarga(t.has(clave) ? t(clave as never) : t('errorCarga'));
      setContexto(null);
    } finally {
      setCargandoContexto(false);
    }
  }, [documentoConsulta, idConsulta, clienteConsulta, t]);

  useEffect(() => {
    if (!abierto) return;
    clave.current = nuevaClaveIdempotencia(origen);
    setError(null);
    setErrorMonto(null);
    setCuotaId(cuotaInicial);
    setCuentaBancaria('');
    setSobranteAFavor(false);
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [abierto]);

  const docs = useMemo(() => contexto?.documentos ?? [], [contexto]);
  const principal = docs[0] ?? null;
  const ctxMoneda = moneda.paraDocumento(principal?.moneda);
  const formatear = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);
  const { formatDate, formatPlain } = useFormatDate(principal?.branch_id ?? null);

  const cuotaElegida = principal?.cuotas.find((c) => c.id === cuotaId) ?? null;
  const seleccionados = docs.filter((d) => seleccion.has(d.cuenta_id));
  const saldoSeleccion = seleccionados.reduce((s, d) => s + d.saldo, 0);

  const metodos: MetodoPagoOpcion[] = useMemo(
    () => (contexto?.metodos ?? []).map((m) => ({ codigo: m.code, nombre: m.name })),
    [contexto],
  );
  const conReferencia = useMemo(() => (contexto?.metodos ?? []).filter((m) => m.requires_reference).map((m) => m.code), [contexto]);

  const documentoKit: DocumentoKit | undefined =
    destino.tipo !== 'tercero' && principal
      ? {
          tipo: destino.tipo === 'factura' ? 'factura' : 'cuentaPorCobrar',
          numero: principal.numero ?? t('sinNumero'),
          tercero: contexto?.tercero?.nombre ?? null,
          total: principal.total,
          saldo: cuotaElegida ? Math.min(cuotaElegida.saldo, principal.saldo) : principal.saldo,
          vencimiento: principal.vencimiento ? formatDate(principal.vencimiento) : null,
        }
      : undefined;

  const avisoCaja =
    contexto && !contexto.caja.abierta
      ? {
          mensaje: t('sinCaja'),
          accion: {
            etiqueta: t('abrirCaja'),
            onClick: () => {
              onAbiertoChange(false);
              router.push(rutaCaja);
            },
          },
        }
      : null;

  const traducirError = (e: unknown): string => {
    if (e instanceof ErrorPeticionPago) {
      if (e.codigo === 'monto_excede_saldo') {
        const saldo = (e.detalle as { saldo?: number } | null)?.saldo;
        return t('errores.monto_excede_saldo', { saldo: typeof saldo === 'number' ? formatear(saldo) : '—' });
      }
      const clave = `errores.${e.codigo}`;
      return t.has(clave) ? t(clave as never) : t('errores.error_desconocido');
    }
    return t('errores.error_desconocido');
  };

  const confirmar = async (valor: ValorPago) => {
    if (!principal || valor.monto === null || !valor.metodo) return;
    setError(null);
    setErrorMonto(null);

    let aplicaciones: SolicitudPago['aplicaciones'];
    let anticipo = 0;
    if (destino.tipo === 'tercero') {
      const reparto = repartirFifo(
        valor.monto,
        seleccionados.map((d) => ({ id: d.cuenta_id, saldo: d.saldo, moneda: d.moneda, vencimiento: d.vencimiento, emision: d.emision })),
        { permitirSobrante: sobranteAFavor },
      );
      if (!reparto.ok) {
        setErrorMonto(t(`reparto.errores.${reparto.error}`));
        return;
      }
      aplicaciones = reparto.aplicaciones.map((a) => ({ documento: 'account_receivable' as const, id: a.id, monto: a.monto }));
      anticipo = reparto.sobrante;
    } else {
      aplicaciones = [
        {
          documento: destino.tipo === 'factura' ? 'invoice_sales' : 'account_receivable',
          id: principal.id,
          cuota_id: cuotaId || null,
          monto: valor.monto,
        },
      ];
    }

    setEnviando(true);
    try {
      const resultado = await enviarPago({
        direccion: 'cobro',
        origen,
        aplicaciones,
        metodo: valor.metodo,
        moneda: ctxMoneda.code,
        fecha: valor.fecha,
        referencia: valor.referencia || null,
        cuenta_bancaria: valor.metodo !== 'cash' && cuentaBancaria ? Number(cuentaBancaria) : null,
        recibido: valor.metodo === 'cash' ? valor.recibido ?? null : null,
        anticipo,
        notas: valor.notas || null,
        clave_idempotencia: clave.current,
      });
      toastSuccess(
        t('registrado.titulo'),
        resultado.anticipo > 0
          ? t('registrado.conSaldoAFavor', { recibo: resultado.recibo, anticipo: formatear(resultado.anticipo) })
          : t('registrado.descripcion', { recibo: resultado.recibo, monto: formatear(resultado.total_aplicado) }),
      );
      clave.current = nuevaClaveIdempotencia(origen);
      onRegistrado?.(resultado);
      onAbiertoChange(false);
    } catch (e) {
      const texto = traducirError(e);
      if (e instanceof ErrorPeticionPago && (e.codigo === 'monto_excede_saldo' || e.codigo === 'monto_excede_cuota')) setErrorMonto(texto);
      else setError(texto);
      if (!(e instanceof ErrorPeticionPago)) toastError(t('errores.error_desconocido'));
    } finally {
      setEnviando(false);
    }
  };

  const camposExtra = (
    <>
      {destino.tipo === 'cuenta' && principal && principal.cuotas.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          {t('cuota')}
          <select value={cuotaId} onChange={(e) => setCuotaId(e.target.value)} className={SELECT_CLASES}>
            <option value="">{t('cuotaNinguna')}</option>
            {principal.cuotas.map((c) => (
              <option key={c.id} value={c.id}>
                {t('cuotaOpcion', { numero: c.numero, fecha: formatPlain(c.vencimiento), saldo: formatear(c.saldo) })}
              </option>
            ))}
          </select>
        </label>
      )}
      {(contexto?.cuentasBancarias.length ?? 0) > 0 && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          {t('cuentaBancaria')}
          <select value={cuentaBancaria} onChange={(e) => setCuentaBancaria(e.target.value)} className={SELECT_CLASES}>
            <option value="">{t('cuentaBancariaNinguna')}</option>
            {contexto?.cuentasBancarias.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.name, c.bank_name, c.ultimos ? `···${c.ultimos}` : null].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-fg-muted">{t('cuentaBancariaAyuda')}</span>
        </label>
      )}
      {errorMonto && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMonto}
        </p>
      )}
    </>
  );

  const reparto =
    destino.tipo === 'tercero' ? (
      <RepartoTercero
        documentos={docs}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        sobranteAFavor={sobranteAFavor}
        onSobranteChange={setSobranteAFavor}
        formatear={formatear}
        formatearFecha={formatDate}
        cargando={cargandoContexto}
      />
    ) : undefined;

  return (
    <RegistrarPagoDialog
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      destino={destino.tipo}
      documento={documentoKit}
      saldo={destino.tipo === 'tercero' ? saldoSeleccion : undefined}
      moneda={ctxMoneda}
      metodos={metodos}
      hoy={contexto?.hoy || ''}
      valorInicial={cuotaElegida ? { monto: Math.min(cuotaElegida.saldo, principal?.saldo ?? cuotaElegida.saldo) } : undefined}
      onConfirmar={confirmar}
      cargando={enviando || cargandoContexto}
      error={errorCarga ?? error}
      permitirExcedente={destino.tipo === 'tercero' && sobranteAFavor}
      codigosConReferencia={conReferencia}
      avisoCaja={avisoCaja}
      reparto={reparto}
      camposExtra={camposExtra}
      descripcion={contexto?.tercero?.nombre && destino.tipo === 'tercero' ? contexto.tercero.nombre : undefined}
    />
  );
}
