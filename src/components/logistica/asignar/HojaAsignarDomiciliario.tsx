'use client';

/**
 * «Asignar N envíos» (Figma «21 Logística», hoja lateral 2800:8231). La usan Por despachar (uno
 * o varios envíos), el detalle del envío y Pedidos online (`AssignDeliveryDialog`): una sola pieza.
 *
 * Asignar NO exige vehículo: llama `assignVehicleAndDriver(id, vehículo | null, domiciliario)`,
 * que es la RPC `logistica_asignar_domiciliario` (docs/logistica/FASE1-CIMIENTOS.md). La base
 * valida el estado, el domiciliario y la sede; aquí solo se elige.
 *
 * La carga y el estado de cada domiciliario salen de `cargaDelDia` y `estadoDomiciliario`
 * (domiciliarios.ts), la misma regla que la pantalla Domiciliarios.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, Search, UserPlus } from 'lucide-react';
import { AvatarIniciales, StatusBadge, clasesBoton } from '@/components/kit';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess, toastWarning } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { supabase } from '@/lib/supabase/config';
import { startOfDayInstant } from '@/lib/utils/dateCore';
import { cn } from '@/utils/Utils';
import {
  deliveryIntegrationService,
  EnvioError,
  type DeliveryDriver,
  type DeliveryVehicle,
} from '@/lib/services/deliveryIntegrationService';
import { enviosDeDomiciliarios, type EnvioDeCargaConDomiciliario } from '@/lib/services/logistica/despachoService';
import { ordenSugeridoRuta, resumenSeleccion, type FilaDespacho } from '@/lib/logistica/despacho';
import {
  cargaDelDia,
  cobraContraentrega,
  estadoDomiciliario,
  nombreDomiciliario,
  TONO_ESTADO_DOMICILIARIO,
  type CargaDelDia,
  type EstadoDomiciliario,
} from '@/lib/logistica/domiciliarios';
import { normalizarTexto } from '@/lib/logistica/presentacionEnvio';
import { RUTAS_LOGISTICA } from '@/lib/logistica/rutas';

export interface ResultadoAsignacion {
  asignados: string[];
  fallidos: { id: string; codigo: string }[];
  domiciliarioId: string;
  imprimir: boolean;
}

export interface HojaAsignarDomiciliarioProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number;
  envios: readonly FilaDespacho[];
  /** Nombre de la sede para el subtítulo («Sede Centro · salen hoy…»). */
  sede?: string | null;
  /** Imprimir guías: lo hace quien abre la hoja (mismo generador de Envíos). */
  onImprimirGuias?: (envios: readonly FilaDespacho[], domiciliario: { nombre: string; telefono?: string | null }) => void;
  onAsignado?: (r: ResultadoAsignacion) => void;
}

interface OpcionDomiciliario {
  driver: DeliveryDriver & { metadata?: Record<string, unknown> | null; branch_id?: number | null };
  nombre: string;
  carga: CargaDelDia;
  estado: EstadoDomiciliario;
  porCobrar: number;
  cobraContraentrega: boolean;
}

export function HojaAsignarDomiciliario({
  abierto,
  onAbiertoChange,
  organizationId,
  envios,
  sede,
  onImprimirGuias,
  onAsignado,
}: HojaAsignarDomiciliarioProps) {
  const t = useTranslations('logistica.despacho.asignar');
  const moneda = useMonedaOrganizacion();
  const { timezone, getToday, formatTime } = useFormatDate();

  const [drivers, setDrivers] = useState<OpcionDomiciliario[] | null>(null);
  const [vehiculos, setVehiculos] = useState<DeliveryVehicle[]>([]);
  const [errorCarga, setErrorCarga] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<string | null>(null);
  const [vehiculo, setVehiculo] = useState<string>('ninguno');
  const [imprimir, setImprimir] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const ruta = useMemo(() => ordenSugeridoRuta(resumenSeleccion(envios).asignables), [envios]);
  const resumen = useMemo(() => resumenSeleccion(ruta), [ruta]);
  const noAsignables = useMemo(() => resumenSeleccion(envios).noAsignables, [envios]);

  useEffect(() => {
    if (!abierto || !organizationId) return;
    let cancelado = false;
    setDrivers(null);
    setErrorCarga(false);
    const hoy = getToday();
    const inicio = startOfDayInstant(hoy, timezone).toISOString();
    Promise.all([
      deliveryIntegrationService.getAvailableDrivers(organizationId),
      deliveryIntegrationService.getAvailableVehicles(organizationId).catch(() => [] as DeliveryVehicle[]),
      enviosDeDomiciliarios(supabase, organizationId, inicio).catch(() => [] as EnvioDeCargaConDomiciliario[]),
    ])
      .then(([lista, vehs, carga]) => {
        if (cancelado) return;
        const porDriver = new Map<string, EnvioDeCargaConDomiciliario[]>();
        for (const e of carga) porDriver.set(e.driver_id, [...(porDriver.get(e.driver_id) ?? []), e]);
        const opciones = (lista as OpcionDomiciliario['driver'][]).map((d) => {
          const suyos = porDriver.get(d.id) ?? [];
          const c = cargaDelDia(suyos, hoy, timezone);
          const pendienteCobro =
            suyos
              .filter((e) => ['assigned', 'ready', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery'].includes(e.status))
              .reduce((s, e) => s + Math.round((Number(e.cod_amount) || 0) * 100), 0) / 100;
          return {
            driver: d,
            nombre: nombreDomiciliario(d) || t('sinNombre'),
            carga: c,
            estado: estadoDomiciliario(d, c, hoy, timezone),
            porCobrar: pendienteCobro,
            cobraContraentrega: cobraContraentrega(d.metadata),
          };
        });
        // Libres primero, luego en ruta, luego fuera de turno; a igual estado, menos carga.
        const peso: Record<EstadoDomiciliario, number> = { libre: 0, en_ruta: 1, fuera_de_turno: 2, inactivo: 3 };
        opciones.sort((a, b) => peso[a.estado] - peso[b.estado] || a.carga.asignados - b.carga.asignados || a.nombre.localeCompare(b.nombre));
        setDrivers(opciones);
        setVehiculos(vehs);
        const actual = envios.length === 1 ? envios[0].domiciliarioId : null;
        setElegido(actual && opciones.some((o) => o.driver.id === actual) ? actual : null);
        setVehiculo(envios.length === 1 && envios[0].vehiculoId ? envios[0].vehiculoId : 'ninguno');
      })
      .catch(() => !cancelado && setErrorCarga(true));
    return () => {
      cancelado = true;
    };
    // `envios` cambia de identidad en cada render del padre: basta con abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, organizationId, timezone]);

  const visibles = useMemo(() => {
    const q = normalizarTexto(busqueda);
    return (drivers ?? []).filter((o) => !q || normalizarTexto(o.nombre).includes(q));
  }, [drivers, busqueda]);

  const opcionElegida = drivers?.find((o) => o.driver.id === elegido) ?? null;

  const motivoNoElegible = (o: OpcionDomiciliario): string | null => {
    if (o.estado === 'inactivo') return t('motivos.inactivo');
    if (!o.cobraContraentrega && resumen.conContraentrega > 0)
      return t('motivos.noCobra', { n: resumen.conContraentrega, total: resumen.asignables.length });
    return null;
  };

  const asignar = async () => {
    if (!opcionElegida || ruta.length === 0) return;
    const veh = vehiculo === 'ninguno' ? null : vehiculo;
    // Las guías se abren ANTES de los await para no perder el gesto (el navegador bloquea la
    // ventana si se abre después); llevan el domiciliario elegido.
    if (imprimir && onImprimirGuias) onImprimirGuias(ruta, { nombre: opcionElegida.nombre, telefono: opcionElegida.driver.phone });
    setOcupado(true);
    const asignados: string[] = [];
    const fallidos: { id: string; codigo: string }[] = [];
    for (const e of ruta) {
      try {
        await deliveryIntegrationService.assignVehicleAndDriver(e.id, veh, opcionElegida.driver.id);
        asignados.push(e.id);
      } catch (err) {
        fallidos.push({ id: e.id, codigo: err instanceof EnvioError ? err.codigo : 'ERROR' });
      }
    }
    setOcupado(false);
    if (asignados.length > 0) toastSuccess(t('toast.asignados', { count: asignados.length, nombre: opcionElegida.nombre }));
    if (fallidos.length > 0) {
      const codigo = fallidos[0].codigo;
      const motivo = t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.ERROR');
      (asignados.length > 0 ? toastWarning : toastError)(t('toast.fallidos', { count: fallidos.length }), motivo);
    }
    onAsignado?.({ asignados, fallidos, domiciliarioId: opcionElegida.driver.id, imprimir });
    if (fallidos.length === 0) onAbiertoChange(false);
  };

  const fmt = moneda.formatear;
  const titulo = t('titulo', { count: ruta.length });
  const subtitulo = [sede, resumen.contraentrega > 0 ? t('subtituloCobro', { monto: fmt(resumen.contraentrega) }) : t('subtituloSinCobro')]
    .filter(Boolean)
    .join(' · ');

  return (
    <HojaDetalle
      abierto={abierto}
      onAbiertoChange={(v) => !ocupado && onAbiertoChange(v)}
      titulo={titulo}
      subtitulo={subtitulo}
      ancho={560}
      ocupado={ocupado}
      pie={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            {opcionElegida ? (
              <>
                <p className="truncate font-medium text-fg">{t('pie.llevara', { nombre: opcionElegida.nombre, count: ruta.length })}</p>
                <p className="truncate text-xs text-fg-muted">
                  {resumen.contraentrega > 0 ? t('pie.cobrara', { monto: fmt(resumen.contraentrega) }) : t('pie.nadaPorCobrar')}
                </p>
              </>
            ) : (
              <p className="text-fg-muted">{t('pie.elige')}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)} disabled={ocupado}>
              {t('cancelar')}
            </button>
            <button
              type="button"
              className={clasesBoton({ variante: 'primario' })}
              onClick={() => void asignar()}
              disabled={!opcionElegida || ruta.length === 0 || ocupado || !!(opcionElegida && motivoNoElegible(opcionElegida))}
              title={!opcionElegida ? t('pie.elige') : undefined}
            >
              {ocupado ? t('asignando') : t('confirmar', { count: ruta.length })}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {noAsignables.length > 0 && (
          <AvisoTonal tono="advertencia" titulo={t('noAsignables', { count: noAsignables.length })} descripcion={noAsignables.map((e) => e.numero).join(', ')} compacto />
        )}

        <section aria-labelledby="asignar-ruta" className="flex flex-col gap-2">
          <h3 id="asignar-ruta" className="text-base font-semibold text-fg">
            {t('ruta.titulo')}
          </h3>
          <p className="text-xs text-fg-muted">{t('ruta.ayuda', { sede: sede ?? t('laSede') })}</p>
          <ol className="flex flex-col gap-2">
            {ruta.map((e, i) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-fg-secondary">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{[e.pedido ?? e.numero, e.barrio].filter(Boolean).join(' · ')}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {[e.direccion, e.promesa ? t('ruta.promesa', { hora: formatTime(e.promesa) }) : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <StatusBadge
                  estado={e.contraentrega > 0 ? 'pending' : 'paid'}
                  tono={e.contraentrega > 0 ? 'advertencia' : 'exito'}
                  etiqueta={e.contraentrega > 0 ? t('ruta.contraentrega') : t('ruta.pagado')}
                />
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="asignar-domiciliario" className="flex flex-col gap-2">
          <h3 id="asignar-domiciliario" className="text-base font-semibold text-fg">
            {t('domiciliario.titulo')}
          </h3>
          <label className="relative block">
            <span className="sr-only">{t('domiciliario.buscar')}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" strokeWidth={1.5} />
            <input
              type="search"
              value={busqueda}
              onChange={(ev) => setBusqueda(ev.target.value)}
              placeholder={t('domiciliario.buscar')}
              className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </label>

          {errorCarga ? (
            <AvisoTonal tono="peligro" titulo={t('domiciliario.errorCarga')} compacto />
          ) : drivers === null ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-muted" />
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <AvisoTonal
              tono="advertencia"
              titulo={t('domiciliario.ninguno')}
              descripcion={t('domiciliario.ningunoAyuda')}
              accion={{ etiqueta: t('domiciliario.registrar'), href: `${RUTAS_LOGISTICA.domiciliarios}?nuevo=1` }}
            />
          ) : (
            <div role="radiogroup" aria-label={t('domiciliario.titulo')} className="flex flex-col gap-2">
              {visibles.map((o) => {
                const motivo = motivoNoElegible(o);
                const activo = elegido === o.driver.id;
                return (
                  <button
                    key={o.driver.id}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    disabled={!!motivo}
                    onClick={() => setElegido(o.driver.id)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
                      activo ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn('mt-3 size-4 shrink-0 rounded-full border', activo ? 'border-[5px] border-brand' : 'border-line-strong')}
                    />
                    <AvatarIniciales nombre={o.nombre} tamano="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-fg">{o.nombre}</span>
                        <StatusBadge estado={o.estado} tono={TONO_ESTADO_DOMICILIARIO[o.estado]} etiqueta={t(`estados.${o.estado}`)} />
                      </span>
                      <span className="block truncate text-xs text-fg-muted">
                        {o.driver.vehicle_type ? t(`vehiculos.${o.driver.vehicle_type}`) : t('vehiculos.sin')}
                      </span>
                      <span className="block truncate text-xs text-fg-secondary">
                        {o.porCobrar > 0
                          ? t('domiciliario.cargaConCobro', { count: o.carga.asignados, monto: fmt(o.porCobrar) })
                          : t('domiciliario.carga', { count: o.carga.asignados })}
                      </span>
                      {motivo && <span className="block text-xs text-warning-text">{motivo}</span>}
                    </span>
                  </button>
                );
              })}
              {visibles.length === 0 && <p className="text-sm text-fg-muted">{t('domiciliario.sinCoincidencias')}</p>}
            </div>
          )}
          <Link href={`${RUTAS_LOGISTICA.domiciliarios}?nuevo=1`} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'self-start')}>
            <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('domiciliario.registrar')}
          </Link>
        </section>

        <section aria-labelledby="asignar-vehiculo" className="flex flex-col gap-2">
          <h3 id="asignar-vehiculo" className="flex items-center gap-2 text-base font-semibold text-fg">
            {t('vehiculo.titulo')}
            <StatusBadge estado="opcional" tono="neutro" etiqueta={t('vehiculo.opcional')} />
          </h3>
          <Select value={vehiculo} onValueChange={setVehiculo}>
            <SelectTrigger aria-labelledby="asignar-vehiculo" className="h-10 border-line-strong bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ninguno">{t('vehiculo.ninguno')}</SelectItem>
              {vehiculos.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {[v.plate, t.has(`vehiculos.${v.vehicle_type}`) ? t(`vehiculos.${v.vehicle_type}`) : v.vehicle_type].join(' · ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-fg-muted">{t('vehiculo.ayuda')}</p>
        </section>

        <section className="flex flex-col gap-3">
          {onImprimirGuias && (
            <label className="flex items-center gap-3 text-sm text-fg">
              <Checkbox checked={imprimir} onCheckedChange={(v) => setImprimir(v === true)} />
              {t('opciones.imprimir', { count: ruta.length })}
            </label>
          )}
          <p className="flex items-start gap-2 text-xs text-fg-muted">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            {resumen.conContraentrega > 0 ? t('opciones.avisoYCodigo') : t('opciones.aviso')}
          </p>
        </section>
      </div>
    </HojaDetalle>
  );
}
