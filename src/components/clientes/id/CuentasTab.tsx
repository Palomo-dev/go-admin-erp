'use client';

/**
 * Pestaña «Finanzas» de la ficha del cliente (antes «Cuentas por cobrar»;
 * Figma 06 Clientes 331:115207):
 *
 * - KPIs: Deuda total (facturas + folios), Folios pendientes y Facturas por
 *   cobrar con las vencidas en rojo.
 * - Barra: Registrar pago · Enviar recordatorio · Estado de cuenta (PDF) y la
 *   moneda de la cartera.
 * - Una lista con las facturas por cobrar, los folios de reservas con saldo y
 *   las demás cuentas por cobrar, cada fila con «Ver» y su cobro.
 *
 * La cartera llega de `useCarteraFicha` (`GET /api/cartera`, organización de
 * la sesión); el cobro es el diálogo único `RegistrarPagoConectado` y el
 * recordatorio, `POST /api/cartera/[id]/recordatorio`. Aquí no se escribe nada.
 * Los folios del PMS se leen como antes (reservas del cliente → folios con saldo).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BedDouble, Bell, ChevronRight, FileText, HandCoins, Receipt, TriangleAlert, WalletCards } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { ConfirmDialog, EmptyState, Pagination, StatCard, StatusBadge, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { enviarRecordatorio } from '@/lib/finanzas/cartera/clienteCartera';
import type { FilaCartera } from '@/lib/finanzas/cartera/listadoCartera';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { cn } from '@/utils/Utils';
import { useFechasFicha } from './useFechasFicha';
import type { CarteraFicha } from './useCarteraFicha';

interface FolioPendiente {
  id: string;
  reservation_id: string;
  balance: number;
  items_pendientes: number;
  items_total: number;
  checkin?: string;
  checkout?: string;
  space_label?: string;
}

interface ReservaConEspacios {
  id: string;
  checkin?: string;
  checkout?: string;
  reservation_spaces?: { spaces?: { label?: string } | null }[] | null;
}

interface FolioCrudo {
  id: string;
  reservation_id: string;
  balance: number | string | null;
  status: string;
}

interface ItemFolio {
  id: string;
  folio_id: string;
  payment_status: string;
}

interface CuentasTabProps {
  clienteId: string;
  organizationId: number;
  cartera: Pick<CarteraFicha, 'estado' | 'resumen' | 'filas' | 'puedeCobrar' | 'permisosCargando' | 'recargar'>;
  /** Motivo por el que no se puede cobrar (traducido) o `null`. */
  motivoPago: string | null;
  onRegistrarPago: () => void;
  onEstadoCuenta: () => void;
  motivoEstadoCuenta: string | null;
}

type Fila = { tipo: 'factura' | 'cuenta'; cuenta: FilaCartera } | { tipo: 'folio'; folio: FolioPendiente };

const DIA_MES: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const DIA_MES_ANIO: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
const TAMANOS = [10, 25, 50] as const;

export default function CuentasTab({ clienteId, organizationId, cartera, motivoPago, onRegistrarPago, onEstadoCuenta, motivoEstadoCuenta }: CuentasTabProps) {
  const t = useTranslations('clientes.ficha');
  // Folios y cartera sin moneda propia: la base de la organización.
  const { formatear, code: monedaBase } = useMonedaOrganizacion();
  const { instante, plana } = useFechasFicha();
  const [folios, setFolios] = useState<FolioPendiente[]>([]);
  const [cargandoFolios, setCargandoFolios] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState<number>(25);
  const [cobrarId, setCobrarId] = useState<string | null>(null);
  const [recordar, setRecordar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Folios del PMS con saldo: reservas del cliente → folios → ítems pendientes.
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setCargandoFolios(true);
      try {
        const { data: reservationsData } = await supabase
          .from('reservations')
          .select('id, checkin, checkout, reservation_spaces ( spaces ( label ) )')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId);
        const reservas = (reservationsData ?? []) as unknown as ReservaConEspacios[];
        if (reservas.length === 0) {
          if (!cancelado) setFolios([]);
          return;
        }
        const { data: foliosData } = await supabase
          .from('folios')
          .select('id, reservation_id, balance, status')
          .in(
            'reservation_id',
            reservas.map((r) => r.id),
          )
          .order('created_at', { ascending: false });
        const conSaldo = ((foliosData ?? []) as FolioCrudo[]).filter((f) => Number(f.balance) > 0);
        if (conSaldo.length === 0) {
          if (!cancelado) setFolios([]);
          return;
        }
        const { data: itemsData } = await supabase
          .from('folio_items')
          .select('id, folio_id, payment_status')
          .in(
            'folio_id',
            conSaldo.map((f) => f.id),
          );
        const porFolio = new Map<string, ItemFolio[]>();
        for (const item of (itemsData ?? []) as ItemFolio[]) porFolio.set(item.folio_id, [...(porFolio.get(item.folio_id) ?? []), item]);
        const reservaDe = new Map(reservas.map((r) => [r.id, r]));
        const lista = conSaldo.map((f) => {
          const items = porFolio.get(f.id) ?? [];
          const reserva = reservaDe.get(f.reservation_id);
          return {
            id: f.id,
            reservation_id: f.reservation_id,
            balance: Number(f.balance),
            items_pendientes: items.filter((i) => i.payment_status === 'pending').length,
            items_total: items.length,
            checkin: reserva?.checkin,
            checkout: reserva?.checkout,
            space_label: reserva?.reservation_spaces?.[0]?.spaces?.label,
          };
        });
        if (!cancelado) setFolios(lista);
      } catch (err) {
        console.error('Error al cargar folios:', err);
        if (!cancelado) setFolios([]);
      } finally {
        if (!cancelado) setCargandoFolios(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clienteId, organizationId]);

  const facturas = useMemo(() => cartera.filas.filter((f) => f.origen === 'factura'), [cartera.filas]);
  const otras = useMemo(() => cartera.filas.filter((f) => f.origen !== 'factura'), [cartera.filas]);
  const filas: Fila[] = useMemo(
    () => [
      ...facturas.map((cuenta) => ({ tipo: 'factura' as const, cuenta })),
      ...folios.map((folio) => ({ tipo: 'folio' as const, folio })),
      ...otras.map((cuenta) => ({ tipo: 'cuenta' as const, cuenta })),
    ],
    [facturas, folios, otras],
  );
  useEffect(() => setPagina(1), [filas.length, tamano]);

  const carteraLista = cartera.estado === 'listo';
  const porCobrar = cartera.resumen?.por_cobrar ?? 0;
  const vencidas = cartera.filas.filter((f) => f.dias > 0);
  const diasMax = vencidas.reduce((m, f) => Math.max(m, f.dias), 0);
  const totalFolios = folios.reduce((s, f) => s + f.balance, 0);
  const itemsFolios = folios.reduce((s, f) => s + f.items_pendientes, 0);
  const deuda = porCobrar + totalFolios;
  const puedeCobrarFila = cartera.puedeCobrar && !cartera.permisosCargando;
  const monedas = cartera.resumen?.monedas?.length ? cartera.resumen.monedas : [monedaBase];
  const motivoRecordatorio = !puedeCobrarFila ? t('motivos.sinPermisoCobro') : vencidas.length === 0 ? t('finanzas.sinVencidas') : null;

  const cargandoTodo = cartera.estado === 'cargando' || cargandoFolios;
  const visibles = filas.slice((pagina - 1) * tamano, pagina * tamano);

  const enviarRecordatorios = async () => {
    setEnviando(true);
    let enviados = 0;
    try {
      for (const f of vencidas) {
        const r = await enviarRecordatorio(f.id, { canal: 'correo', origen: 'finanzas' });
        if (r.enviado) enviados += 1;
      }
      if (enviados > 0) toastSuccess(t('finanzas.recordatorioEnviado', { count: enviados }));
      else toastError(t('finanzas.recordatorioSinEnviar'));
      setRecordar(false);
      cartera.recargar();
    } catch {
      toastError(enviados > 0 ? t('finanzas.recordatorioParcial', { count: enviados }) : t('finanzas.recordatorioSinEnviar'));
    } finally {
      setEnviando(false);
    }
  };

  const botonDeshabilitado = (motivo: string | null, contenido: React.ReactNode, onClick: () => void, variante: 'primario' | 'secundario', id: string) => (
    <>
      <button
        type="button"
        disabled={!!motivo}
        onClick={onClick}
        title={motivo ?? undefined}
        aria-describedby={motivo ? id : undefined}
        className={clasesBoton({ variante, tamano: 'sm' })}
      >
        {contenido}
      </button>
      {motivo && (
        <span id={id} className="sr-only">
          {motivo}
        </span>
      )}
    </>
  );

  const estadoCuenta = (f: FilaCartera) =>
    f.dias > 0 ? <StatusBadge estado="overdue" etiqueta={t('finanzas.vencidaDias', { dias: f.dias })} /> : <StatusBadge estado={f.estado} />;

  const filaCuenta = (f: FilaCartera, tipo: 'factura' | 'cuenta') => (
    <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3 sm:flex-nowrap">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
        {tipo === 'factura' ? <Receipt className="size-4" strokeWidth={1.5} /> : <WalletCards className="size-4" strokeWidth={1.5} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium leading-5 text-fg">
          {tipo === 'factura'
            ? t('finanzas.factura', { numero: f.numero ?? '' })
            : f.numero
              ? t('finanzas.cuentaNumero', { numero: f.numero })
              : t('finanzas.cuenta')}
        </p>
        <p className={cn('text-xs leading-4', f.dias > 0 ? 'text-danger-text' : 'text-fg-muted')}>
          {f.vencimiento ? t('finanzas.vence', { fecha: instante(f.vencimiento, DIA_MES_ANIO) }) : t('finanzas.sinVencimiento')}
          {f.cuotas > 0 ? ` · ${t('finanzas.cuotas', { pendientes: f.cuotas_pendientes, count: f.cuotas })}` : ''}
        </p>
      </div>
      {estadoCuenta(f)}
      <div className="flex min-w-[104px] flex-col items-end">
        <span className={cn('text-sm font-medium tabular-nums', f.dias > 0 ? 'text-danger-text' : 'text-fg')}>{formatear(f.saldo)}</span>
        {f.monto > f.saldo && <span className="text-xs text-fg-muted tabular-nums">{t('finanzas.deMonto', { monto: formatear(f.monto) })}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link href={`/app/finanzas/cuentas-por-cobrar/${encodeURIComponent(f.id)}`} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          {t('finanzas.ver')}
        </Link>
        {puedeCobrarFila && f.saldo > 0 && (
          <button type="button" onClick={() => setCobrarId(f.id)} className={clasesBoton({ tamano: 'sm' })}>
            {t('pagina.registrarPago')}
          </button>
        )}
      </div>
    </li>
  );

  const filaFolio = (f: FolioPendiente) => (
    <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3 sm:flex-nowrap">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
        <BedDouble className="size-4" strokeWidth={1.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium leading-5 text-fg">{t('finanzas.folio')}</p>
        <p className="text-xs leading-4 text-fg-muted">
          {[
            f.space_label,
            f.checkin && f.checkout ? `${plana(f.checkin, DIA_MES)} → ${plana(f.checkout, DIA_MES)}` : null,
            t('cuentas.itemsPendientes', { pendientes: f.items_pendientes, count: f.items_total }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <Badge tono="informacion" apariencia="contorno" tamano="sm">
        {t('cuentas.folioAbierto')}
      </Badge>
      <div className="flex min-w-[104px] flex-col items-end">
        <span className="text-sm font-medium tabular-nums text-fg">{formatear(f.balance)}</span>
        <span className="text-xs text-fg-muted">{t('finanzas.items', { count: f.items_total })}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link href={`/app/pms/reservas/${encodeURIComponent(f.reservation_id)}`} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          {t('finanzas.ver')}
        </Link>
        <Link href={`/app/pms/folios?reservation=${encodeURIComponent(f.reservation_id)}`} className={clasesBoton({ tamano: 'sm' })}>
          {t('finanzas.pagar')}
        </Link>
      </div>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <section aria-label={t('finanzas.kpisAria')} className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <StatCard
          etiqueta={t('finanzas.deudaTotal')}
          valor={carteraLista ? formatear(deuda) : cartera.estado === 'cargando' ? '' : formatear(totalFolios)}
          detalle={deuda > 0 ? t('finanzas.facturasMasFolios') : t('finanzas.sinDeuda')}
          tono={deuda > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={deuda > 0 ? TriangleAlert : undefined}
          cargando={cargandoTodo}
          tamano="sm"
        />
        <StatCard
          etiqueta={t('finanzas.foliosPendientes')}
          valor={formatear(totalFolios)}
          detalle={folios.length > 0 ? t('finanzas.foliosDetalle', { items: itemsFolios, count: folios.length }) : t('finanzas.sinFolios')}
          cargando={cargandoFolios}
          tamano="sm"
        />
        <StatCard
          etiqueta={t('finanzas.facturasPorCobrar')}
          valor={carteraLista ? formatear(porCobrar) : '—'}
          detalle={
            cartera.estado === 'sinPermiso'
              ? t('resumen.carteraSinPermiso')
              : cartera.estado === 'error'
                ? t('resumen.carteraError')
                : vencidas.length > 0
                  ? t('finanzas.vencidasDetalle', { count: vencidas.length, dias: diasMax })
                  : t('finanzas.alDia')
          }
          tono={vencidas.length > 0 ? 'peligro' : 'neutro'}
          tendencia={vencidas.length > 0 ? 'baja' : undefined}
          cargando={cartera.estado === 'cargando'}
          tamano="sm"
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {botonDeshabilitado(
          motivoPago,
          <>
            <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('pagina.registrarPago')}
          </>,
          onRegistrarPago,
          'primario',
          'motivo-finanzas-pago',
        )}
        {botonDeshabilitado(
          motivoRecordatorio,
          <>
            <Bell aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('finanzas.enviarRecordatorio')}
          </>,
          () => setRecordar(true),
          'secundario',
          'motivo-finanzas-recordatorio',
        )}
        {botonDeshabilitado(
          motivoEstadoCuenta,
          <>
            <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('finanzas.estadoCuenta')}
          </>,
          onEstadoCuenta,
          'secundario',
          'motivo-finanzas-estado',
        )}
        <span className="flex-1" />
        <Badge tono="neutro" apariencia="contorno" tamano="md" className="bg-surface">
          {t('finanzas.moneda', { codigo: monedas.join(' · ') })}
        </Badge>
      </div>

      <section aria-labelledby="finanzas-lista" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <h3 id="finanzas-lista" className="text-[13px] font-semibold leading-[19px] text-fg">
          {t('finanzas.listaTitulo', { facturas: facturas.length, folios: folios.length, cuentas: otras.length })}
        </h3>

        {cartera.estado === 'sinPermiso' && (
          <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-xs text-fg-secondary">{t('finanzas.sinPermiso')}</p>
        )}
        {cartera.estado === 'error' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-xs text-danger-text">
            <span className="flex-1">{t('cuentas.errorCarga')}</span>
            <button type="button" onClick={cartera.recargar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {t('finanzas.reintentar')}
            </button>
          </div>
        )}

        {cargandoTodo ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : filas.length === 0 ? (
          <EmptyState compacto icono={WalletCards} titulo={t('cuentas.vacioTitulo')} descripcion={t('cuentas.vacioDescripcion')} />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {visibles.map((f) => (f.tipo === 'folio' ? filaFolio(f.folio) : filaCuenta(f.cuenta, f.tipo)))}
            </ul>
            {filas.length > TAMANOS[0] && (
              <Pagination
                pagina={pagina}
                tamano={tamano}
                total={filas.length}
                onPaginaChange={setPagina}
                onTamanoChange={setTamano}
                opcionesTamano={TAMANOS}
                sustantivo={{ singular: t('finanzas.sustantivo.singular'), plural: t('finanzas.sustantivo.plural') }}
              />
            )}
          </>
        )}
        {carteraLista && cartera.filas.length > 0 && (
          <Link
            href={`/app/finanzas/cuentas-por-cobrar/cliente/${encodeURIComponent(clienteId)}`}
            className="inline-flex items-center gap-1 self-start rounded text-xs font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('finanzas.verCartera')}
            <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
          </Link>
        )}
      </section>

      {cobrarId && (
        <RegistrarPagoConectado
          abierto={cobrarId !== null}
          onAbiertoChange={(v) => !v && setCobrarId(null)}
          destino={{ tipo: 'cuenta', id: cobrarId }}
          origen="ficha_cliente"
          onRegistrado={() => cartera.recargar()}
        />
      )}

      <ConfirmDialog
        abierto={recordar}
        onAbiertoChange={(v) => !enviando && setRecordar(v)}
        titulo={t('finanzas.recordatorioTitulo')}
        descripcion={t('finanzas.recordatorioDescripcion', { count: vencidas.length })}
        textoConfirmar={t('finanzas.enviarRecordatorio')}
        onConfirmar={enviarRecordatorios}
        tono="marca"
        icono={Bell}
        cargando={enviando}
      />
    </div>
  );
}
