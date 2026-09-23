'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Banknote, Eye, History, Lock, Plus, Package } from 'lucide-react';
import {
  AccionRapida,
  DataTable,
  EmptyState,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  SearchInput,
  SegmentedControl,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { puedeCerrarCaja } from '@/lib/pos/cajas/reglasCierre';
import type { CashSession, CashSummary } from '../types';
import { cajaCoincide, dinero, dineroConSigno } from '../historialCajas';
import { Oculto, SucursalCaja, useHaceCuanto } from './comunes';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';

type FiltroCajero = 'todas' | 'mias' | 'otros';

export interface CajasAbiertasTabProps {
  sesiones: readonly CashSession[];
  resumenes: ReadonlyMap<number, CashSummary>;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  userId: string | null;
  cerrarAjenas: boolean;
  showExpected: boolean;
  onCerrar: (sesion: CashSession) => void;
  /** `null` cuando ya tienes caja abierta: el vacío no ofrece abrir otra. */
  onAbrirCaja: (() => void) | null;
  onVerHistorial: () => void;
  nombreSucursal: string;
  /** Pestañas (SegmentedControl) a la derecha de la barra. */
  pestanas: ReactNode;
}

export function CajasAbiertasTab({
  sesiones,
  resumenes,
  cargando,
  error,
  onReintentar,
  userId,
  cerrarAjenas,
  showExpected,
  onCerrar,
  onAbrirCaja,
  onVerHistorial,
  nombreSucursal,
  pestanas,
}: CajasAbiertasTabProps) {
  // Moneda base de la organización (fuente única: monedaOrganizacion.ts).
  const moneda = useMonedaOrganizacion();
  const router = useRouter();
  const { formatDateTime } = useFormatDate();
  const t = useTranslations('cajas.listado.abiertas');
  const tListado = useTranslations('cajas.listado');
  const tError = useTranslations('cajas.errores');
  const haceCuanto = useHaceCuanto();
  const motivoCierreCiego = tListado('motivoCierreCiego');
  const motivoNoPuedeCerrar = tError('sinPermiso');
  const etiquetaFiltro = (v: FiltroCajero) => t(`filtroCajero.${v}`);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCajero, setFiltroCajero] = useState<FiltroCajero>('todas');

  const filas = useMemo(
    () =>
      sesiones.filter((s) => {
        if (filtroCajero === 'mias' && s.opened_by !== userId) return false;
        if (filtroCajero === 'otros' && s.opened_by === userId) return false;
        return cajaCoincide(s, busqueda);
      }),
    [sesiones, filtroCajero, userId, busqueda],
  );

  const hayCriterios = busqueda.trim() !== '' || filtroCajero !== 'todas';
  const irADetalle = (s: CashSession) => router.push(`/app/pos/cajas/${s.uuid}`);
  const limpiar = () => {
    setBusqueda('');
    setFiltroCajero('todas');
  };

  const accionesDe = (s: CashSession): AccionFila[] => {
    const puedeCerrar = puedeCerrarCaja(s, userId, cerrarAjenas);
    return [
      {
        id: 'ver',
        etiqueta: tListado('verDetalle'),
        icono: Eye,
        onSelect: () => irADetalle(s),
        deshabilitada: !showExpected,
        motivo: showExpected ? undefined : motivoCierreCiego,
      },
      {
        id: 'cerrar',
        etiqueta: tListado('cerrarCaja'),
        icono: Lock,
        onSelect: () => onCerrar(s),
        deshabilitada: !puedeCerrar,
        motivo: puedeCerrar ? undefined : motivoNoPuedeCerrar,
      },
    ];
  };

  const celdaResumen = (s: CashSession, pintar: (r: CashSummary) => ReactNode) => {
    const r = resumenes.get(s.id);
    return r ? pintar(r) : <Skeleton className="ml-auto h-4 w-16" />;
  };

  const columnas: ColumnaTabla<CashSession>[] = [
    { id: 'caja', encabezado: tListado('columnas.caja'), variante: 'mono', ancho: 80, celda: (s) => <span className="text-fg-secondary">#{s.id}</span> },
    {
      id: 'cajero',
      encabezado: tListado('columnas.cajero'),
      celda: (s) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{s.opened_by_name || tListado('cajero')}</span>
          <span className="text-xs text-fg-secondary">{s.opened_by === userId ? t('tuCaja') : tListado('cajero')}</span>
        </div>
      ),
    },
    { id: 'sucursal', encabezado: tListado('columnas.sucursal'), ocultarDebajo: 'xl', celda: (s) => <SucursalCaja sesion={s} /> },
    {
      id: 'abierta',
      encabezado: t('columnas.abiertaDesde'),
      celda: (s) => (
        <div className="flex flex-col whitespace-nowrap">
          <span className="tabular-nums">{formatDateTime(s.opened_at)}</span>
          <span className="text-xs text-fg-secondary">{haceCuanto(s.opened_at)}</span>
        </div>
      ),
    },
    { id: 'inicial', encabezado: tListado('columnas.inicial'), variante: 'importe', celda: (s) => <span className="font-medium">{dinero(s.initial_amount, moneda)}</span> },
    {
      id: 'ventas',
      encabezado: t('columnas.ventasEfectivo'),
      variante: 'importe',
      ocultarDebajo: 'lg',
      celda: (s) =>
        celdaResumen(s, (r) => (
          <div className="flex flex-col items-end">
            <span className="font-medium">{dinero(r.sales_cash, moneda)}</span>
            <span className="text-xs text-fg-secondary">
              {t('ventas', { count: r.sales_cash_count ?? 0 })}
            </span>
          </div>
        )),
    },
    {
      id: 'movimientos',
      encabezado: t('columnas.movimientos'),
      variante: 'importe',
      ocultarDebajo: 'lg',
      celda: (s) =>
        celdaResumen(s, (r) => {
          const n = (r.cash_in_count ?? 0) + (r.cash_out_count ?? 0);
          return (
            <div className="flex flex-col items-end">
              <span className="font-medium">{dineroConSigno(r.cash_in - r.cash_out, moneda)}</span>
              <span className="text-xs text-fg-secondary">
                {t('movimientos', { count: n })}
              </span>
            </div>
          );
        }),
    },
    {
      id: 'esperado',
      encabezado: t('columnas.esperado'),
      variante: 'importe',
      celda: (s) => (showExpected ? celdaResumen(s, (r) => <span className="font-medium">{dinero(r.expected_amount, moneda)}</span>) : <Oculto />),
    },
  ];

  const toolbar = (
    <ListToolbar
      busqueda={
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          onValueChange={setBusqueda}
          placeholder={t('buscarPlaceholder')}
          etiqueta={t('buscarEtiqueta')}
        />
      }
      filtros={
        <FilterPanel
          conteo={filtroCajero === 'todas' ? 0 : 1}
          onLimpiar={() => setFiltroCajero('todas')}
          textoVerResultados={t('verCajas', { count: filas.length })}
        >
          <FormField etiqueta={tListado('columnas.cajero')}>
            {(c) => (
              <SegmentedControl
                aria-labelledby={c.idEtiqueta}
                anchoCompleto
                valor={filtroCajero}
                onValorChange={setFiltroCajero}
                opciones={(['todas', 'mias', 'otros'] as const).map((v) => ({ valor: v, etiqueta: etiquetaFiltro(v) }))}
              />
            )}
          </FormField>
        </FilterPanel>
      }
      chips={
        <FilterChips
          chips={filtroCajero === 'todas' ? [] : [{ clave: 'cajero', etiqueta: t('chipCajero', { valor: etiquetaFiltro(filtroCajero) }) }]}
          onQuitar={() => setFiltroCajero('todas')}
          onLimpiarTodo={limpiar}
        />
      }
    />
  );

  const estado = cargando && sesiones.length === 0 ? 'cargando' : error ? 'error' : filas.length === 0 && hayCriterios ? 'sinResultados' : 'listo';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">{toolbar}</div>
        <div className="shrink-0">{pestanas}</div>
      </div>

      {estado === 'listo' && filas.length === 0 ? (
        <EmptyState
          icono={Package}
          titulo={t('vacioTitulo')}
          descripcion={t('vacioDescripcion', { sucursal: nombreSucursal })}
          accionSecundaria={{ etiqueta: tListado('verHistorial'), icono: History, onClick: onVerHistorial }}
          accion={onAbrirCaja ? { etiqueta: tListado('abrirCaja'), icono: Plus, onClick: onAbrirCaja } : undefined}
        />
      ) : (
        <DataTable
          etiqueta={t('tablaEtiqueta')}
          columnas={columnas}
          filas={filas}
          obtenerId={(s) => String(s.id)}
          estado={estado}
          onFilaClick={showExpected ? irADetalle : undefined}
          etiquetaFila={(s) =>
            s.opened_by_name ? tListado('etiquetaFila', { id: s.id, nombre: s.opened_by_name }) : tListado('etiquetaFilaSinNombre', { id: s.id })
          }
          accionesRapidas={(s) => {
            const puedeCerrar = puedeCerrarCaja(s, userId, cerrarAjenas);
            return (
              <>
                <AccionRapida
                  soloIcono
                  etiqueta={tListado('verDetalle')}
                  icono={Eye}
                  onClick={() => irADetalle(s)}
                  deshabilitada={!showExpected}
                  motivo={showExpected ? undefined : motivoCierreCiego}
                />
                <AccionRapida
                  etiqueta={t('cerrar')}
                  icono={Lock}
                  onClick={() => onCerrar(s)}
                  deshabilitada={!puedeCerrar}
                  motivo={puedeCerrar ? undefined : motivoNoPuedeCerrar}
                />
              </>
            );
          }}
          tarjetaMovil={(s) => (
            <ListCard
              icono={Banknote}
              titulo={`${s.opened_by_name || tListado('cajero')} · #${s.id}`}
              subtitulo={t('tarjetaSubtitulo', { sucursal: s.branch_name ?? '', hace: haceCuanto(s.opened_at) })}
              meta={s.opened_by === userId ? t('tuCaja') : t('tarjetaInicial', { monto: dinero(s.initial_amount, moneda) })}
              valor={showExpected ? (resumenes.get(s.id) ? dinero(resumenes.get(s.id)?.expected_amount, moneda) : undefined) : undefined}
              estado={showExpected ? undefined : <Oculto />}
              onClick={showExpected ? () => irADetalle(s) : undefined}
              acciones={accionesDe(s)}
            />
          )}
          sinResultados={{ titulo: t('sinResultadosTitulo'), descripcion: t('sinResultadosDescripcion') }}
          onLimpiarFiltros={limpiar}
          termino={busqueda || undefined}
          error={{ titulo: t('errorTitulo'), descripcion: error ?? undefined }}
          onReintentar={onReintentar}
        />
      )}
    </div>
  );
}
