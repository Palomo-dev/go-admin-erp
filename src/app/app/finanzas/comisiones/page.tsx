'use client';

/**
 * /app/finanzas/comisiones (F13; rediseño Tesorería v2, Figma 1012:87993 y
 * diálogo 1012:89017): pestañas por estado, cifras, buscador con rango de
 * fechas y filtros, tabla agrupada por vendedor y «Pagar comisiones». Todo el
 * I/O pasa por `useComisiones` → rutas de API (organización de la sesión,
 * permisos y transiciones validados en el servidor).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { BadgePercent, BookOpen, ExternalLink, RefreshCw, RotateCcw, Settings2, Wallet, XCircle } from 'lucide-react';
import { DialogoMotivo, PageHeader, RowActionsMenu, TabBar, clasesBoton, etiquetaRangoLarga, type AccionFila, type EstadoTabla } from '@/components/kit';
import { toast } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrgMembers } from '@/lib/hooks/useOrgMembers';
import { describeError } from '@/lib/utils/errorMessage';
import { formatMoneda } from '@/lib/utils/moneda';
import type { CommissionRow } from '@/lib/services/crm/commissionAdminService';
import { ComisionesFilters, ComisionesList, ComisionesSummary, PagarComisionesDialog, useComisiones } from '@/components/finanzas/comisiones';
import {
  ESTADO_DE_PESTANA,
  REASON_MAX,
  agruparPorVendedor,
  emptyFilters,
  filasDeTabla,
  pestanaDeEstado,
  sourceHref,
  type GrupoVendedor,
  type PestanaComisiones,
} from '@/components/finanzas/comisiones/comisionesModel';

type Grupo = GrupoVendedor<CommissionRow>;
type Motivo = { tipo: 'rechazar'; filas: CommissionRow[]; nombre: string } | { tipo: 'clawback'; fila: CommissionRow };
const RUTA_REGLAS = '/app/configuracion?modulo=crm';

export default function ComisionesPage() {
  const state = useComisiones({ status: 'accrued' });
  const t = useTranslations('finanzasComisiones');
  const locale = useLocale();
  const router = useRouter();
  const { code: monedaOrg, paraDocumento } = useMonedaOrganizacion();
  const { members } = useOrgMembers();
  const monedaBase = state.currency || monedaOrg;
  const [plegados, setPlegados] = useState<Set<string>>(() => new Set());
  const [pago, setPago] = useState<{ filas: CommissionRow[]; vendedor: string | null } | null>(null);
  const [motivo, setMotivo] = useState<Motivo | null>(null);

  const pestana = pestanaDeEstado(state.filters.status);
  const grupos = useMemo(() => agruparPorVendedor(state.rows, monedaBase), [state.rows, monedaBase]);
  const filas = useMemo(() => filasDeTabla(grupos, plegados), [grupos, plegados]);
  const pendientes = useMemo(() => state.rows.filter((r) => r.status === 'accrued'), [state.rows]);
  const general = state.summaryGeneral ?? state.summary;
  const nombre = (n: string | null) => n || t('sinNombre');
  const fmt = (valor: number, moneda?: string | null) => formatMoneda(valor, paraDocumento(moneda || monedaBase));

  const avisar = async (fn: () => Promise<string>, errorTitulo: string) => {
    try {
      toast({ title: await fn() });
      return true;
    } catch (err) {
      toast({ title: errorTitulo, description: describeError(err), variant: 'destructive' });
      return false;
    }
  };

  const pagarGrupo = (g: Grupo) => setPago({ filas: g.pendientes, vendedor: nombre(g.nombre) });

  const accionesGrupo = (g: Grupo): AccionFila[] =>
    state.canManage && g.pendientes.length > 0
      ? [
          { id: 'pagar', etiqueta: t('acciones.pagarPendientes', { count: g.pendientes.length }), icono: Wallet, onSelect: () => pagarGrupo(g) },
          {
            id: 'rechazar',
            etiqueta: t('acciones.rechazarPendientes', { count: g.pendientes.length }),
            icono: XCircle,
            destructiva: true,
            onSelect: () => setMotivo({ tipo: 'rechazar', filas: g.pendientes, nombre: nombre(g.nombre) }),
          },
        ]
      : [];

  const accionesComision = (c: CommissionRow): AccionFila[] => {
    const href = sourceHref(c);
    return [
      ...(href ? [{ id: 'origen', etiqueta: t('acciones.verOrigen'), icono: ExternalLink, onSelect: () => router.push(href) }] : []),
      ...(state.asientos[c.id]
        ? [{ id: 'asiento', etiqueta: t('acciones.verAsiento'), icono: BookOpen, onSelect: () => router.push(`/app/finanzas/contabilidad/asientos/${state.asientos[c.id].id}`) }]
        : []),
      ...(state.canManage && c.status === 'accrued'
        ? [
            { id: 'pagar', etiqueta: t('acciones.pagar'), icono: Wallet, separadorAntes: true, onSelect: () => setPago({ filas: [c], vendedor: nombre(c.payee_name) }) },
            { id: 'rechazar', etiqueta: t('acciones.rechazar'), icono: XCircle, destructiva: true, onSelect: () => setMotivo({ tipo: 'rechazar', filas: [c], nombre: nombre(c.payee_name) }) },
          ]
        : []),
      ...(state.canManage && c.status === 'paid'
        ? [{ id: 'clawback', etiqueta: t('acciones.clawback'), icono: RotateCcw, destructiva: true, separadorAntes: true, onSelect: () => setMotivo({ tipo: 'clawback', fila: c }) }]
        : []),
    ];
  };

  const estado: EstadoTabla =
    state.loading && state.rows.length === 0
      ? 'cargando'
      : state.error && state.rows.length === 0
        ? 'error'
        : state.rows.length > 0
          ? 'listo'
          : state.filters.search || state.filters.from || state.filters.payee_id || state.filters.source_type !== 'all'
            ? 'sinResultados'
            : 'vacio';

  const rango = state.filters.from && state.filters.to ? etiquetaRangoLarga({ desde: state.filters.from, hasta: state.filters.to }, locale) : t('todasLasFechas');
  const subtitulo = `${rango} · ${t('nVendedores', { count: grupos.length })}`;

  const menu: AccionFila[] = [
    { id: 'actualizar', etiqueta: t('acciones.actualizar'), icono: RefreshCw, onSelect: () => void state.reload() },
    { id: 'reglas', etiqueta: t('acciones.reglas'), icono: Settings2, onSelect: () => router.push(RUTA_REGLAS) },
  ];
  const pagarTodo = () => setPago({ filas: pendientes, vendedor: grupos.filter((g) => g.pendientes.length > 0).length === 1 ? nombre(grupos.find((g) => g.pendientes.length > 0)?.nombre ?? null) : null });

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        icono={BadgePercent}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.configuracion') }, { etiqueta: t('titulo') }]}
        subtitulo={state.loading && state.rows.length === 0 ? undefined : subtitulo}
        cargando={state.loading}
        acciones={
          <>
            {state.canManage && (
              <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={pagarTodo} disabled={pendientes.length === 0 || state.busy}>
                <Wallet className="size-4" aria-hidden="true" strokeWidth={1.5} />
                {t('pagarComisiones')}
              </button>
            )}
            <RowActionsMenu acciones={menu} orientacion="horizontal" titulo={t('titulo')} />
          </>
        }
        movil={{
          subtitulo,
          menu: [...(state.canManage && pendientes.length > 0 ? [{ id: 'pagarTodo', etiqueta: t('pagarComisiones'), icono: Wallet, onSelect: pagarTodo }] : []), ...menu],
        }}
        debajo={
          <TabBar
            id="comisiones"
            etiqueta={t('pestanas.etiqueta')}
            valor={pestana}
            onValorChange={(p: PestanaComisiones) => state.setFilters({ ...state.filters, status: ESTADO_DE_PESTANA[p] })}
            pestanas={[
              { valor: 'porPagar', etiqueta: t('pestanas.porPagar'), contador: state.summaryGeneral ? general.count_pending : undefined },
              { valor: 'pagadas', etiqueta: t('pestanas.pagadas'), contador: state.summaryGeneral ? general.count_paid : undefined },
              { valor: 'canceladas', etiqueta: t('pestanas.canceladas'), contador: state.summaryGeneral ? general.count_cancelled : undefined },
              { valor: 'todas', etiqueta: t('pestanas.todas') },
            ]}
          />
        }
      />

      <ComisionesSummary
        summary={general}
        others={state.summaryOthers}
        currency={monedaBase}
        vendedores={grupos.length}
        soloPendientes={pestana === 'porPagar'}
        loading={state.loading && !state.summaryGeneral}
        unavailable={state.error !== null && state.rows.length === 0}
      />

      <ComisionesFilters filters={state.filters} onChange={state.setFilters} members={members} canManage={state.canManage} />

      {state.error && state.rows.length > 0 && <p className="text-sm text-danger-text" role="alert">{t('errorParcial', { error: state.error })}</p>}

      <ComisionesList
        filas={filas}
        estado={estado}
        monedaBase={monedaBase}
        asientos={state.asientos}
        plegados={plegados}
        onPlegar={(clave) => setPlegados((prev) => { const s = new Set(prev); if (s.has(clave)) s.delete(clave); else s.add(clave); return s; })}
        accionesGrupo={accionesGrupo}
        accionesComision={accionesComision}
        onPagarGrupo={state.canManage ? pagarGrupo : null}
        vacio={{ titulo: t(`vacio.${pestana}.titulo`), descripcion: t(`vacio.${pestana}.descripcion`) }}
        onReintentar={() => void state.reload()}
        onLimpiarFiltros={() => state.setFilters({ ...emptyFilters(), status: state.filters.status })}
        termino={state.filters.search}
        pie={
          state.rows.length > 0 && state.count > state.rows.length ? (
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
              <p className="text-xs text-fg-secondary" aria-live="polite">{t('mostrando', { shown: state.rows.length, total: state.count, vendedores: grupos.length })}</p>
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => state.loadMore()} disabled={state.loadingMore}>
                {state.loadingMore ? t('cargando') : t('cargarMas')}
              </button>
            </div>
          ) : state.rows.length > 0 ? (
            <p className="text-xs text-fg-secondary">{t('mostrandoTodo', { count: state.rows.length, vendedores: grupos.length })}</p>
          ) : undefined
        }
      />

      <PagarComisionesDialog
        abierto={pago !== null}
        onAbiertoChange={(v) => !v && setPago(null)}
        filas={pago?.filas ?? []}
        vendedor={pago?.vendedor ?? null}
        monedaBase={monedaBase}
        cuentas={state.moneyAccounts}
        ocupado={state.busy}
        onConfirmar={async (cuenta, referencia) => {
          if (!pago) return;
          if (await avisar(() => state.payMany(pago.filas.map((r) => r.id), cuenta, referencia), t('errores.pagar'))) setPago(null);
        }}
      />

      <DialogoMotivo
        abierto={motivo !== null}
        onAbiertoChange={(v) => !v && !state.busy && setMotivo(null)}
        titulo={motivo?.tipo === 'clawback' ? t('clawback.titulo') : t('rechazar.titulo', { count: motivo?.tipo === 'rechazar' ? motivo.filas.length : 1 })}
        descripcion={
          motivo?.tipo === 'clawback'
            ? t('clawback.descripcion', { importe: fmt(Number(motivo.fila.commission_amount), motivo.fila.currency), nombre: nombre(motivo.fila.payee_name) })
            : motivo?.tipo === 'rechazar'
              ? t('rechazar.descripcion', { count: motivo.filas.length, nombre: motivo.nombre })
              : undefined
        }
        consecuencias={motivo?.tipo === 'clawback' ? [t('clawback.consecuencia1'), t('clawback.consecuencia2')] : [t('rechazar.consecuencia')]}
        textoConfirmar={motivo?.tipo === 'clawback' ? t('clawback.confirmar') : t('rechazar.confirmar')}
        minimo={3}
        maximo={REASON_MAX}
        cargando={state.busy}
        onConfirmar={async (texto) => {
          if (!motivo) return;
          const ok =
            motivo.tipo === 'clawback'
              ? await avisar(() => state.clawbackOne(motivo.fila.id, texto), t('errores.clawback'))
              : await avisar(() => state.rejectMany(motivo.filas.map((r) => r.id), texto), t('errores.rechazar'));
          if (ok) setMotivo(null);
        }}
      />
    </div>
  );
}
