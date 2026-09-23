'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
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
import { MOTIVO_NO_PUEDE_CERRAR, puedeCerrarCaja } from '@/lib/pos/cajas/reglasCierre';
import type { CashSession, CashSummary } from '../types';
import { cajaCoincide, dinero, dineroConSigno, haceCuanto } from '../historialCajas';
import { MOTIVO_CIERRE_CIEGO, Oculto, SucursalCaja } from './comunes';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';

type FiltroCajero = 'todas' | 'mias' | 'otros';

const ETIQUETA_FILTRO: Record<FiltroCajero, string> = {
  todas: 'Todas',
  mias: 'Mis cajas',
  otros: 'De otros cajeros',
};

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
        etiqueta: 'Ver detalle',
        icono: Eye,
        onSelect: () => irADetalle(s),
        deshabilitada: !showExpected,
        motivo: showExpected ? undefined : MOTIVO_CIERRE_CIEGO,
      },
      {
        id: 'cerrar',
        etiqueta: 'Cerrar caja',
        icono: Lock,
        onSelect: () => onCerrar(s),
        deshabilitada: !puedeCerrar,
        motivo: puedeCerrar ? undefined : MOTIVO_NO_PUEDE_CERRAR,
      },
    ];
  };

  const celdaResumen = (s: CashSession, pintar: (r: CashSummary) => ReactNode) => {
    const r = resumenes.get(s.id);
    return r ? pintar(r) : <Skeleton className="ml-auto h-4 w-16" />;
  };

  const columnas: ColumnaTabla<CashSession>[] = [
    { id: 'caja', encabezado: 'Caja', variante: 'mono', ancho: 80, celda: (s) => <span className="text-fg-secondary">#{s.id}</span> },
    {
      id: 'cajero',
      encabezado: 'Cajero',
      celda: (s) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{s.opened_by_name || 'Cajero'}</span>
          <span className="text-xs text-fg-secondary">{s.opened_by === userId ? 'Tu caja' : 'Cajero'}</span>
        </div>
      ),
    },
    { id: 'sucursal', encabezado: 'Sucursal', ocultarDebajo: 'xl', celda: (s) => <SucursalCaja sesion={s} /> },
    {
      id: 'abierta',
      encabezado: 'Abierta desde',
      celda: (s) => (
        <div className="flex flex-col whitespace-nowrap">
          <span className="tabular-nums">{formatDateTime(s.opened_at)}</span>
          <span className="text-xs text-fg-secondary">{haceCuanto(s.opened_at)}</span>
        </div>
      ),
    },
    { id: 'inicial', encabezado: 'Inicial', variante: 'importe', celda: (s) => <span className="font-medium">{dinero(s.initial_amount, moneda)}</span> },
    {
      id: 'ventas',
      encabezado: 'Ventas efectivo',
      variante: 'importe',
      ocultarDebajo: 'lg',
      celda: (s) =>
        celdaResumen(s, (r) => (
          <div className="flex flex-col items-end">
            <span className="font-medium">{dinero(r.sales_cash, moneda)}</span>
            <span className="text-xs text-fg-secondary">
              {r.sales_cash_count ?? 0} {(r.sales_cash_count ?? 0) === 1 ? 'venta' : 'ventas'}
            </span>
          </div>
        )),
    },
    {
      id: 'movimientos',
      encabezado: 'Movimientos',
      variante: 'importe',
      ocultarDebajo: 'lg',
      celda: (s) =>
        celdaResumen(s, (r) => {
          const n = (r.cash_in_count ?? 0) + (r.cash_out_count ?? 0);
          return (
            <div className="flex flex-col items-end">
              <span className="font-medium">{dineroConSigno(r.cash_in - r.cash_out, moneda)}</span>
              <span className="text-xs text-fg-secondary">
                {n} {n === 1 ? 'movimiento' : 'movimientos'}
              </span>
            </div>
          );
        }),
    },
    {
      id: 'esperado',
      encabezado: 'Esperado',
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
          placeholder="Buscar por cajero, sucursal o número de caja"
          etiqueta="Buscar cajas abiertas"
        />
      }
      filtros={
        <FilterPanel
          conteo={filtroCajero === 'todas' ? 0 : 1}
          onLimpiar={() => setFiltroCajero('todas')}
          textoVerResultados={`Ver ${filas.length} ${filas.length === 1 ? 'caja' : 'cajas'}`}
        >
          <FormField etiqueta="Cajero">
            {(c) => (
              <SegmentedControl
                aria-labelledby={c.idEtiqueta}
                anchoCompleto
                valor={filtroCajero}
                onValorChange={setFiltroCajero}
                opciones={(['todas', 'mias', 'otros'] as const).map((v) => ({ valor: v, etiqueta: ETIQUETA_FILTRO[v] }))}
              />
            )}
          </FormField>
        </FilterPanel>
      }
      chips={
        <FilterChips
          chips={filtroCajero === 'todas' ? [] : [{ clave: 'cajero', etiqueta: `Cajero: ${ETIQUETA_FILTRO[filtroCajero]}` }]}
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
          titulo="No hay cajas abiertas"
          descripcion={`Cuando un cajero abra caja en ${nombreSucursal} aparecerá aquí, con su monto inicial y el efectivo esperado.`}
          accionSecundaria={{ etiqueta: 'Ver historial', icono: History, onClick: onVerHistorial }}
          accion={onAbrirCaja ? { etiqueta: 'Abrir caja', icono: Plus, onClick: onAbrirCaja } : undefined}
        />
      ) : (
        <DataTable
          etiqueta="Cajas abiertas"
          columnas={columnas}
          filas={filas}
          obtenerId={(s) => String(s.id)}
          estado={estado}
          onFilaClick={showExpected ? irADetalle : undefined}
          etiquetaFila={(s) => `Caja #${s.id} de ${s.opened_by_name || 'cajero'}`}
          accionesRapidas={(s) => {
            const puedeCerrar = puedeCerrarCaja(s, userId, cerrarAjenas);
            return (
              <>
                <AccionRapida
                  soloIcono
                  etiqueta="Ver detalle"
                  icono={Eye}
                  onClick={() => irADetalle(s)}
                  deshabilitada={!showExpected}
                  motivo={showExpected ? undefined : MOTIVO_CIERRE_CIEGO}
                />
                <AccionRapida
                  etiqueta="Cerrar"
                  icono={Lock}
                  onClick={() => onCerrar(s)}
                  deshabilitada={!puedeCerrar}
                  motivo={puedeCerrar ? undefined : MOTIVO_NO_PUEDE_CERRAR}
                />
              </>
            );
          }}
          tarjetaMovil={(s) => (
            <ListCard
              icono={Banknote}
              titulo={`${s.opened_by_name || 'Cajero'} · #${s.id}`}
              subtitulo={`${s.branch_name ?? ''} · abierta ${haceCuanto(s.opened_at)}`}
              meta={s.opened_by === userId ? 'Tu caja' : `Inicial ${dinero(s.initial_amount, moneda)}`}
              valor={showExpected ? (resumenes.get(s.id) ? dinero(resumenes.get(s.id)?.expected_amount, moneda) : undefined) : undefined}
              estado={showExpected ? undefined : <Oculto />}
              onClick={showExpected ? () => irADetalle(s) : undefined}
              acciones={accionesDe(s)}
            />
          )}
          sinResultados={{ titulo: 'No hay cajas abiertas con estos filtros', descripcion: 'Prueba con otro cajero o quita un filtro.' }}
          onLimpiarFiltros={limpiar}
          termino={busqueda || undefined}
          error={{ titulo: 'No pudimos cargar las cajas abiertas', descripcion: error ?? undefined }}
          onReintentar={onReintentar}
        />
      )}
    </div>
  );
}
