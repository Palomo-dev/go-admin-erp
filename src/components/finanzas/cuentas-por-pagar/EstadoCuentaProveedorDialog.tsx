'use client';

/**
 * Estado de cuenta de un proveedor (plan F9): saldo inicial, cargos (facturas
 * confirmadas por el neto), abonos (pagos) y saldo corrido, calculados en la
 * base (`fn_estado_cuenta_proveedor`) con el día de la organización. Se puede
 * descargar en CSV; el PDF depende del motor de documentos (pedido: tipo
 * `estado-cuenta-proveedor`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ScrollText } from 'lucide-react';
import { DateRangeButton, Dialogo, EmptyState, FilaDato } from '@/components/kit';
import { toastError } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';
import type { EstadoCuentaProveedor } from '@/lib/services/compras/contrato';

export interface EstadoCuentaProveedorDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  proveedorId: number;
  proveedorNombre: string;
}

export function EstadoCuentaProveedorDialog({ abierto, onAbiertoChange, proveedorId, proveedorNombre }: EstadoCuentaProveedorDialogProps) {
  const t = useTranslations('cuentasPorPagar.estadoCuenta');
  const te = useTranslations('cuentasPorPagar.errores');
  const moneda = useMonedaOrganizacion();
  const { formatPlain, getToday } = useFormatDate();
  const [rango, setRango] = useState<{ desde: string; hasta: string }>({ desde: '', hasta: '' });
  const [datos, setDatos] = useState<EstadoCuentaProveedor | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatear = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(datos?.moneda)), [moneda, datos?.moneda]);

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

  const descargar = () => {
    if (!datos) return;
    try {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const cab = [t('columnas.fecha'), t('columnas.documento'), t('columnas.vence'), t('columnas.cargo'), t('columnas.abono'), t('columnas.saldo')];
      const filas = datos.movimientos.map((m) =>
        [formatPlain(m.dia), m.documento ?? t(`tipos.${m.tipo}`), m.vence ? formatPlain(m.vence) : '', m.cargo, m.abono, m.saldo].map(esc).join(','),
      );
      const csv = ['﻿' + cab.map(esc).join(','), [esc(t('saldoInicial')), '', '', '', '', esc(datos.saldo_inicial)].join(','), ...filas].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t('archivo')}_${proveedorId}_${getToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error descargando el estado de cuenta:', e);
      toastError(t('errorDescarga'));
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { proveedor: proveedorNombre })}
      icono={ScrollText}
      ancho={880}
      textoCancelar={t('cerrar')}
      primario={{ etiqueta: t('descargar'), onClick: descargar, deshabilitada: !datos || cargando, motivo: t('sinDatos') }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeButton hoy={getToday()} etiqueta={t('periodo')} valor={rango} onValorChange={(r) => setRango({ desde: r.desde || '', hasta: r.hasta || '' })} />
        </div>
        {error ? (
          <EmptyState variante="error" titulo={error} onReintentar={() => void cargar()} compacto />
        ) : cargando || !datos ? (
          <p role="status" className="py-6 text-center text-sm text-fg-secondary">
            {t('cargando')}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <FilaDato etiqueta={t('saldoInicial')} valor={formatear(datos.saldo_inicial)} />
              <FilaDato etiqueta={t('saldoFinal')} valor={formatear(datos.saldo_final)} tamano="lg" />
              <FilaDato etiqueta={t('vencido')} valor={formatear(datos.vencido)} tono={datos.vencido > 0 ? 'peligro' : undefined} />
              <FilaDato etiqueta={t('porVencer')} valor={formatear(datos.por_vencer)} />
            </div>
            {datos.movimientos.length === 0 ? (
              <p className="py-4 text-sm text-fg-secondary">{t('vacio')}</p>
            ) : (
              <div className="max-h-[50vh] overflow-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('tabla', { proveedor: proveedorNombre })}</caption>
                  <thead className="sticky top-0 bg-subtle text-left text-xs text-fg-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">{t('columnas.fecha')}</th>
                      <th scope="col" className="px-3 py-2 font-medium">{t('columnas.documento')}</th>
                      <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">{t('columnas.vence')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{t('columnas.cargo')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{t('columnas.abono')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{t('columnas.saldo')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.movimientos.map((m) => (
                      <tr key={`${m.tipo}-${m.ref_id}`} className="border-t border-line">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatPlain(m.dia)}</td>
                        <td className="px-3 py-2">{m.documento ?? t(`tipos.${m.tipo}`)}</td>
                        <td className="hidden whitespace-nowrap px-3 py-2 tabular-nums sm:table-cell">{m.vence ? formatPlain(m.vence) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.cargo ? formatear(m.cargo) : ''}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.abono ? formatear(m.abono) : ''}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatear(m.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-line-strong text-sm font-medium">
                    <tr>
                      <th scope="row" colSpan={3} className="px-3 py-2 text-left">
                        {t('totales')}
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">{formatear(datos.total_cargos)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatear(datos.total_abonos)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatear(datos.saldo_final)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}
