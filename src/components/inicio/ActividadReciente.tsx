'use client';

/**
 * «Actividad reciente» (Figma 445:137185, `447:73055`): cabecera con el
 * alcance y el periodo («Sucursal Principal · Hoy»), filtros Todo · Ventas ·
 * Facturas · Clientes · Inventario, lista con importes y paginación compacta
 * («1–4 de 15» + «Ir a»).
 *
 * Sustituye a `DashboardActividad`, que recibía las 15 últimas filas que el
 * navegador juntaba de cinco tablas SIN periodo ni permiso por módulo y
 * filtraba/paginaba en memoria. Ahora filtro y página van al servidor
 * (`GET /api/inicio/actividad` → `fn_inicio_actividad`), con la organización
 * de la sesión, el periodo y la sucursal del selector; los chips que se ven
 * son los tipos que la base dice que la persona puede ver.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeftRight, BedDouble, Receipt, ShoppingCart, UserPlus, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PaginationCompact } from '@/components/kit';
import { formatMoneda } from '@/lib/utils/moneda';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { queryPeriodo, type FechasPeriodo, type HorasPeriodo, type PeriodoInicio } from '@/lib/dashboard/periodo';
import {
  TAMANO_ACTIVIDAD,
  contextoActividad,
  filtrosVisibles,
  haceCuanto,
  leerActividad,
  queryActividad,
  tituloActividad,
  type Actividad,
  type FiltroActividad,
  type FilaActividad,
  type TipoActividad,
} from '@/lib/dashboard/actividadInicio';
import { cn } from '@/utils/Utils';
import { useLecturaInicio, type LecturaInicio } from './useLecturaInicio';

const ICONO: Record<TipoActividad, LucideIcon> = {
  venta: ShoppingCart,
  factura: Receipt,
  cliente: UserPlus,
  stock: ArrowLeftRight,
  reserva: BedDouble,
};

export interface ActividadRecienteProps {
  organizationId: number;
  periodo: PeriodoInicio;
  horas?: HorasPeriodo | null;
  fechas?: FechasPeriodo | null;
  sucursal: number | null;
  /** «Sucursal Principal · Hoy» a la derecha del título. */
  contexto?: string;
  version?: number;
  refresco?: number;
  onFalloRefresco?: () => void;
  onFase?: (fase: LecturaInicio<unknown>['fase']) => void;
  className?: string;
}

function Fila({ f, ahora }: { f: FilaActividad; ahora: Date }) {
  const t = useTranslations('home.actividad');
  const locale = useLocale();
  const { timezone } = useFormatDate();
  const Icono = ICONO[f.tipo];
  const titulo = tituloActividad(f);
  const contexto = contextoActividad(f);
  const hace = haceCuanto(f.fecha, ahora);
  const cuando =
    hace.clave === 'fecha'
      ? formatDateInTz(f.fecha, timezone, { locale, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
      : t(`hace.${hace.clave}`, { n: hace.n ?? 0 });
  const conImporte = (f.tipo === 'venta' || f.tipo === 'factura') && f.monto !== null && !!f.moneda;
  return (
    <li className="flex items-center gap-2.5 py-2" data-actividad={f.tipo}>
      <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium leading-5 text-fg">{t(titulo.clave, titulo.params)}</p>
        <p className="truncate text-xs leading-[18px] text-fg-secondary">
          {cuando}
          {contexto && <> · {t(contexto.clave, contexto.params)}</>}
        </p>
      </div>
      {conImporte && (
        <span className="shrink-0 text-sm font-medium leading-5 text-fg tabular-nums">
          {formatMoneda(f.monto as number, f.moneda as string, { decimals: 0 })}
        </span>
      )}
    </li>
  );
}

export function ActividadReciente({
  organizationId,
  periodo,
  horas,
  fechas,
  sucursal,
  contexto,
  version = 0,
  refresco,
  onFalloRefresco,
  onFase,
  className,
}: ActividadRecienteProps) {
  const t = useTranslations('home.actividad');
  const [filtro, setFiltro] = useState<FiltroActividad>('todo');
  const [pagina, setPagina] = useState(1);
  const periodoQs = queryPeriodo({ periodo, horas, fechas, sucursal });
  // Otro periodo o sucursal: vuelve a la primera página.
  useEffect(() => setPagina(1), [periodoQs]);
  const url = `/api/inicio/actividad?${periodoQs}&${queryActividad({ filtro, pagina })}`;
  const { estado, recargar } = useLecturaInicio<unknown>(url, organizationId, version, { refresco, onFalloRefresco });
  useEffect(() => onFase?.(estado.fase), [estado.fase, onFase]);

  const datos = useMemo(() => (estado.fase === 'listo' ? leerActividad(estado.datos) : null), [estado]);
  // El «ahora» del «hace N min» se fija con cada lectura, y los chips se
  // conservan mientras carga otra página o filtro (sin saltos).
  const [ahora, setAhora] = useState(() => new Date());
  const [chips, setChips] = useState<Pick<Actividad, 'tipos' | 'conteos'> | null>(null);
  useEffect(() => {
    setAhora(new Date());
    if (datos) setChips({ tipos: datos.tipos, conteos: datos.conteos });
  }, [datos]);

  if (estado.fase === 'sinPermiso') return null;

  const tiposChips = datos ?? chips;
  const elegir = (f: FiltroActividad) => {
    setFiltro(f);
    setPagina(1);
  };

  const chip = (activo: boolean) =>
    cn(
      'inline-flex h-[30px] items-center rounded-full border px-2.5 text-xs font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover hover:text-fg',
    );

  return (
    <section aria-labelledby="inicio-actividad-titulo" className={className ?? 'flex min-h-[368px] flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3.5'}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="inicio-actividad-titulo" className="text-base font-semibold leading-[22px] text-fg">
          {t('titulo')}
        </h2>
        <span className="flex-1" />
        {contexto && <span className="text-[13px] leading-[18px] text-fg-secondary">{contexto}</span>}
      </div>

      {tiposChips && tiposChips.tipos.length > 0 && (
        <div role="group" aria-label={t('filtrar')} className="flex flex-wrap gap-1.5">
          {filtrosVisibles(tiposChips).map((f) => (
            <button key={f} type="button" aria-pressed={filtro === f} className={chip(filtro === f)} onClick={() => elegir(f)}>
              {t(`filtros.${f}`)}
            </button>
          ))}
        </div>
      )}

      {estado.fase === 'cargando' ? (
        <div className="flex flex-1 flex-col gap-2" aria-busy="true">
          {Array.from({ length: TAMANO_ACTIVIDAD }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : estado.fase === 'error' ? (
        <EmptyState variante="error" compacto onReintentar={() => recargar(false)} />
      ) : datos && datos.filas.length > 0 ? (
        <>
          <ul className="flex flex-1 flex-col divide-y divide-line/60">
            {datos.filas.map((f) => (
              <Fila key={`${f.tipo}-${f.id}`} f={f} ahora={ahora} />
            ))}
          </ul>
          <PaginationCompact
            pagina={pagina}
            tamano={TAMANO_ACTIVIDAD}
            total={datos.total}
            onPaginaChange={setPagina}
          />
        </>
      ) : (
        <EmptyState compacto titulo={t('vacioTitulo')} descripcion={t('vacioDesc')} />
      )}
    </section>
  );
}
