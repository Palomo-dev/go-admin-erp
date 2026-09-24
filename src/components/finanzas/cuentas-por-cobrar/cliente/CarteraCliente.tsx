'use client';

/**
 * Cartera del cliente (Figma X2 `740:51004`, X2b pago a varias con sobrante
 * `740:52151`, X4 sin resultados `740:52424`): saldo total, vencido, saldo a
 * favor y antigüedad del cliente; sus cuentas abiertas; «Registrar pago» con el
 * diálogo único en destino «tercero» (reparto de la más antigua a la más nueva
 * y sobrante a saldo a favor solo con casilla) y el estado de cuenta.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CircleDollarSign, FileText, PiggyBank, User, WalletCards } from 'lucide-react';
import { DataTable, EmptyState, KpiStrip, ListCard, PageHeader, StatCard, StatusBadge, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import type { FilaCartera, RespuestaListadoCartera } from '@/lib/finanzas/cartera/listadoCartera';
import { pedirListadoCartera } from '@/lib/finanzas/cartera/clienteCartera';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { BandaAntiguedad } from '@/components/finanzas/cartera/BandaAntiguedad';
import { EstadoCuentaDialog } from '@/components/finanzas/cartera/EstadoCuentaDialog';
import { rutasCartera } from '../listado/ListadoCartera';

interface Cabecera {
  cliente: { id: string; nombre: string | null; documento: string | null; email: string | null; telefono: string | null };
  saldoAFavor: number;
}

export function CarteraCliente({ customerId, origen }: { customerId: string; origen: 'finanzas' | 'pos' }) {
  const t = useTranslations('cartera');
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const { formatDate, getToday } = useFormatDate();
  const rutas = rutasCartera(origen);
  const enPos = origen === 'pos';
  const puedeCobrar = enPos ? permisos.posCrear || permisos.crear : permisos.crear;

  const [cabecera, setCabecera] = useState<Cabecera | null>(null);
  const [datos, setDatos] = useState<RespuestaListadoCartera | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pagar, setPagar] = useState(false);
  const [estadoCuenta, setEstadoCuenta] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const org = getOrganizationId();
      const q = new URLSearchParams({ cliente: customerId, estado: 'abiertas', tamano: '200', orden: 'vencimiento_asc' });
      if (enPos) q.set('origen', 'pos');
      const [cab, lista] = await Promise.all([
        fetch(`/api/clientes/${encodeURIComponent(customerId)}/cartera${enPos ? '?origen=pos' : ''}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: org > 0 ? { 'x-organization-id': String(org) } : undefined,
        }).then(async (r) => {
          const c = await r.json();
          if (!r.ok) throw Object.assign(new Error('cabecera'), { codigo: (c as { codigo?: string }).codigo ?? 'error_desconocido' });
          return c as Cabecera;
        }),
        pedirListadoCartera(q),
      ]);
      setCabecera(cab);
      setDatos(lista);
    } catch (e) {
      setError((e as { codigo?: string }).codigo ?? 'error_desconocido');
    } finally {
      setCargando(false);
    }
  }, [customerId, enPos]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = datos?.resumen;
  const monedaResumen = resumen?.monedas.length === 1 ? resumen.monedas[0] : moneda.code;
  const fmt = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(monedaResumen)), [moneda, monedaResumen]);
  const filas = datos?.filas ?? [];

  if (error === 'cliente_no_encontrado') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="empty" titulo={t('cliente.noEncontrado')} accion={{ etiqueta: t('detalle.volver'), href: rutas.base }} />
      </div>
    );
  }

  const columnas: ColumnaTabla<FilaCartera>[] = [
    { id: 'documento', encabezado: t('listado.columnas.documento'), celda: (f) => <span className="tabular-nums">{f.numero ?? t(`listado.origen.${f.origen}`)}</span> },
    {
      id: 'vencimiento',
      encabezado: t('listado.columnas.vencimiento'),
      celda: (f) => <span className={f.dias > 0 ? 'text-danger-text' : undefined}>{formatDate(f.vencimiento)}</span>,
    },
    { id: 'monto', encabezado: t('listado.columnas.monto'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => fmt(f.monto) },
    { id: 'saldo', encabezado: t('listado.columnas.saldo'), variante: 'importe', celda: (f) => <span className="font-medium">{fmt(f.saldo)}</span> },
    {
      id: 'estado',
      encabezado: t('listado.columnas.estado'),
      celda: (f) => (f.dias > 0 ? <StatusBadge estado="overdue" etiqueta={t('estados.vencidaDias', { dias: f.dias })} /> : <StatusBadge estado={f.estado} />),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={cabecera?.cliente.nombre ?? t('cliente.titulo')}
        subtitulo={cabecera ? [t('cliente.titulo'), cabecera.cliente.documento].filter(Boolean).join(' · ') : undefined}
        icono={User}
        variante="detail"
        volverA={rutas.base}
        cargando={cargando}
        migas={
          enPos
            ? [{ etiqueta: t('migas.pos'), href: '/app/pos' }, { etiqueta: t('titulo'), href: rutas.base }, { etiqueta: t('cliente.titulo') }]
            : [{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo'), href: rutas.base }, { etiqueta: t('cliente.titulo') }]
        }
        acciones={
          cabecera ? (
            <>
              <button type="button" onClick={() => setEstadoCuenta(true)} className={clasesBoton({ variante: 'secundario' })}>
                <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('detalle.estadoCuenta')}
              </button>
              {puedeCobrar && filas.length > 0 && (
                <button type="button" onClick={() => setPagar(true)} className={clasesBoton({ variante: 'primario' })}>
                  <CircleDollarSign aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('detalle.registrarPago')}
                </button>
              )}
            </>
          ) : null
        }
      />

      <KpiStrip etiqueta={t('cliente.kpis')}>
        <StatCard etiqueta={t('cliente.saldoTotal')} icono={WalletCards} cargando={!datos} valor={fmt(resumen?.por_cobrar ?? 0)} />
        <StatCard
          etiqueta={t('listado.kpis.vencida')}
          icono={AlertTriangle}
          cargando={!datos}
          valor={fmt(resumen?.vencida ?? 0)}
          tono={resumen && resumen.vencida > 0 ? 'peligro' : 'neutro'}
        />
        <StatCard etiqueta={t('cliente.saldoAFavor')} icono={PiggyBank} cargando={!cabecera} valor={fmt(cabecera?.saldoAFavor ?? 0)} tono={cabecera && cabecera.saldoAFavor > 0 ? 'exito' : 'neutro'} />
        <StatCard
          etiqueta={t('cliente.pagaEnPromedio')}
          cargando={!datos}
          valor={resumen?.promedio_cobro_dias != null ? t('listado.kpis.dias', { dias: Math.round(resumen.promedio_cobro_dias) }) : '—'}
        />
      </KpiStrip>

      <BandaAntiguedad tramos={resumen?.tramos ?? []} formatear={fmt} cargando={!datos} />

      <DataTable
        etiqueta={t('cliente.cuentasAbiertas')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? 'vacio' : 'listo'}
        onFilaClick={(f) => router.push(rutas.detalle(f.id))}
        etiquetaFila={(f) => f.numero ?? f.id}
        tonoFila={(f) => (f.dias > 0 ? 'peligro' : undefined)}
        tarjetaMovil={(f) => (
          <ListCard
            icono={WalletCards}
            titulo={f.numero ?? t(`listado.origen.${f.origen}`)}
            meta={<span className={f.dias > 0 ? 'text-danger-text' : undefined}>{t('listado.venceEl', { fecha: formatDate(f.vencimiento) })}</span>}
            valor={fmt(f.saldo)}
            onClick={() => router.push(rutas.detalle(f.id))}
          />
        )}
        vacio={{ titulo: t('cliente.sinCuentas'), descripcion: t('cliente.sinCuentasDescripcion'), icono: WalletCards }}
        error={{ titulo: t('listado.errorCarga') }}
        onReintentar={() => void cargar()}
      />

      {pagar && (
        <RegistrarPagoConectado
          abierto={pagar}
          onAbiertoChange={setPagar}
          destino={{ tipo: 'tercero', customerId }}
          origen={enPos ? 'pos_cxc' : 'ficha_cliente'}
          onRegistrado={() => void cargar()}
        />
      )}
      {cabecera && (
        <EstadoCuentaDialog
          abierto={estadoCuenta}
          onAbiertoChange={setEstadoCuenta}
          clienteId={customerId}
          clienteNombre={cabecera.cliente.nombre}
          correo={cabecera.cliente.email}
          hoy={getToday()}
          origen={origen}
        />
      )}
    </div>
  );
}
