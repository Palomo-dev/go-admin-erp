'use client';

/**
 * Pago a proveedor con el diálogo único del kit (`RegistrarPagoDialog`) y el
 * pago único del servidor (`POST /api/pagos`, dirección `pago`). El contexto
 * (cuenta abierta, cuotas, métodos, bancos, caja, hoy) lo da
 * `GET /api/cuentas-por-pagar/contexto-pago` con el mismo contrato que el cobro.
 *
 * Es el gemelo de `finanzas/pagos/RegistrarPagoConectado` (que hoy solo cobra):
 * no calcula saldos ni escribe tablas; una clave de idempotencia por apertura.
 * Cuando `RegistrarPagoConectado` acepte `direccion='pago'`, este archivo se
 * reduce a montarlo (pedido a la sesión de ventas).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RegistrarPagoDialog, type DocumentoPago as DocumentoKit, type ValorPago } from '@/components/kit/documento';
import type { MetodoPagoOpcion } from '@/components/kit/metodosPago';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { nuevaClaveIdempotencia, type ContextoPago, type ResultadoPago } from '@/lib/finanzas/pagos/contrato';
import { ErrorPeticionPago, enviarPago } from '@/lib/finanzas/pagos/clientePagos';

export interface RegistrarPagoProveedorProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  documento: 'invoice_purchase' | 'account_payable';
  id: string;
  cuotaId?: string | null;
  origen: 'factura_compra' | 'cxp';
  onRegistrado?: (resultado: ResultadoPago) => void;
}

const SELECT_CLASES =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

async function pedirContexto(documento: string, id: string): Promise<ContextoPago> {
  const org = getOrganizationId();
  const r = await fetch(`/api/cuentas-por-pagar/contexto-pago?documento=${documento}&id=${encodeURIComponent(id)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: org > 0 ? { 'x-organization-id': String(org) } : undefined,
  });
  const cuerpo = (await r.json().catch(() => null)) as (ContextoPago & { codigo?: string }) | null;
  if (!r.ok) throw new ErrorPeticionPago(cuerpo?.codigo ?? 'error_desconocido', r.status);
  return cuerpo as ContextoPago;
}

export function RegistrarPagoProveedor({
  abierto,
  onAbiertoChange,
  documento,
  id,
  cuotaId: cuotaInicial = null,
  origen,
  onRegistrado,
}: RegistrarPagoProveedorProps) {
  const t = useTranslations('pagos');
  const tc = useTranslations('cuentasPorPagar.pago');
  const router = useRouter();
  const moneda = useMonedaOrganizacion();
  const [contexto, setContexto] = useState<ContextoPago | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorMonto, setErrorMonto] = useState<string | null>(null);
  const [cuotaId, setCuotaId] = useState<string>('');
  const [cuentaBancaria, setCuentaBancaria] = useState<string>('');
  const clave = useRef<string>(nuevaClaveIdempotencia(origen));

  const traducir = useCallback(
    (codigo: string): string => {
      const k = `errores.${codigo}`;
      return t.has(k) ? t(k as never) : t('errores.error_desconocido');
    },
    [t],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setContexto(await pedirContexto(documento, id));
    } catch (e) {
      setErrorCarga(e instanceof ErrorPeticionPago ? (tc.has(`errores.${e.codigo}`) ? tc(`errores.${e.codigo}` as never) : traducir(e.codigo)) : t('errorCarga'));
      setContexto(null);
    } finally {
      setCargando(false);
    }
  }, [documento, id, t, tc, traducir]);

  useEffect(() => {
    if (!abierto) return;
    clave.current = nuevaClaveIdempotencia(origen);
    setError(null);
    setErrorMonto(null);
    setCuotaId(cuotaInicial ?? '');
    setCuentaBancaria('');
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [abierto]);

  const principal = contexto?.documentos[0] ?? null;
  const ctxMoneda = moneda.paraDocumento(principal?.moneda);
  const formatear = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);
  const { formatDate, formatPlain } = useFormatDate(principal?.branch_id ?? null);
  const cuota = principal?.cuotas.find((c) => c.id === cuotaId) ?? null;

  const metodos: MetodoPagoOpcion[] = useMemo(() => (contexto?.metodos ?? []).map((m) => ({ codigo: m.code, nombre: m.name })), [contexto]);
  const conReferencia = useMemo(() => (contexto?.metodos ?? []).filter((m) => m.requires_reference).map((m) => m.code), [contexto]);

  const documentoKit: DocumentoKit | undefined = principal
    ? {
        tipo: documento === 'invoice_purchase' ? 'facturaCompra' : 'cuentaPorPagar',
        numero: principal.numero ?? t('sinNumero'),
        tercero: contexto?.tercero?.nombre ?? null,
        total: principal.total,
        saldo: cuota ? Math.min(cuota.saldo, principal.saldo) : principal.saldo,
        vencimiento: principal.vencimiento ? formatDate(principal.vencimiento) : null,
      }
    : undefined;

  const sinSaldo = contexto && !principal ? tc('sinSaldo') : null;

  const avisoCaja =
    contexto && !contexto.caja.abierta
      ? {
          mensaje: t('sinCaja'),
          accion: {
            etiqueta: t('abrirCaja'),
            onClick: () => {
              onAbiertoChange(false);
              router.push('/app/pos/cajas');
            },
          },
        }
      : null;

  const confirmar = async (valor: ValorPago) => {
    if (!principal || valor.monto === null || !valor.metodo) return;
    setError(null);
    setErrorMonto(null);
    setEnviando(true);
    try {
      const resultado = await enviarPago({
        direccion: 'pago',
        origen,
        aplicaciones: [{ documento: 'account_payable', id: principal.cuenta_id, cuota_id: cuotaId || null, monto: valor.monto }],
        metodo: valor.metodo,
        moneda: ctxMoneda.code,
        fecha: valor.fecha,
        referencia: valor.referencia || null,
        cuenta_bancaria: valor.metodo !== 'cash' && cuentaBancaria ? Number(cuentaBancaria) : null,
        recibido: null,
        anticipo: 0,
        notas: valor.notas || null,
        clave_idempotencia: clave.current,
      });
      toastSuccess(tc('registrado.titulo'), tc('registrado.descripcion', { recibo: resultado.recibo, monto: formatear(resultado.total_aplicado) }));
      clave.current = nuevaClaveIdempotencia(origen);
      onRegistrado?.(resultado);
      onAbiertoChange(false);
    } catch (e) {
      if (e instanceof ErrorPeticionPago) {
        const texto =
          e.codigo === 'monto_excede_saldo'
            ? t('errores.monto_excede_saldo', { saldo: formatear(principal.saldo) })
            : traducir(e.codigo);
        if (e.codigo === 'monto_excede_saldo' || e.codigo === 'monto_excede_cuota') setErrorMonto(texto);
        else setError(texto);
      } else {
        setError(t('errores.error_desconocido'));
        toastError(t('errores.error_desconocido'));
      }
    } finally {
      setEnviando(false);
    }
  };

  const camposExtra = (
    <>
      {principal && principal.cuotas.length > 0 && (
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
          {tc('cuentaOrigen')}
          <select value={cuentaBancaria} onChange={(e) => setCuentaBancaria(e.target.value)} className={SELECT_CLASES}>
            <option value="">{t('cuentaBancariaNinguna')}</option>
            {contexto?.cuentasBancarias.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.name, c.bank_name, c.ultimos ? `···${c.ultimos}` : null].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </label>
      )}
      {errorMonto && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMonto}
        </p>
      )}
    </>
  );

  return (
    <RegistrarPagoDialog
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      destino={documento === 'invoice_purchase' ? 'factura' : 'cuenta'}
      titulo={tc('titulo')}
      documento={documentoKit}
      moneda={ctxMoneda}
      metodos={metodos}
      hoy={contexto?.hoy || ''}
      valorInicial={cuota && principal ? { monto: Math.min(cuota.saldo, principal.saldo) } : undefined}
      onConfirmar={confirmar}
      cargando={enviando || cargando}
      error={errorCarga ?? sinSaldo ?? error}
      codigosConReferencia={conReferencia}
      avisoCaja={avisoCaja}
      camposExtra={camposExtra}
      textoConfirmar={tc('confirmar')}
    />
  );
}
