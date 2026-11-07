'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BarChart3, Copy, Download, ListChecks, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { EmptyState } from '@/components/kit/EmptyState';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { SelectorCuenta, type OpcionCuenta } from '@/components/kit/SelectorCuenta';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { buscarCuentas, cuentasDeMovimiento } from '@/components/finanzas/contabilidad/cuentas/CuentasAutomaticasService';
import {
  MESES,
  claveEstado,
  claveFila,
  construirGrilla,
  copiarMesAlResto,
  esEditable,
  grillasIguales,
  repartirAnual,
  tonoEstado,
  totalFila,
  totalGrilla,
  type FilaGrilla,
} from '@/lib/finanzas/presupuestos/presupuestoLogica';
import { BudgetService, ErrorPresupuesto, type Budget } from './BudgetService';
import { NuevoPresupuestoDialog } from './NuevoPresupuestoDialog';
import { RUTA_PRESUPUESTOS as RUTA_LISTA, RUTA_PRESUPUESTO_VS_REAL, rutaEditorPresupuesto } from './rutas';

function nombresMeses(locale: string): string[] {
  const f = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  return Array.from({ length: MESES }, (_, i) => {
    const m = f.format(new Date(Date.UTC(2026, i, 15))).replace('.', '');
    return m.charAt(0).toLocaleUpperCase(locale) + m.slice(1);
  });
}

/**
 * Editar líneas de un presupuesto (Figma 82-21): una fila por cuenta de
 * movimiento con sus 12 meses y el año. Solo se edita en borrador; uno
 * aprobado, activo o cerrado se ve en solo lectura y ofrece una copia en
 * borrador (el esquema no tiene versiones). Guarda por
 * `PUT /api/finanzas/presupuestos/:id/lineas`.
 */
export function EditorPresupuestoPage({ id }: { id: string }) {
  const t = useTranslations('finanzasReportesR2.presupuestos');
  const locale = useLocale();
  const router = useRouter();
  const { formatear, decimals } = useMonedaOrganizacion();
  const permisos = usePermisosFinanzas();
  const meses = useMemo(() => nombresMeses(locale), [locale]);

  const [presupuesto, setPresupuesto] = useState<Budget | null>(null);
  const [todos, setTodos] = useState<Budget[]>([]);
  const [original, setOriginal] = useState<FilaGrilla[]>([]);
  const [filas, setFilas] = useState<FilaGrilla[]>([]);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const [estadoCarga, setEstadoCarga] = useState<'cargando' | 'listo' | 'no_encontrado' | 'error'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [mesActivo, setMesActivo] = useState<Record<string, number>>({});
  const [copiar, setCopiar] = useState(false);

  const editable = !!presupuesto && esEditable(presupuesto.status);
  const hayCambios = editable && !grillasIguales(filas, original);
  const estadoTexto = presupuesto ? t(`estado.${claveEstado(presupuesto.status)}`) : '';

  const cargar = useCallback(async () => {
    setEstadoCarga('cargando');
    try {
      const [p, lineas] = await Promise.all([BudgetService.getById(id), BudgetService.getLines(id)]);
      if (!p) {
        setEstadoCarga('no_encontrado');
        return;
      }
      const grilla = construirGrilla(lineas);
      setPresupuesto(p);
      setOriginal(grilla);
      setFilas(grilla);
      setEstadoCarga('listo');
    } catch (e) {
      console.error('[presupuestos] no se pudo cargar el presupuesto', e);
      setEstadoCarga('error');
    }
  }, [id]);

  useEffect(() => {
    void cargar();
    cuentasDeMovimiento()
      .then((c) => setNombres(new Map(c.map((x) => [x.account_code, x.name]))))
      .catch(() => setNombres(new Map()));
    BudgetService.getAll()
      .then(setTodos)
      .catch(() => setTodos([]));
  }, [cargar]);

  useEffect(() => {
    if (!hayCambios) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [hayCambios]);

  const cambiarFila = (clave: string, meses: number[]) =>
    setFilas((fs) => fs.map((f) => (claveFila(f) === clave ? { ...f, meses } : f)));

  const cambiarMes = (f: FilaGrilla, indice: number, valor: number | null) => {
    const nuevos = [...f.meses];
    nuevos[indice] = valor ?? 0;
    cambiarFila(claveFila(f), nuevos);
    setMesActivo((m) => ({ ...m, [claveFila(f)]: indice }));
  };

  const agregarCuenta = (c: OpcionCuenta) => {
    const nueva: FilaGrilla = { account_code: c.account_code, cost_center_id: null, meses: Array(MESES).fill(0) };
    if (filas.some((f) => claveFila(f) === claveFila(nueva))) return;
    setNombres((n) => new Map(n).set(c.account_code, c.name));
    setFilas((fs) => [...fs, nueva].sort((a, b) => a.account_code.localeCompare(b.account_code)));
  };

  const buscarDisponibles = useCallback(
    async (texto: string, desde: number) => {
      const usadas = new Set(filas.filter((f) => !f.cost_center_id).map((f) => f.account_code));
      const pagina = await buscarCuentas(texto, desde);
      return { items: pagina.items.filter((c) => !usadas.has(c.account_code)), total: pagina.total };
    },
    [filas],
  );

  const guardar = async () => {
    if (!presupuesto) return;
    setGuardando(true);
    try {
      await BudgetService.guardarLineas(presupuesto.id, filas);
      toast.success(t('toast.guardado'));
      await cargar();
    } catch (e) {
      const codigo = e instanceof ErrorPresupuesto ? e.codigo : 'error';
      const cuentas = e instanceof ErrorPresupuesto ? (e.cuentas ?? []).join(', ') : '';
      toast.error(t.has(`error.${codigo}`) ? t(`error.${codigo}`, { cuentas }) : t('error.error'));
    } finally {
      setGuardando(false);
    }
  };

  const exportar = () => {
    if (!presupuesto) return;
    const cabecera = [t('detalle.cuenta'), '', ...meses, t('editor.anio')];
    const cuerpo = filas.map((f) => [f.account_code, nombres.get(f.account_code) ?? '', ...f.meses, totalFila(f)]);
    const pie = [t('detalle.total'), '', ...Array.from({ length: MESES }, (_, i) => filas.reduce((s, f) => s + f.meses[i], 0)), totalGrilla(filas)];
    const nombre = presupuesto.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
    descargarCsv(t('editor.nombreArchivo', { nombre }), aCsv([cabecera, ...cuerpo, pie]));
  };

  if (estadoCarga === 'cargando') {
    return (
      <div className="min-h-screen space-y-6 bg-canvas p-4 md:p-6">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (estadoCarga !== 'listo' || !presupuesto) {
    return (
      <div className="min-h-screen space-y-6 bg-canvas p-4 md:p-6">
        <EmptyState
          variante="error"
          descripcion={estadoCarga === 'no_encontrado' ? t('editor.noEncontrado') : t('error.cargarLineas')}
          onReintentar={estadoCarga === 'error' ? () => void cargar() : undefined}
          accion={estadoCarga === 'no_encontrado' ? { etiqueta: t('editor.volver'), href: RUTA_LISTA } : undefined}
        />
      </div>
    );
  }

  const motivoGuardar = !permisos.crear ? t('editor.sinPermiso') : !hayCambios ? t('editor.sinCambios') : undefined;
  const nombreCuenta = (codigo: string) => (nombres.get(codigo) ? `${codigo} · ${nombres.get(codigo)}` : codigo);

  const accionesFila = (f: FilaGrilla) => {
    const indice = mesActivo[claveFila(f)] ?? 0;
    return [
      { id: 'copiar', etiqueta: t('editor.copiarMes', { mes: meses[indice] }), icono: Copy, onSelect: () => cambiarFila(claveFila(f), copiarMesAlResto(f.meses, indice)) },
      {
        id: 'quitar',
        etiqueta: t('editor.quitar'),
        icono: Trash2,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setFilas((fs) => fs.filter((x) => claveFila(x) !== claveFila(f))),
      },
    ];
  };

  const celdaMes = (f: FilaGrilla, i: number) =>
    editable ? (
      <CampoNumero
        tamano="sm"
        decimales={decimals}
        valor={f.meses[i]}
        onValorChange={(v) => cambiarMes(f, i, v)}
        aria-label={t('editor.valorMes', { cuenta: f.account_code, mes: meses[i] })}
        className="min-w-[112px]"
      />
    ) : (
      <span className="tabular-nums">{formatear(f.meses[i])}</span>
    );

  const celdaAnio = (f: FilaGrilla) =>
    editable ? (
      <CampoNumero
        tamano="sm"
        decimales={decimals}
        valor={totalFila(f)}
        onValorChange={(v) => cambiarFila(claveFila(f), repartirAnual(v ?? 0, decimals))}
        aria-label={t('editor.valorAnio', { cuenta: f.account_code })}
        className="min-w-[128px] font-semibold"
      />
    ) : (
      <span className="font-semibold tabular-nums">{formatear(totalFila(f))}</span>
    );

  const menuCabecera = (
      <RowActionsMenu
        orientacion="horizontal"
        tamano="md"
        titulo={presupuesto.name}
        acciones={[
          { id: 'descartar', etiqueta: t('editor.descartar'), icono: RotateCcw, oculta: !hayCambios, onSelect: () => setFilas(original) },
          {
            id: 'copiar',
            etiqueta: t('menu.copiar'),
            icono: Copy,
            onSelect: () => setCopiar(true),
            deshabilitada: !permisos.crear,
            motivo: permisos.crear ? undefined : t('nuevoDialogo.sinPermiso'),
          },
          { id: 'informe', etiqueta: t('verInforme'), icono: BarChart3, separadorAntes: true, onSelect: () => router.push(RUTA_PRESUPUESTO_VS_REAL) },
        ]}
      />
  );

  const botonExportar = (
    <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={exportar} disabled={filas.length === 0}>
      <Download aria-hidden="true" className="size-4" />
      {t('editor.exportar')}
    </button>
  );

  const selectorAgregar = editable && (
    <SelectorCuenta
      valor={null}
      onCambiar={agregarCuenta}
      buscar={buscarDisponibles}
      etiqueta={t('editor.buscarCuenta')}
      disparador={
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Plus aria-hidden="true" className="size-4" />
          {t('editor.agregarCuenta')}
        </button>
      }
    />
  );

  return (
    <div className="min-h-screen space-y-6 bg-canvas p-4 md:p-6">
      <PageHeader
        titulo={presupuesto.name}
        subtitulo={t('editor.subtitulo', { estado: estadoTexto })}
        icono={ListChecks}
        badge={<StatusBadge estado={presupuesto.status} etiqueta={estadoTexto} tono={tonoEstado(presupuesto.status)} tamano="md" />}
        volverA={RUTA_LISTA}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.presupuestos'), href: RUTA_LISTA },
          { etiqueta: presupuesto.name },
        ]}
        acciones={
          <div className="flex items-center gap-2">
            {botonExportar}
            {editable && (
              <button
                type="button"
                className={clasesBoton({ variante: 'primario' })}
                onClick={() => void guardar()}
                disabled={!!motivoGuardar || guardando}
                title={motivoGuardar}
              >
                {t('editor.guardar')}
              </button>
            )}
            {menuCabecera}
          </div>
        }
        movil={{
          accion: editable ? (
            <button
              type="button"
              className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
              onClick={() => void guardar()}
              disabled={!!motivoGuardar || guardando}
            >
              {t('editor.guardar')}
            </button>
          ) : undefined,
        }}
      />

      <div className="flex items-center justify-end gap-2 lg:hidden">
        {botonExportar}
        {menuCabecera}
      </div>

      {!editable && (
        <AvisoTonal
          tono="informacion"
          titulo={t('editor.aprobadoTitulo')}
          descripcion={t('editor.aprobadoDescripcion')}
          accion={permisos.crear ? { etiqueta: t('menu.copiar'), onClick: () => setCopiar(true) } : undefined}
        />
      )}

      {filas.length === 0 ? (
        <div className="flex flex-col items-center gap-3">
          <EmptyState compacto titulo={t('editor.sinCuentas')} descripcion={editable ? t('editor.sinCuentasDescripcion') : undefined} icono={ListChecks} />
          {selectorAgregar}
        </div>
      ) : (
        <>
          {/* Escritorio: tabla con la cuenta fija a la izquierda. */}
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface lg:block">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-fg-secondary">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-[240px] bg-subtle px-3 py-2.5 text-left font-medium">
                    {t('detalle.cuenta')}
                  </th>
                  {meses.map((m) => (
                    <th key={m} scope="col" className="px-2 py-2.5 text-right font-medium">
                      {m}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2.5 text-right font-medium">
                    {t('editor.anio')}
                  </th>
                  {editable && <th scope="col" className="w-10" aria-label={t('editor.masAcciones')} />}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={claveFila(f)} className="border-t border-line">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-normal text-fg">
                      {nombreCuenta(f.account_code)}
                      {f.cost_center_id ? <span className="ml-2 text-xs text-fg-muted">{t('detalle.centroCosto')}</span> : null}
                    </th>
                    {f.meses.map((_, i) => (
                      <td key={i} className="px-1 py-2 text-right text-fg">
                        {celdaMes(f, i)}
                      </td>
                    ))}
                    <td className="px-1 py-2 text-right text-fg">{celdaAnio(f)}</td>
                    {editable && (
                      <td className="px-1 py-2 text-right">
                        <RowActionsMenu acciones={accionesFila(f)} titulo={f.account_code} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-subtle font-semibold text-fg">
                  <th scope="row" className="sticky left-0 z-10 bg-subtle px-3 py-2.5 text-left">
                    {t('detalle.total')}
                  </th>
                  {meses.map((m, i) => (
                    <td key={m} className="px-2 py-2.5 text-right tabular-nums">
                      {formatear(filas.reduce((s, f) => s + f.meses[i], 0))}
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatear(totalGrilla(filas))}</td>
                  {editable && <td />}
                </tr>
              </tfoot>
            </table>
            {editable && <div className="border-t border-line px-3 py-2.5">{selectorAgregar}</div>}
          </div>

          {/* Móvil: una tarjeta por cuenta con sus 12 meses. */}
          <ul className="flex flex-col gap-3 lg:hidden">
            {filas.map((f) => (
              <li key={claveFila(f)} className="rounded-xl border border-line bg-surface p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-fg">{nombreCuenta(f.account_code)}</p>
                  {editable && <RowActionsMenu acciones={accionesFila(f)} titulo={f.account_code} />}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {meses.map((m, i) => (
                    <div key={m} className="flex flex-col gap-1">
                      <span className="text-xs text-fg-muted">{m}</span>
                      {celdaMes(f, i)}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="text-sm font-medium text-fg">{t('editor.anio')}</span>
                  <div className="w-40">{celdaAnio(f)}</div>
                </div>
              </li>
            ))}
            <li className="flex items-center justify-between rounded-xl border border-line bg-subtle px-4 py-3 text-sm font-semibold text-fg">
              <span>{t('detalle.total')}</span>
              <span className="tabular-nums">{formatear(totalGrilla(filas))}</span>
            </li>
            {editable && <li>{selectorAgregar}</li>}
          </ul>
        </>
      )}

      {editable && <p className="text-sm text-fg-secondary">{t('editor.nota')}</p>}
      {!editable && (
        <p className="text-sm text-fg-secondary">
          {t('detalle.nota')}{' '}
          <Link href={RUTA_PRESUPUESTO_VS_REAL} className="font-medium text-link hover:underline">
            {t('detalle.abrirInforme')}
          </Link>
        </p>
      )}

      <NuevoPresupuestoDialog
        abierto={copiar}
        onAbiertoChange={setCopiar}
        presupuestos={todos}
        anioInicial={presupuesto.fiscal_year}
        copiarDe={presupuesto}
        puedeCrear={permisos.crear}
        onCreado={(p) => router.push(rutaEditorPresupuesto(p.id))}
      />
    </div>
  );
}
