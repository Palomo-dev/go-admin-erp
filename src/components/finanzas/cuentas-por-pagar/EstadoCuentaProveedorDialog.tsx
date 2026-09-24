'use client';

/**
 * Estado de cuenta de un proveedor (plan F9) sobre la pieza del kit
 * (`kit/documento/EstadoCuentaDialog`, compartida con CxC). Aquí queda lo del
 * dominio: saldo inicial, cargos (facturas confirmadas por el neto), abonos
 * (pagos) y saldo corrido los calcula la base (`fn_estado_cuenta_proveedor`)
 * con el día de la organización. Se descarga en PDF o se imprime con el motor
 * de documentos (tipo `estado-cuenta-proveedor`, mismo rango), y sigue
 * disponible en CSV.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EstadoCuentaDialog, type EstadoCuentaVista, type RangoFechas, type TipoDocumento } from '@/components/kit';
import { toastError } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';
import { descargarDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import type { EstadoCuentaProveedor, MovimientoEstadoCuenta } from '@/lib/services/compras/contrato';

export interface EstadoCuentaProveedorDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  proveedorId: number;
  proveedorNombre: string;
}

const TIPO: Record<MovimientoEstadoCuenta['tipo'], TipoDocumento> = {
  factura: 'facturaCompra',
  cuenta: 'cuentaPorPagar',
  pago: 'pago',
};

/** Contrato de la RPC → forma del kit. */
export function vistaEstadoCuentaProveedor(d: EstadoCuentaProveedor): EstadoCuentaVista {
  return {
    saldoInicial: d.saldo_inicial,
    saldoFinal: d.saldo_final,
    vencido: d.vencido,
    porVencer: d.por_vencer,
    totalCargos: d.total_cargos,
    totalAbonos: d.total_abonos,
    movimientos: d.movimientos.map((m) => ({
      id: `${m.tipo}-${m.ref_id}`,
      dia: m.dia,
      tipo: TIPO[m.tipo],
      documento: m.documento,
      vence: m.vence,
      cargo: m.cargo,
      abono: m.abono,
      saldo: m.saldo,
    })),
  };
}

export function EstadoCuentaProveedorDialog({ abierto, onAbiertoChange, proveedorId, proveedorNombre }: EstadoCuentaProveedorDialogProps) {
  const t = useTranslations('cuentasPorPagar.estadoCuenta');
  const te = useTranslations('cuentasPorPagar.errores');
  const moneda = useMonedaOrganizacion();
  const { formatPlain, getToday } = useFormatDate();
  const [rango, setRango] = useState<RangoFechas>({ desde: '', hasta: '' });
  const [datos, setDatos] = useState<EstadoCuentaProveedor | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descargandoPdf, setDescargandoPdf] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await clienteCompras.estadoCuentaProveedor(proveedorId, rango.desde || null, rango.hasta || null));
    } catch (e) {
      const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
      setError(te.has(codigo) ? te(codigo as never) : te('error_desconocido'));
    } finally {
      setCargando(false);
    }
  }, [proveedorId, rango.desde, rango.hasta, te]);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  const vista = useMemo(() => (datos ? vistaEstadoCuentaProveedor(datos) : null), [datos]);
  const hoy = getToday();

  // PDF e impresión: el servidor arma el documento desde la base con el mismo
  // rango (motor de documentos); aquí solo viajan el id y las fechas.
  const rangoDocumento = { desde: rango.desde || undefined, hasta: rango.hasta || undefined };
  const descargarPdf = async () => {
    setDescargandoPdf(true);
    try {
      await descargarDocumento('estado-cuenta-proveedor', proveedorId, rangoDocumento);
    } catch (e) {
      console.error('Error descargando el estado de cuenta en PDF:', e);
      toastError(t('errorDescarga'));
    } finally {
      setDescargandoPdf(false);
    }
  };

  return (
    <EstadoCuentaDialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      tercero={{ tipo: 'proveedor', nombre: proveedorNombre }}
      datos={vista}
      cargando={cargando}
      error={error}
      onReintentar={() => void cargar()}
      rango={rango}
      onRangoChange={(r) => setRango({ desde: r.desde || '', hasta: r.hasta || '' })}
      hoy={hoy}
      moneda={moneda.paraDocumento(datos?.moneda)}
      formatearDia={formatPlain}
      nombreArchivo={`${t('archivo')}_${proveedorId}_${hoy}`}
      onErrorDescarga={(e) => {
        console.error('Error descargando el estado de cuenta:', e);
        toastError(t('errorDescarga'));
      }}
      pdf={{
        onDescargar: () => void descargarPdf(),
        onImprimir: () => imprimirDocumento('estado-cuenta-proveedor', proveedorId, rangoDocumento),
        cargando: descargandoPdf,
      }}
    />
  );
}
