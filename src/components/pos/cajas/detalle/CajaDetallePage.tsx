'use client';

/**
 * /app/pos/cajas/[id] — detalle de una sesión de caja (Figma `355:53496`,
 * «CD-Resumen», «CD-Movs», «CD-Arq», «CD-Ventas», «CD-Ciego»; paso 10 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md).
 *
 * - Todo sale de UNA lectura del servidor (`GET /api/pos/cajas/[id]/resumen`):
 *   esperado de `pos_caja_esperado`, movimientos, arqueos con su conteo por
 *   método, ventas del turno y permisos. Con cierre ciego y sin permiso el
 *   servidor no manda el esperado ni las diferencias: aquí se ve «Oculto».
 * - «Pagos por método» sale de `por_metodo` del servidor (antes, en una caja
 *   global, salía vacío por el filtro `branch_id = null`).
 * - Un solo «Cerrar caja», condicionado a `puedeCerrarCaja` con el permiso del
 *   servidor (antes se ofrecía a cualquiera y lo negaba la ruta).
 * - «Reabrir» no existe (D7): el cierre ya generó su asiento.
 * - Reporte de cierre en PDF (carta) o ticket de 80 mm por el motor único de
 *   documentos (`/api/documentos/cierre-caja/[id]`).
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Banknote, Download, EyeOff, FileText, ListChecks, Lock, Plus, Printer, RefreshCw } from 'lucide-react';
import { EmptyState, PageHeader, RowActionsMenu, StatusBadge, TabBar, idPanel, idPestana, type AccionFila } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { abrirDocumento, descargarDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { toast } from 'sonner';
import { CierreCajaDialog } from '../CierreCajaDialog';
import { useFechaHoraCaja, useMensajeErrorCaja, useMonedaCaja } from '../comunesCaja';
import { SucursalCaja } from '../listado/comunes';
import { useResumenCaja } from '../useResumenCaja';
import type { CashSession } from '../types';
import {
  KpisCaja,
  TablaArqueos,
  TablaMovimientos,
  TablaVentasTurno,
  TarjetaDesglose,
  TarjetaInfoSesion,
  TarjetaPagosPorMetodo,
} from './seccionesCaja';

interface CajaDetallePageProps {
  sessionUuid: string;
}

type Pestana = 'resumen' | 'movimientos' | 'arqueos' | 'ventas';
const ID_TABS = 'caja-detalle';

export function CajaDetallePage({ sessionUuid }: CajaDetallePageProps) {
  const t = useTranslations('cajas.ficha');
  const router = useRouter();
  const { formatear } = useMonedaCaja();
  const fechaHora = useFechaHoraCaja();
  const mensajeError = useMensajeErrorCaja();
  const { resumen, cargando, error, recargar } = useResumenCaja(sessionUuid);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [cerrarAbierto, setCerrarAbierto] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  const actualizar = async () => {
    setRefrescando(true);
    await recargar();
    setRefrescando(false);
  };

  const sesionParaCierre: CashSession | null = useMemo(() => {
    if (!resumen) return null;
    const s = resumen.sesion;
    return {
      id: s.id,
      uuid: s.uuid,
      organization_id: s.organization_id,
      branch_id: s.branch_id,
      opened_by: s.opened_by,
      opened_at: s.opened_at,
      initial_amount: s.initial_amount,
      status: s.status,
      notes: s.notes ?? undefined,
      created_at: s.opened_at,
      updated_at: s.opened_at,
      opened_by_name: s.opened_by_name ?? undefined,
      branch_name: s.branch_name ?? undefined,
    };
  }, [resumen]);

  const migas = [
    { etiqueta: t('migaPos'), href: '/app/pos' },
    { etiqueta: t('migaCajas'), href: '/app/pos/cajas' },
    { etiqueta: resumen ? t('sesion', { id: resumen.sesion.id }) : '…' },
  ];

  if (cargando && !resumen) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6" aria-busy="true">
        <PageHeader titulo={t('cargando')} variante="detail" migas={migas} icono={Banknote} cargando />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !resumen) {
    const noExiste = error === 'caja_no_encontrada' || error === 'caja_invalida';
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <PageHeader titulo={noExiste ? t('noExisteTitulo') : t('errorTitulo')} variante="detail" migas={migas} icono={Banknote} />
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante={noExiste ? 'empty' : 'error'}
            titulo={noExiste ? t('noExisteTitulo') : t('errorTitulo')}
            descripcion={noExiste ? t('noExisteDescripcion') : mensajeError(error)}
            onReintentar={noExiste ? undefined : () => void recargar()}
            accion={noExiste ? { etiqueta: t('volverCajas'), href: '/app/pos/cajas' } : undefined}
          />
        </div>
      </div>
    );
  }

  const s = resumen.sesion;
  const abierta = s.status === 'open';
  const base = `/app/pos/cajas/${s.uuid}`;

  const reporte = async (formato: 'pdf' | 'descargar' | 'ticket') => {
    try {
      if (formato === 'pdf') abrirDocumento('cierre-caja', s.id);
      else if (formato === 'ticket') imprimirDocumento('cierre-caja', s.id, { papel: '80mm' });
      else await descargarDocumento('cierre-caja', s.id);
    } catch (e) {
      toast.error(t('reporteError'), { description: (e as Error)?.message });
    }
  };

  const accionesReporte: AccionFila[] = [
    { id: 'pdf', etiqueta: t('reporteCarta'), descripcion: t('reporteCartaAyuda'), icono: FileText, onSelect: () => void reporte('pdf') },
    { id: 'descargar', etiqueta: t('reporteDescargar'), icono: Download, onSelect: () => void reporte('descargar') },
    { id: 'ticket', etiqueta: t('reporteTicket'), descripcion: t('reporteTicketAyuda'), icono: Printer, onSelect: () => void reporte('ticket') },
  ];

  const masAcciones: AccionFila[] = [
    { id: 'arqueo', etiqueta: t('nuevoArqueo'), icono: ListChecks, onSelect: () => router.push(`${base}/arqueos/nuevo`), oculta: !abierta },
    { id: 'movimiento', etiqueta: t('nuevoMovimiento'), icono: Plus, onSelect: () => router.push(`${base}/movimientos/nuevo`), oculta: !abierta },
    { id: 'historial', etiqueta: t('volverCajas'), icono: Banknote, onSelect: () => router.push('/app/pos/cajas?tab=historial'), separadorAntes: abierta },
  ];

  const subtitulo = abierta
    ? t('subtituloAbierta', { apertura: fechaHora(s.opened_at) })
    : t('subtituloCerrada', { apertura: fechaHora(s.opened_at), cierre: fechaHora(s.closed_at) });

  const pestanas = [
    { valor: 'resumen' as const, etiqueta: t('pestanas.resumen') },
    { valor: 'movimientos' as const, etiqueta: t('pestanas.movimientos'), contador: resumen.movimientos.length },
    { valor: 'arqueos' as const, etiqueta: t('pestanas.arqueos'), contador: resumen.arqueos.length },
    { valor: 'ventas' as const, etiqueta: t('pestanas.ventas'), contador: resumen.ventas.cantidad },
  ];

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo={t('sesion', { id: s.id })}
        subtitulo={subtitulo}
        icono={Banknote}
        variante="detail"
        migas={migas}
        cargando={refrescando}
        badge={<StatusBadge estado={abierta ? 'open' : 'closed'} etiqueta={abierta ? t('abierta') : t('cerrada')} />}
        acciones={
          <>
            <Button variant="outline" className="h-10 gap-2" onClick={() => void actualizar()} disabled={refrescando}>
              <RefreshCw aria-hidden="true" className={refrescando ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
              <span className="hidden xl:inline">{t('actualizar')}</span>
            </Button>
            <RowActionsMenu etiquetaBoton={t('reporte')} iconoBoton={FileText} acciones={accionesReporte} tamano="md" />
            {abierta && resumen.permisos.puedeCerrar && (
              <Button className="h-10 gap-2" onClick={() => setCerrarAbierto(true)}>
                <Lock aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('cerrarCaja')}
              </Button>
            )}
            <RowActionsMenu orientacion="horizontal" tamano="md" acciones={masAcciones} />
          </>
        }
        movil={{
          accion:
            abierta && resumen.permisos.puedeCerrar ? (
              <button
                type="button"
                onClick={() => setCerrarAbierto(true)}
                aria-label={t('cerrarCaja')}
                className="flex size-10 items-center justify-center rounded-lg text-brand"
              >
                <Lock className="size-5" strokeWidth={1.5} />
              </button>
            ) : undefined,
        }}
        debajo={
          <>
            <SucursalCaja sesion={{ branch_id: s.branch_id, branch_name: s.branch_name ?? undefined }} />
            <span className="text-xs text-fg-secondary">{t('abrio', { nombre: s.opened_by_name || '—' })}</span>
            {s.closed_by_name && <span className="text-xs text-fg-secondary">· {t('cerro', { nombre: s.closed_by_name })}</span>}
          </>
        }
      />

      {abierta && !resumen.permisos.puedeCerrar && (
        <p role="note" className="rounded-lg border border-line bg-subtle px-3 py-2 text-sm text-fg-secondary">
          {s.opened_by_name ? t('soloCierraNombre', { nombre: s.opened_by_name }) : t('soloCierra')}
        </p>
      )}
      {!resumen.verImportes && (
        <p role="note" className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2 text-sm text-info-text">
          <EyeOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {t('avisoCierreCiego')}
        </p>
      )}

      <KpisCaja resumen={resumen} formatear={formatear} cargando={refrescando} />

      <TabBar id={ID_TABS} etiqueta={t('pestanas.etiqueta')} pestanas={pestanas} valor={pestana} onValorChange={setPestana} />

      <div role="tabpanel" id={idPanel(ID_TABS, pestana)} aria-labelledby={idPestana(ID_TABS, pestana)} className="min-w-0">
        {pestana === 'resumen' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <TarjetaInfoSesion resumen={resumen} />
            <TarjetaDesglose resumen={resumen} formatear={formatear} />
            <TarjetaPagosPorMetodo resumen={resumen} formatear={formatear} />
          </div>
        )}
        {pestana === 'movimientos' && (
          <div className="flex flex-col gap-3">
            {abierta && (
              <div className="flex justify-end">
                <Button variant="outline" className="h-10 gap-2" onClick={() => router.push(`${base}/movimientos/nuevo`)}>
                  <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('nuevoMovimiento')}
                </Button>
              </div>
            )}
            <TablaMovimientos movimientos={resumen.movimientos} formatear={formatear} />
          </div>
        )}
        {pestana === 'arqueos' && (
          <div className="flex flex-col gap-3">
            {abierta && (
              <div className="flex justify-end">
                <Button variant="outline" className="h-10 gap-2" onClick={() => router.push(`${base}/arqueos/nuevo`)}>
                  <ListChecks aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('nuevoArqueo')}
                </Button>
              </div>
            )}
            <TablaArqueos arqueos={resumen.arqueos} formatear={formatear} visible={resumen.verImportes} />
          </div>
        )}
        {pestana === 'ventas' && <TablaVentasTurno ventas={resumen.ventas.filas} formatear={formatear} truncadas={resumen.ventas.truncadas} />}
      </div>

      {abierta && sesionParaCierre && resumen.permisos.puedeCerrar && (
        <CierreCajaDialog
          session={sesionParaCierre}
          open={cerrarAbierto}
          onOpenChange={setCerrarAbierto}
          onSessionClosed={() => {
            setCerrarAbierto(false);
            void recargar();
          }}
        />
      )}
    </div>
  );
}
