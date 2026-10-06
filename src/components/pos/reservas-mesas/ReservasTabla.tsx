'use client';

/**
 * POS › Reservas de mesas › Lista (Figma 1701:865814 «lista con reservas de la
 * web» y 1982:948175 «"no ha llegado", no-show y completada»; estados
 * 452:223729 cargando, 452:224182 vacío por filtros, 452:224559 error):
 * - 6 KPI del rango: En el rango (comensales), Solicitudes web (esperan
 *   confirmación), Confirmadas, Sentadas (en sala ahora), No se presentó (% del
 *   rango) y Canceladas;
 * - buscador + «Filtros» (estado, origen y fechas) con su contador;
 * - aviso «no ha llegado» con Llamar · Esperar 15 min · No se presentó;
 * - tabla del kit (Hora, Cliente, Personas, Mesa, Origen, Estado, ⋯) con la
 *   solicitud web resaltada y la paginación única del kit.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarCheck, CheckCircle, Edit, MapPin, Phone, Trash2, Undo2, UserCheck, UserX, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CampoFecha,
  DataTable,
  FilterPanel,
  FormField,
  KpiStrip,
  Pagination,
  SearchInput,
  StatCard,
  type AccionFila,
  type ColumnaTabla,
  type OrdenListado,
} from '@/components/kit';
import { cn } from '@/utils/Utils';
import { formatMoneda } from '@/lib/utils/moneda';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { resumenDeposito } from '@/lib/services/restaurante/depositoReserva';
import type { RestaurantReservation, ReservationSource, ReservationStatus, VentaDeReserva } from './reservasMesasService';
import { debeAvisarRetraso, enlaceTelefono, minutosDeRetraso, MINUTOS_TOLERANCIA_LLEGADA } from './retrasoReserva';
import { claveOrigen, esSolicitudWeb, estadoFila, horaCorta, kpisLista, ordenarReservas, pagina, type TonoEstado } from './reservasVista';

export interface FiltrosLista {
  estado: ReservationStatus | 'all';
  origen: ReservationSource | 'all';
  desde: string;
  hasta: string;
}

export interface AccionesReserva {
  onEditar: (r: RestaurantReservation) => void;
  onRevisarSolicitud: (r: RestaurantReservation) => void;
  onAsignarMesa: (r: RestaurantReservation) => void;
  onSentar: (r: RestaurantReservation) => void;
  onCompletar: (r: RestaurantReservation) => void;
  onNoShow: (r: RestaurantReservation) => void;
  onCancelar: (r: RestaurantReservation) => void;
  onEliminar: (r: RestaurantReservation) => void;
  onReembolsarDeposito?: (r: RestaurantReservation) => void;
}

interface Props extends AccionesReserva {
  reservations: readonly RestaurantReservation[];
  isLoading: boolean;
  error?: boolean;
  onReintentar: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  filtros: FiltrosLista;
  onFiltrosChange: (f: FiltrosLista) => void;
  filtrosPorDefecto: FiltrosLista;
  ventas?: ReadonlyMap<string, VentaDeReserva>;
  inasistencias?: ReadonlyMap<string, number>;
  ahora: Date;
  zonaDe: (branchId: number) => string;
  resaltada?: string | null;
  /** «Esperar 15 min»: persiste `arrival_wait_until`; null si aún no hay columna. */
  onEsperar: (r: RestaurantReservation, minutos: number) => Promise<string | null>;
}

const PUNTO: Record<TonoEstado, string> = {
  aviso: 'bg-warning',
  info: 'bg-info',
  exito: 'bg-success',
  neutro: 'bg-fg-muted',
  peligro: 'bg-danger',
};

export function ReservasTabla(props: Props) {
  const {
    reservations,
    isLoading,
    error,
    onReintentar,
    search,
    onSearchChange,
    filtros,
    onFiltrosChange,
    filtrosPorDefecto,
    ventas,
    inasistencias,
    ahora,
    zonaDe,
    onEsperar,
  } = props;
  const t = useTranslations('posReservasMesas.lista');
  const te = useTranslations('posReservasMesas.estadoFila');
  const tor = useTranslations('posReservasMesas.origenes');
  const tes = useTranslations('posReservasMesas.estados');
  const monedaOrg = useMonedaOrganizacion();
  const [numPagina, setNumPagina] = useState(1);
  const [tamano, setTamano] = useState(20);
  const [pospuestas, setPospuestas] = useState<Record<string, number>>({});

  const [orden, setOrden] = useState<OrdenListado | null>(null);
  const filas = useMemo(() => ordenarReservas(reservations, orden), [reservations, orden]);
  const k = useMemo(() => kpisLista(filas), [filas]);
  const visibles = useMemo(() => pagina(filas, numPagina, tamano), [filas, numPagina, tamano]);

  const conteoFiltros =
    (filtros.estado !== 'all' ? 1 : 0) +
    (filtros.origen !== 'all' ? 1 : 0) +
    (filtros.desde !== filtrosPorDefecto.desde || filtros.hasta !== filtrosPorDefecto.hasta ? 1 : 0);

  const pospuestaDe = (r: RestaurantReservation): number | null => {
    const guardada = r.arrival_wait_until ? Date.parse(r.arrival_wait_until) : NaN;
    const local = pospuestas[r.id];
    if (Number.isFinite(guardada)) return Math.max(guardada, local ?? 0);
    return local ?? null;
  };
  const retrasoDe = (r: RestaurantReservation) =>
    debeAvisarRetraso(r, ahora, zonaDe(r.branch_id), pospuestaDe(r)) ? minutosDeRetraso(r, ahora, zonaDe(r.branch_id)) : null;
  const tarde = filas.find((r) => retrasoDe(r) != null) ?? null;

  const esperar = async (r: RestaurantReservation) => {
    setPospuestas((p) => ({ ...p, [r.id]: Date.now() + MINUTOS_TOLERANCIA_LLEGADA * 60_000 }));
    try {
      await onEsperar(r, MINUTOS_TOLERANCIA_LLEGADA);
    } catch {
      /* queda pospuesta en esta pantalla; la página muestra el error */
    }
  };

  const textoEstado = (r: RestaurantReservation) => {
    const e = estadoFila(r, {
      retrasoMin: retrasoDe(r),
      venta: ventas?.get(r.id)?.numero ?? null,
      inasistencias: r.customer_id ? inasistencias?.get(r.customer_id) : 0,
    });
    const dep = resumenDeposito(r, ahora);
    return { e, texto: te(e.clave, e.valores), dep };
  };

  const columnas: ColumnaTabla<RestaurantReservation>[] = [
    {
      id: 'hora',
      encabezado: t('columnas.hora'),
      ordenable: true,
      ancho: 110,
      celda: (r) => <span className="tabular-nums">{horaCorta(r.reservation_time)}</span>,
    },
    { id: 'cliente', encabezado: t('columnas.cliente'), ordenable: true, celda: (r) => <span className="font-normal text-fg">{r.customer_name}</span> },
    { id: 'personas', encabezado: t('columnas.personas'), ordenable: true, ancho: 100, celda: (r) => <span className="tabular-nums">{r.party_size}</span> },
    {
      id: 'mesa',
      ordenable: true,
      encabezado: t('columnas.mesa'),
      ocultarDebajo: 'md',
      celda: (r) => (r.restaurant_table ? [r.restaurant_table.name, r.restaurant_table.zone].filter(Boolean).join(' · ') : t('sinMesa')),
    },
    {
      id: 'origen',
      ordenable: true,
      encabezado: t('columnas.origen'),
      ancho: 130,
      ocultarDebajo: 'lg',
      celda: (r) => {
        const o = claveOrigen(r.source);
        return (
          <Badge tono={o === 'web' ? 'marca' : 'neutro'} apariencia="suave" tamano="sm">
            {tor(o)}
          </Badge>
        );
      },
    },
    {
      id: 'estado',
      ordenable: true,
      encabezado: t('columnas.estado'),
      celda: (r) => {
        const { e, texto, dep } = textoEstado(r);
        return (
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', PUNTO[e.tono])} />
              <span className="truncate">{texto}</span>
            </span>
            {dep && (
              <span
                className={cn(
                  'truncate pl-4 text-xs',
                  dep.tono === 'peligro' ? 'text-danger-text' : dep.tono === 'aviso' ? 'text-warning-text' : 'text-fg-secondary',
                )}
              >
                {dep.etiqueta}
                {dep.monto != null && ` · ${formatMoneda(dep.monto, dep.moneda ?? monedaOrg)}`}
              </span>
            )}
          </span>
        );
      },
    },
  ];

  const acciones = (r: RestaurantReservation): AccionFila[] => {
    const abierta = ['pending', 'confirmed'].includes(r.status);
    const dep = resumenDeposito(r, ahora);
    return [
      { id: 'editar', etiqueta: t('menu.editar'), icono: Edit, onSelect: () => props.onEditar(r) },
      {
        id: 'confirmar',
        etiqueta: esSolicitudWeb(r) ? t('menu.revisarSolicitud') : t('menu.confirmar'),
        icono: CheckCircle,
        onSelect: () => props.onRevisarSolicitud(r),
        oculta: r.status !== 'pending',
      },
      { id: 'asignar', etiqueta: t('menu.asignarMesa'), icono: MapPin, onSelect: () => props.onAsignarMesa(r), oculta: !abierta },
      {
        id: 'sentar',
        etiqueta: t('menu.sentar'),
        icono: UserCheck,
        onSelect: () => props.onSentar(r),
        oculta: !abierta,
        deshabilitada: !r.restaurant_table_id,
        motivo: !r.restaurant_table_id ? t('menu.sentarSinMesa') : undefined,
      },
      { id: 'completar', etiqueta: t('menu.completar'), icono: CalendarCheck, onSelect: () => props.onCompletar(r), oculta: r.status !== 'seated' },
      {
        id: 'reembolso',
        etiqueta: t('menu.reembolsarDeposito'),
        icono: Undo2,
        onSelect: () => props.onReembolsarDeposito?.(r),
        oculta: !props.onReembolsarDeposito || !dep?.puedeReembolsar,
      },
      { id: 'noShow', etiqueta: t('menu.noShow'), icono: UserX, onSelect: () => props.onNoShow(r), oculta: r.status !== 'confirmed', separadorAntes: true },
      { id: 'cancelar', etiqueta: t('menu.cancelar'), icono: XCircle, onSelect: () => props.onCancelar(r), oculta: !abierta, destructiva: true },
      { id: 'eliminar', etiqueta: t('menu.eliminar'), icono: Trash2, onSelect: () => props.onEliminar(r), destructiva: true },
    ];
  };

  const estadoTabla = error ? 'error' : isLoading ? 'cargando' : filas.length === 0 && (search || conteoFiltros > 0) ? 'sinResultados' : 'listo';
  const tel = tarde ? enlaceTelefono(tarde.customer_phone) : null;

  return (
    <div className="space-y-4">
      {/* Sin cifras si falló la carga (no mostramos ceros falsos) ni en el celular (Figma 452:226972). */}
      {!error && (
        <div className="max-sm:hidden">
          <KpiStrip columnas={6} etiqueta={t('resumen')} className="lg:grid-cols-3 xl:grid-cols-6">
            <StatCard tamano="sm" cargando={isLoading} etiqueta={t('kpi.enElRango')} valor={k.total} detalle={t('kpi.comensales', { n: k.comensales })} />
            <StatCard
              tamano="sm"
              cargando={isLoading}
              etiqueta={t('kpi.solicitudesWeb')}
              valor={k.solicitudesWeb}
              tono={k.solicitudesWeb > 0 ? 'advertencia' : 'neutro'}
              iconoDetalle={k.solicitudesWeb > 0 ? AlertTriangle : undefined}
              detalle={k.solicitudesWeb > 0 ? t('kpi.esperanConfirmacion') : undefined}
              onClick={k.solicitudesWeb > 0 ? () => onFiltrosChange({ ...filtros, estado: 'pending', origen: 'website' }) : undefined}
            />
            <StatCard tamano="sm" cargando={isLoading} etiqueta={t('kpi.confirmadas')} valor={k.confirmadas} />
            <StatCard
              tamano="sm"
              cargando={isLoading}
              etiqueta={t('kpi.sentadas')}
              valor={k.sentadas}
              tono={k.sentadas > 0 ? 'exito' : 'neutro'}
              iconoDetalle={k.sentadas > 0 ? ArrowUp : undefined}
              detalle={k.sentadas > 0 ? t('kpi.enSala') : undefined}
            />
            <StatCard
              tamano="sm"
              cargando={isLoading}
              etiqueta={t('kpi.noShow')}
              valor={k.noShow}
              tono={k.noShow > 0 ? 'peligro' : 'neutro'}
              iconoDetalle={k.noShow > 0 ? ArrowDown : undefined}
              detalle={k.noShow > 0 ? t('kpi.pctRango', { pct: k.pctNoShow.toLocaleString('es-CO') }) : undefined}
            />
            <StatCard tamano="sm" cargando={isLoading} etiqueta={t('kpi.canceladas')} valor={k.canceladas} />
          </KpiStrip>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <SearchInput value={search} onChange={onSearchChange} placeholder={t('buscar')} />
        </div>
        <FilterPanel conteo={conteoFiltros} onLimpiar={() => onFiltrosChange(filtrosPorDefecto)} titulo={t('filtros.titulo')}>
          <div className="space-y-4">
            <FormField etiqueta={t('filtros.estado')}>
              {(c) => (
                <Select value={filtros.estado} onValueChange={(v) => onFiltrosChange({ ...filtros, estado: v as FiltrosLista['estado'] })}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filtros.todos')}</SelectItem>
                    {(['pending', 'confirmed', 'seated', 'completed', 'no_show', 'cancelled'] as const).map((s) => (
                      <SelectItem key={s} value={s}>
                        {tes(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.origen')}>
              {(c) => (
                <Select value={filtros.origen} onValueChange={(v) => onFiltrosChange({ ...filtros, origen: v as FiltrosLista['origen'] })}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filtros.todos')}</SelectItem>
                    {(['website', 'phone', 'whatsapp', 'admin'] as const).map((s) => (
                      <SelectItem key={s} value={s}>
                        {tor(claveOrigen(s))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('filtros.desde')}>
                <CampoFecha valor={filtros.desde} onValorChange={(v) => onFiltrosChange({ ...filtros, desde: v })} />
              </FormField>
              <FormField etiqueta={t('filtros.hasta')}>
                <CampoFecha valor={filtros.hasta} onValorChange={(v) => onFiltrosChange({ ...filtros, hasta: v })} />
              </FormField>
            </div>
          </div>
        </FilterPanel>
      </div>

      {tarde && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle px-4 py-3 text-[13px] leading-[18px] text-warning-text lg:flex-row lg:items-center lg:justify-between"
        >
          <span>
            {t('tarde.texto', {
              nombre: tarde.customer_name,
              hora: horaCorta(tarde.reservation_time),
              n: tarde.party_size,
              mesa: tarde.restaurant_table ? [tarde.restaurant_table.name, tarde.restaurant_table.zone].filter(Boolean).join(' · ') : t('sinMesa'),
              min: retrasoDe(tarde) ?? 0,
            })}
          </span>
          <span className="flex shrink-0 flex-wrap gap-2">
            {tel && (
              <Button asChild size="sm" variant="outline" className="bg-surface">
                <a href={tel}>
                  <Phone className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t('tarde.llamar')}
                </a>
              </Button>
            )}
            <Button size="sm" variant="outline" className="bg-surface" onClick={() => void esperar(tarde)}>
              {t('tarde.esperar', { min: MINUTOS_TOLERANCIA_LLEGADA })}
            </Button>
            <Button size="sm" variant="outline" className="bg-surface" onClick={() => props.onNoShow(tarde)}>
              {t('tarde.noShow')}
            </Button>
          </span>
        </div>
      )}

      <DataTable
        etiqueta={t('etiquetaTabla')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(r) => r.id}
        orden={orden}
        onOrdenar={(campo) => {
          setNumPagina(1);
          setOrden((o) => (o?.campo !== campo ? { campo, direccion: 'asc' } : o.direccion === 'asc' ? { campo, direccion: 'desc' } : null));
        }}
        estado={estadoTabla}
        onFilaClick={(r) => (r.status === 'pending' ? props.onRevisarSolicitud(r) : props.onEditar(r))}
        etiquetaFila={(r) => `${horaCorta(r.reservation_time)} · ${r.customer_name}`}
        acciones={acciones}
        tonoFila={(r) => (esSolicitudWeb(r) ? 'advertencia' : undefined)}
        atributosFila={(r) => ({ 'data-reserva': r.id })}
        onReintentar={onReintentar}
        onLimpiarFiltros={() => {
          onSearchChange('');
          onFiltrosChange(filtrosPorDefecto);
        }}
        termino={search}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
        sinResultados={{ titulo: t('sinResultados.titulo'), descripcion: t('sinResultados.descripcion') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        tarjetaMovil={(r) => {
          const { e, texto } = textoEstado(r);
          return (
            <div className="flex flex-col gap-1">
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium text-fg">
                  {horaCorta(r.reservation_time)} · {r.customer_name}
                </span>
                <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', PUNTO[e.tono])} />
              </span>
              <span className="text-xs text-fg-secondary">
                {t('movil.detalle', {
                  n: r.party_size,
                  mesa: r.restaurant_table ? r.restaurant_table.name : t('sinMesa'),
                  origen: tor(claveOrigen(r.source)),
                })}
              </span>
              <span className="text-xs text-fg-secondary">{texto}</span>
            </div>
          );
        }}
        pie={
          !isLoading && !error && filas.length > 0 ? (
            <Pagination
              pagina={numPagina}
              tamano={tamano}
              total={filas.length}
              onPaginaChange={setNumPagina}
              onTamanoChange={(n) => {
                setTamano(n);
                setNumPagina(1);
              }}
              opcionesTamano={[10, 20, 50]}
              sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.varios'), genero: 'femenino' }}
            />
          ) : undefined
        }
      />
    </div>
  );
}
