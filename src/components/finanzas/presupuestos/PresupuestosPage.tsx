'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BarChart3, Copy, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { PageHeader } from '@/components/kit/PageHeader';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { cuentasDeMovimiento } from '@/components/finanzas/contabilidad/cuentas/CuentasAutomaticasService';
import {
  claveEstado,
  claveFila,
  construirGrilla,
  esEditable,
  permisoParaBorrar,
  tonoEstado,
  totalFila,
  totalGrilla,
  type FilaGrilla,
} from '@/lib/finanzas/presupuestos/presupuestoLogica';
import { BudgetService, ErrorPresupuesto, type Budget } from './BudgetService';
import { NuevoPresupuestoDialog } from './NuevoPresupuestoDialog';
import { RUTA_PRESUPUESTO_VS_REAL, rutaEditorPresupuesto } from './rutas';

/**
 * Presupuestos (Figma 82-19): lista a la izquierda y cuentas del elegido a la
 * derecha, con el total planeado del año por cuenta. Lo real y la diferencia
 * están en el informe «Presupuesto contra lo real» del centro de reportes:
 * aquí no se calculan.
 */
export function PresupuestosPage() {
  const t = useTranslations('finanzasReportesR2.presupuestos');
  const router = useRouter();
  const { formatear } = useMonedaOrganizacion();
  const permisos = usePermisosFinanzas();
  const [presupuestos, setPresupuestos] = useState<Budget[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaGrilla[]>([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const [dialogo, setDialogo] = useState<{ abierto: boolean; copiarDe: Budget | null }>({ abierto: false, copiarDe: null });
  const [borrar, setBorrar] = useState<Budget | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [aprobando, setAprobando] = useState(false);

  const elegido = useMemo(() => presupuestos.find((p) => p.id === elegidoId) ?? null, [presupuestos, elegidoId]);
  const estadoTexto = (estado: string) => t(`estado.${claveEstado(estado)}`);
  const mensajeError = (e: unknown) => {
    const codigo = e instanceof ErrorPresupuesto ? e.codigo : 'error';
    return t.has(`error.${codigo}`) ? t(`error.${codigo}`) : t('error.error');
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(false);
    try {
      const lista = await BudgetService.getAll();
      setPresupuestos(lista);
      setElegidoId((actual) => (actual && lista.some((p) => p.id === actual) ? actual : lista[0]?.id ?? null));
    } catch (e) {
      console.error('[presupuestos] no se pudieron cargar', e);
      setErrorCarga(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    cuentasDeMovimiento()
      .then((cuentas) => setNombres(new Map(cuentas.map((c) => [c.account_code, c.name]))))
      .catch(() => setNombres(new Map()));
  }, [cargar]);

  useEffect(() => {
    if (!elegidoId) {
      setFilas([]);
      return;
    }
    let vigente = true;
    setCargandoLineas(true);
    BudgetService.getLines(elegidoId)
      .then((lineas) => vigente && setFilas(construirGrilla(lineas)))
      .catch((e) => {
        console.error('[presupuestos] no se pudieron cargar las líneas', e);
        if (vigente) {
          setFilas([]);
          toast.error(t('error.cargarLineas'));
        }
      })
      .finally(() => vigente && setCargandoLineas(false));
    return () => {
      vigente = false;
    };
  }, [elegidoId, t]);

  const aprobar = async (p: Budget) => {
    setAprobando(true);
    try {
      await BudgetService.approve(p.id);
      toast.success(t('toast.aprobado'));
      await cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setAprobando(false);
    }
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    setBorrando(true);
    try {
      await BudgetService.delete(borrar.id);
      toast.success(t('toast.eliminado'));
      if (elegidoId === borrar.id) setElegidoId(null);
      setBorrar(null);
      await cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setBorrando(false);
    }
  };

  const puedeBorrar = (p: Budget) => (permisoParaBorrar(p.status) === 'finance.create' ? permisos.crear : permisos.aprobar);
  const anioInicial = (presupuestos[0]?.fiscal_year ?? new Date().getFullYear() - 1) + 1;

  const acciones = (
    <div className="flex items-center gap-2">
      <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setDialogo({ abierto: true, copiarDe: null })}>
        <Plus aria-hidden="true" className="size-4" />
        {t('nuevo')}
      </button>
      <RowActionsMenu
        orientacion="horizontal"
        tamano="md"
        titulo={t('titulo')}
        acciones={[{ id: 'informe', etiqueta: t('verInforme'), icono: BarChart3, onSelect: () => router.push(RUTA_PRESUPUESTO_VS_REAL) }]}
      />
    </div>
  );

  return (
    <div className="min-h-screen space-y-6 bg-canvas p-4 md:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ListChecks}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
          { etiqueta: t('migas.presupuestos') },
        ]}
        acciones={acciones}
        cargando={cargando}
        movil={{
          accion: (
            <button type="button" aria-label={t('nuevo')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setDialogo({ abierto: true, copiarDe: null })}>
              <Plus aria-hidden="true" className="size-5" />
            </button>
          ),
        }}
      />

      {cargando ? (
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : errorCarga ? (
        <EmptyState variante="error" descripcion={t('error.cargar')} onReintentar={() => void cargar()} />
      ) : presupuestos.length === 0 ? (
        <EmptyState
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          icono={ListChecks}
          accion={{ etiqueta: t('nuevo'), icono: Plus, onClick: () => setDialogo({ abierto: true, copiarDe: null }) }}
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <ul aria-label={t('lista.aria')} className="overflow-hidden rounded-xl border border-line bg-surface">
            {presupuestos.map((p) => (
              <li key={p.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  aria-current={p.id === elegidoId ? 'true' : undefined}
                  onClick={() => setElegidoId(p.id)}
                  className={cn(
                    'flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                    p.id === elegidoId && 'bg-subtle',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg">{p.name}</span>
                    <StatusBadge estado={p.status} etiqueta={estadoTexto(p.status)} tono={tonoEstado(p.status)} />
                  </span>
                  <span className="text-sm tabular-nums text-fg-secondary">
                    {t('lista.resumen', { anio: p.fiscal_year, total: formatear(p.total_amount) })}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {!elegido ? (
            <p className="rounded-xl border border-line bg-surface p-6 text-sm text-fg-secondary">{t('seleccione')}</p>
          ) : (
            <section className="flex min-w-0 flex-col gap-3" aria-labelledby="presupuesto-elegido">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="presupuesto-elegido" className="text-lg font-semibold text-fg">
                  {t('detalle.titulo', { nombre: elegido.name, estado: estadoTexto(elegido.status).toLocaleLowerCase() })}
                </h2>
                <div className="flex items-center gap-2">
                  <Link href={rutaEditorPresupuesto(elegido.id)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                    {esEditable(elegido.status) ? t('detalle.editar') : t('detalle.ver')}
                  </Link>
                  {esEditable(elegido.status) && (
                    <button
                      type="button"
                      className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
                      disabled={!permisos.aprobar || aprobando || filas.length === 0}
                      title={!permisos.aprobar ? t('aprobarSinPermiso') : filas.length === 0 ? t('detalle.sinLineas') : undefined}
                      onClick={() => void aprobar(elegido)}
                    >
                      {t('detalle.aprobar')}
                    </button>
                  )}
                  <RowActionsMenu
                    orientacion="horizontal"
                    titulo={elegido.name}
                    acciones={[
                      ...(esEditable(elegido.status)
                        ? [{ id: 'editar', etiqueta: t('detalle.editar'), icono: Pencil, onSelect: () => router.push(rutaEditorPresupuesto(elegido.id)) }]
                        : []),
                      {
                        id: 'copiar',
                        etiqueta: t('menu.copiar'),
                        icono: Copy,
                        onSelect: () => setDialogo({ abierto: true, copiarDe: elegido }),
                        deshabilitada: !permisos.crear,
                        motivo: permisos.crear ? undefined : t('nuevoDialogo.sinPermiso'),
                      },
                      {
                        id: 'eliminar',
                        etiqueta: t('menu.eliminar'),
                        icono: Trash2,
                        destructiva: true,
                        separadorAntes: true,
                        onSelect: () => setBorrar(elegido),
                        deshabilitada: !puedeBorrar(elegido),
                        motivo: puedeBorrar(elegido)
                          ? undefined
                          : esEditable(elegido.status)
                            ? t('eliminar.sinPermisoBorrador')
                            : t('eliminar.sinPermisoAprobado'),
                      },
                    ]}
                  />
                </div>
              </div>

              <TablaCuentas
                filas={filas}
                cargando={cargandoLineas}
                nombres={nombres}
                formatear={formatear}
                editable={esEditable(elegido.status)}
                rutaEditor={rutaEditorPresupuesto(elegido.id)}
              />

              <p className="text-sm text-fg-secondary">
                {t('detalle.nota')}{' '}
                <Link href={RUTA_PRESUPUESTO_VS_REAL} className="font-medium text-link hover:underline">
                  {t('detalle.abrirInforme')}
                </Link>
              </p>
            </section>
          )}
        </div>
      )}

      <NuevoPresupuestoDialog
        abierto={dialogo.abierto}
        onAbiertoChange={(abierto) => setDialogo((d) => ({ ...d, abierto }))}
        presupuestos={presupuestos}
        anioInicial={anioInicial}
        copiarDe={dialogo.copiarDe}
        puedeCrear={permisos.crear}
        onCreado={(p) => router.push(rutaEditorPresupuesto(p.id))}
      />

      <ConfirmDialog
        abierto={!!borrar}
        onAbiertoChange={(v) => !v && setBorrar(null)}
        titulo={t('eliminar.titulo', { nombre: borrar?.name ?? '' })}
        descripcion={borrar && esEditable(borrar.status) ? t('eliminar.descripcionBorrador') : t('eliminar.descripcionAprobado')}
        textoConfirmar={t('eliminar.confirmar')}
        onConfirmar={confirmarBorrado}
        cargando={borrando}
      />
    </div>
  );
}

function TablaCuentas({
  filas,
  cargando,
  nombres,
  formatear,
  editable,
  rutaEditor,
}: {
  filas: readonly FilaGrilla[];
  cargando: boolean;
  nombres: ReadonlyMap<string, string>;
  formatear: (v: number) => string;
  editable: boolean;
  rutaEditor: string;
}) {
  const t = useTranslations('finanzasReportesR2.presupuestos');
  if (cargando) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (filas.length === 0) {
    return (
      <EmptyState
        compacto
        titulo={t('detalle.sinLineas')}
        icono={ListChecks}
        accion={editable ? { etiqueta: t('detalle.agregarCuentas'), href: rutaEditor, icono: Plus } : undefined}
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-fg-secondary">
          <tr>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">{t('detalle.cuenta')}</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('detalle.planeadoAnio')}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={claveFila(f)} className="border-t border-line">
              <td className="px-3 py-2.5 text-fg">
                <span className="tabular-nums">{f.account_code}</span>
                {nombres.get(f.account_code) ? ` · ${nombres.get(f.account_code)}` : ''}
                {f.cost_center_id ? <span className="ml-2 text-xs text-fg-muted">{t('detalle.centroCosto')}</span> : null}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-fg">{formatear(totalFila(f))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line bg-subtle font-semibold text-fg">
            <td className="px-3 py-2.5">{t('detalle.total')}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{formatear(totalGrilla(filas))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
