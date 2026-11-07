'use client';

/**
 * Pestaña «Posición» de Cuentas de dinero: la «Tesorería consolidada» vieja
 * (`/finanzas/bancos/tesoreria`, que ahora redirige aquí) con el kit y con los
 * errores a la vista (antes una API caída se veía como «sin datos»).
 *
 * Lee los mismos endpoints de siempre (servicio de tesorería de Open Finance),
 * que toman la organización de la sesión y exigen `finance.view`: posición por
 * cuenta (saldo en libros, saldo real del banco y diferencia), proyección de
 * 90 días, alertas de tesorería y concentración de pagos del año.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Download } from 'lucide-react';
import { AvisoTonal, DataTable, KpiStrip, StatCard, StatusBadge, Tarjeta, clasesBoton, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { barrasPorCuenta, serieSaldoProyectado, tramosProyeccion } from '@/lib/finanzas/tesoreria/posicionTesoreria';
import { descargarCsv } from '../compartido/TesoreriaComun';
import { GraficaPorCuenta, GraficaSaldoProyectado } from './GraficasPosicion';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface PosicionCuenta {
  bankAccountId: number;
  bankName: string;
  accountName: string;
  currency: string;
  localBalance: number;
  realBalance: number | null;
  difference: number | null;
  isLinked: boolean;
}
interface Posicion {
  totalByCurrency: Record<string, number>;
  accounts: PosicionCuenta[];
}
interface Proyeccion {
  entries: { date: string; inflow: number; outflow: number; netFlow: number; projectedBalance: number; description: string }[];
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
}
interface AlertaTesoreria {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  amount?: number;
}
interface Concentracion {
  supplierId: number;
  supplierName: string;
  totalAmount: number;
  paymentCount: number;
  averageAmount: number;
  percentage: number;
}

async function leer<T>(url: string): Promise<T> {
  const org = getOrganizationId();
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: org ? { 'x-organization-id': String(org) } : undefined });
  if (r.status === 403) throw Object.assign(new Error('sin_permiso'), { sinPermiso: true });
  const d = (await r.json().catch(() => null)) as { success?: boolean; data?: T } | null;
  if (!r.ok || !d?.success) throw new Error(String(r.status));
  return d.data as T;
}

const TONO_SEVERIDAD = { high: 'peligro', medium: 'advertencia', low: 'informacion' } as const;

export function PosicionTesoreria({ activa }: { activa: boolean }) {
  const t = useTranslations('finanzasTesoreriaR3.posicion');
  const locale = useLocale();
  const { code, formatear, paraDocumento } = useMonedaOrganizacion();
  const formatEn = (moneda: string | null | undefined, valor: number) => formatMoneda(valor, paraDocumento(moneda));
  const { getToday } = useFormatDate();
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const [proyeccion, setProyeccion] = useState<Proyeccion | null>(null);
  const [alertas, setAlertas] = useState<AlertaTesoreria[] | null>(null);
  const [concentracion, setConcentracion] = useState<Concentracion[] | null>(null);
  const [fallas, setFallas] = useState<string[]>([]);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    const hasta = getToday();
    const desde = `${hasta.slice(0, 4)}-01-01`;
    const base = '/api/integrations/open-finance/treasury';
    const [p, pr, a, c] = await Promise.allSettled([
      leer<Posicion>(base),
      leer<Proyeccion>(`${base}/projection?days=90`),
      leer<AlertaTesoreria[]>(`${base}/alerts`),
      leer<Concentracion[]>(`${base}/concentration?dateFrom=${desde}&dateTo=${hasta}`),
    ]);
    if (p.status === 'rejected' && (p.reason as { sinPermiso?: boolean })?.sinPermiso) {
      setEstado('sinPermiso');
      return;
    }
    setPosicion(p.status === 'fulfilled' ? p.value : null);
    setProyeccion(pr.status === 'fulfilled' ? pr.value : null);
    setAlertas(a.status === 'fulfilled' ? a.value ?? [] : null);
    setConcentracion(c.status === 'fulfilled' ? c.value ?? [] : null);
    setFallas(
      [p.status === 'rejected' && 'posicion', pr.status === 'rejected' && 'proyeccion', a.status === 'rejected' && 'alertas', c.status === 'rejected' && 'concentracion'].filter(
        (x): x is string => typeof x === 'string',
      ),
    );
    setEstado(p.status === 'rejected' ? 'error' : 'listo');
  }, [getToday]);

  useEffect(() => {
    if (!activa || cargado) return;
    setCargado(true);
    void cargar();
  }, [activa, cargado, cargar]);

  const totalBase = posicion?.totalByCurrency?.[code] ?? 0;
  const otras = Object.entries(posicion?.totalByCurrency ?? {}).filter(([m]) => m !== code);
  const hoy = getToday();
  // La proyección del servicio arranca en el saldo consolidado (todas las monedas sumadas): la gráfica también.
  const saldoInicioProyeccion = Object.values(posicion?.totalByCurrency ?? {}).reduce((acc, v) => acc + v, 0);
  const serie = useMemo(
    () => (proyeccion ? serieSaldoProyectado(saldoInicioProyeccion, proyeccion.entries, hoy) : []),
    [proyeccion, saldoInicioProyeccion, hoy],
  );
  const tramos = useMemo(
    () => (proyeccion ? tramosProyeccion(saldoInicioProyeccion, proyeccion.entries, hoy) : []),
    [proyeccion, saldoInicioProyeccion, hoy],
  );
  const saldo90 = tramos.length ? tramos[tramos.length - 1].saldoFinal : null;
  const barras = useMemo(
    () =>
      barrasPorCuenta((posicion?.accounts ?? []).filter((a) => a.currency === code)).map((a) => ({
        id: String(a.bankAccountId),
        nombre: a.accountName,
        saldo: a.localBalance,
      })),
    [posicion, code],
  );
  const minimo = serie.reduce((m, punto) => Math.min(m, punto.saldo), Number.POSITIVE_INFINITY);

  const exportar = () => {
    const celda = (v: string | number) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lineas = [
      [t('tramos.columnas.periodo'), t('tramos.columnas.entradas'), t('tramos.columnas.salidas'), t('tramos.columnas.saldo')].map(celda).join(','),
      ...tramos.map((x) => [t(`tramos.${x.id}`), x.entradas, x.salidas, x.saldoFinal].map(celda).join(',')),
      '',
      [t('columnas.cuenta'), t('columnas.banco'), t('columnas.libros'), t('columnas.real')].map(celda).join(','),
      ...(posicion?.accounts ?? []).map((a) => [a.accountName, a.bankName, a.localBalance, a.realBalance ?? ''].map(celda).join(',')),
    ];
    descargarCsv(`tesoreria_consolidada_${hoy}.csv`, lineas.join('\n'));
  };

  const columnas: ColumnaTabla<PosicionCuenta>[] = [
    { id: 'cuenta', encabezado: t('columnas.cuenta'), celda: (a) => <span className="font-medium text-fg">{a.accountName}</span> },
    { id: 'banco', encabezado: t('columnas.banco'), celda: (a) => a.bankName, ocultarDebajo: 'md' },
    { id: 'libros', encabezado: t('columnas.libros'), variante: 'importe', celda: (a) => formatEn(a.currency, a.localBalance) },
    { id: 'real', encabezado: t('columnas.real'), variante: 'importe', celda: (a) => (a.realBalance === null ? t('sinConectar') : formatEn(a.currency, a.realBalance)) },
    {
      id: 'diferencia',
      encabezado: t('columnas.diferencia'),
      variante: 'importe',
      celda: (a) =>
        a.difference === null ? '—' : <span className={a.difference === 0 ? 'text-fg' : 'text-warning-text'}>{formatEn(a.currency, a.difference)}</span>,
    },
  ];

  const columnasConc: ColumnaTabla<Concentracion>[] = [
    { id: 'proveedor', encabezado: t('concentracion.proveedor'), celda: (c) => c.supplierName },
    { id: 'total', encabezado: t('concentracion.total'), variante: 'importe', celda: (c) => formatear(c.totalAmount) },
    { id: 'pagos', encabezado: t('concentracion.pagos'), variante: 'importe', celda: (c) => c.paymentCount, ocultarDebajo: 'md' },
    { id: 'promedio', encabezado: t('concentracion.promedio'), variante: 'importe', celda: (c) => formatear(c.averageAmount), ocultarDebajo: 'lg' },
    {
      id: 'porcentaje',
      encabezado: t('concentracion.porcentaje'),
      variante: 'importe',
      celda: (c) => <span className={c.percentage > 30 ? 'font-semibold text-warning-text' : 'text-fg'}>{c.percentage.toFixed(1)} %</span>,
    },
  ];


  return (
    <div className="space-y-6">
      {fallas.length > 0 && estado === 'listo' && (
        <AvisoTonal tono="advertencia" titulo={t('parcial.titulo')} descripcion={t('parcial.descripcion', { partes: fallas.map((f) => t(`partes.${f}`)).join(', ') })} accion={{ etiqueta: t('reintentar'), onClick: () => void cargar() }} />
      )}
      <div className="flex justify-end">
        <button type="button" onClick={exportar} disabled={estado !== 'listo'} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          <Download className="h-4 w-4" aria-hidden />
          {t('exportar')}
        </button>
      </div>

      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard
          etiqueta={t('kpi.efectivoHoy')}
          valor={formatear(totalBase)}
          detalle={otras.length > 0 ? otras.map(([m, v]) => formatEn(m, v)).join(' · ') : t('kpi.totalAyuda')}
          cargando={estado === 'cargando'}
        />
        <StatCard etiqueta={t('kpi.porCobrar')} valor={proyeccion ? formatear(proyeccion.totalInflow) : '—'} detalle={t('kpi.porCobrarAyuda')} cargando={estado === 'cargando'} />
        <StatCard etiqueta={t('kpi.porPagar')} valor={proyeccion ? formatear(proyeccion.totalOutflow) : '—'} detalle={t('kpi.porPagarAyuda')} cargando={estado === 'cargando'} />
        <StatCard
          etiqueta={t('kpi.proyeccion90')}
          valor={saldo90 === null ? '—' : formatear(saldo90)}
          tono={saldo90 !== null && saldo90 < 0 ? 'peligro' : 'neutro'}
          cargando={estado === 'cargando'}
        />
      </KpiStrip>

      {estado === 'listo' && proyeccion && serie.length > 0 && (
        <Tarjeta titulo={t('grafica.titulo')} descripcion={t('grafica.descripcion')}>
          <GraficaSaldoProyectado
            puntos={serie}
            formatear={formatear}
            locale={locale}
            textos={{
              titulo: t('grafica.titulo'),
              resumen: t('grafica.resumen', { hoy: formatear(serie[0].saldo), final: formatear(serie[serie.length - 1].saldo), minimo: formatear(minimo) }),
              saldo: t('grafica.saldo'),
              entra: t('grafica.entra'),
              sale: t('grafica.sale'),
            }}
          />
          {minimo < 0 && <p className="mt-2 text-xs font-medium text-danger-text">{t('grafica.negativo', { minimo: formatear(minimo) })}</p>}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('tramos.titulo')}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-secondary">
                  <th scope="col" className="py-2 font-medium">{t('tramos.columnas.periodo')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('tramos.columnas.entradas')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('tramos.columnas.salidas')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('tramos.columnas.saldo')}</th>
                </tr>
              </thead>
              <tbody>
                {tramos.map((x) => (
                  <tr key={x.id} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2 text-left font-normal text-fg">{t(`tramos.${x.id}`)}</th>
                    <td className="py-2 text-right tabular-nums text-fg">{formatear(x.entradas)}</td>
                    <td className="py-2 text-right tabular-nums text-fg">{formatear(x.salidas)}</td>
                    <td className={`py-2 text-right font-medium tabular-nums ${x.saldoFinal < 0 ? 'text-danger-text' : 'text-fg'}`}>{formatear(x.saldoFinal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      {estado === 'listo' && !proyeccion && <AvisoTonal tono="informacion" titulo={t('proyeccion.error')} compacto />}

      {estado === 'listo' && barras.length > 0 && (
        <Tarjeta titulo={t('porCuenta.titulo')} descripcion={t('porCuenta.descripcion', { moneda: code })}>
          <GraficaPorCuenta cuentas={barras} formatear={formatear} locale={locale} titulo={t('porCuenta.titulo')} />
        </Tarjeta>
      )}

      <DataTable<PosicionCuenta>
        etiqueta={t('cuentasTitulo')}
        columnas={columnas}
        filas={posicion?.accounts ?? []}
        obtenerId={(a) => String(a.bankAccountId)}
        estado={estado}
        onReintentar={() => void cargar()}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
        tarjetaMovil={(a) => (
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{a.accountName}</p>
              <p className="truncate text-xs text-fg-secondary">{a.bankName}</p>
            </div>
            <span className="font-semibold tabular-nums text-fg">{formatEn(a.currency, a.localBalance)}</span>
          </div>
        )}
      />

      {estado === 'listo' && (
        <div>
          <Tarjeta titulo={t('alertas.titulo')} icono={AlertTriangle}>
            {alertas === null ? (
              <p className="text-sm text-fg-secondary">{t('alertas.error')}</p>
            ) : alertas.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('alertas.vacia')}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {alertas.map((a) => (
                  <li key={a.id} className="flex items-start gap-2">
                    <StatusBadge estado={a.severity} etiqueta={t(`alertas.severidad.${a.severity}`)} tono={TONO_SEVERIDAD[a.severity]} />
                    <span className="min-w-0 flex-1 text-fg">
                      {t.has(`alertas.tipos.${a.type}`) ? `${t(`alertas.tipos.${a.type}`)}: ` : ''}
                      {a.message}
                      {a.amount !== undefined ? ` · ${formatear(a.amount)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      )}

      {estado === 'listo' && (
        <DataTable<Concentracion>
          etiqueta={t('concentracion.titulo')}
          columnas={columnasConc}
          filas={concentracion ?? []}
          obtenerId={(c) => String(c.supplierId)}
          estado={concentracion === null ? 'error' : 'listo'}
          onReintentar={() => void cargar()}
          vacio={{ titulo: t('concentracion.vacia'), descripcion: t('concentracion.titulo'), compacto: true }}
        />
      )}
    </div>
  );
}
