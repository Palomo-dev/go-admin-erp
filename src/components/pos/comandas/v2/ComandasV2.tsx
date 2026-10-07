'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChefHat, History, Lock, Package, Plus, Printer, RefreshCw, Settings2, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AvisoTonal, EmptyState, PageHeader, RowActionsMenu, SegmentedControl, TabBar } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { KitchenTicket } from '@/lib/services/kitchenService';
import {
  agruparPorMesa,
  alergiaPendiente,
  armarTablero,
  aspectoEstacion,
  COLUMNAS,
  numerarRondas,
  type ColumnaComanda,
  type FiltroEstacion,
  type Movimiento,
} from '@/lib/pos/cocina/tableroComandas';
import { ESTACIONES_COCINA } from '@/lib/pos/estacionEfectiva';
import { leerEventosComanda, type EventoComanda } from '@/components/pos/cocina/cocinaCliente';
import { ComandaTarjeta, FilaEntregada, useTituloComanda, type AccionTarjeta } from './ComandaTarjeta';
import { ArrastreComandas, AsaEstatica, ColumnaSoltable, ComandaArrastrable, useAvisoRechazo } from './ArrastreComandas';
import { GrupoMesaTarjeta } from './GrupoMesaTarjeta';
import {
  CancelarComandaDialog,
  CerrarAnterioresDialog,
  ConfirmarAlergiaDialog,
  DetalleComandaDialog,
  DevolverComandaDialog,
  MoverItemDialog,
} from './DialogosComanda';
import { puntoEstacion, useNombreEstacion } from './estacionUi';
import type { ComandasTurno } from './useComandasTurno';

/**
 * Comandas v2 — modo Tablero (Figma 959:583914, 959:584798, 959:585351 y
 * estados 961:279128 / 961:279453 / 961:279778 / 961:280129; extensión de
 * pedidos web 1982:946792). Una fila de filtros (estación como pestañas con
 * contador, zona, «Comandas | Mesas»), columnas por estado sin paginación,
 * turno actual con aviso de las de días anteriores y ⋯ por tarjeta.
 */
export interface ComandasV2Props {
  turno: ComandasTurno;
  sedeNombre: string | null;
  timezone: string;
  sonido: boolean;
  onSonido: () => void;
  estacion: FiltroEstacion;
  onEstacion: (e: FiltroEstacion) => void;
  onPantallaCocina: () => void;
  onHistorial: () => void;
  onConfigurar: () => void;
}

export function ComandasV2({
  turno,
  sedeNombre,
  timezone,
  sonido,
  onSonido,
  estacion,
  onEstacion,
  onPantallaCocina,
  onHistorial,
  onConfigurar,
}: ComandasV2Props) {
  const t = useTranslations('posComandasV2');
  const nombreEstacion = useNombreEstacion();
  const [zona, setZona] = React.useState<string>('todas');
  const [vista, setVista] = React.useState<'comandas' | 'mesas'>('comandas');
  const [columnaMovil, setColumnaMovil] = React.useState<ColumnaComanda>('new');

  const [detalle, setDetalle] = React.useState<KitchenTicket | null>(null);
  const [eventos, setEventos] = React.useState<EventoComanda[]>([]);
  const [aCancelar, setACancelar] = React.useState<KitchenTicket | null>(null);
  const [aDevolver, setADevolver] = React.useState<KitchenTicket | null>(null);
  const [aMover, setAMover] = React.useState<KitchenTicket | null>(null);
  const [alergia, setAlergia] = React.useState<KitchenTicket | null>(null);
  const [anteriores, setAnteriores] = React.useState(false);
  const [trabajando, setTrabajando] = React.useState(false);

  const permisos = turno.permisos ?? { operar: true, gestionar: false };
  const sinPermiso = turno.permisos !== null && !turno.permisos.operar;
  const tablero = armarTablero(turno.tickets, { estacion, zona, ahora: turno.ahora });
  const rondas = numerarRondas(turno.tickets);
  const zonas = Array.from(new Set(turno.tickets.map((c) => c.table_sessions?.restaurant_tables?.zone).filter((z): z is string => !!z))).sort();
  const estaciones = Array.from(
    new Set([
      ...(ESTACIONES_COCINA as readonly string[]).filter((e) => aspectoEstacion(e).preparacion && e !== 'all'),
      ...Object.keys(tablero.porEstacion).filter((e) => e !== 'todas'),
    ]),
  );
  const totalTurno = turno.tickets.length;

  // Mantener el detalle al día con el tiempo real.
  const detalleVivo = detalle ? turno.tickets.find((c) => c.id === detalle.id) ?? detalle : null;
  React.useEffect(() => {
    if (!detalle) return;
    let vivo = true;
    leerEventosComanda(detalle.id)
      .then((r) => vivo && setEventos(r.eventos))
      .catch(() => vivo && setEventos([]));
    return () => {
      vivo = false;
    };
  }, [detalle, detalleVivo?.status, detalleVivo?.updated_at]);

  /** La acción del botón principal y de la flecha: un solo paso. */
  const onAccion = (c: KitchenTicket, accion: AccionTarjeta): Promise<boolean> => {
    if (accion === 'recibido') return Promise.resolve(false);
    return turno.cambiarEstado(c, accion, accion === 'delivered' || estacion === 'todas' ? null : estacion);
  };

  // ── Arrastrar entre columnas (Figma 2117:209496) ──
  const tituloDe = useTituloComanda();
  const ta = useTranslations('posComandasV2.arrastre');
  const motivoRechazo = useAvisoRechazo();
  const nombreColumna = (col: ColumnaComanda) => t(`columnas.tablero.${col}`);
  /** Soltar válido = la misma acción que la flecha (avanzar) o que «Devolver a Nuevas» (retroceder, con su confirmación). */
  const moverPorArrastre = async (c: KitchenTicket, mov: Extract<Movimiento, { ok: true }>) => {
    if (mov.sentido === 'retroceder') {
      setADevolver(c);
      return;
    }
    if (alergiaPendiente(c)) {
      setAlergia(c);
      return;
    }
    const ok = await onAccion(c, mov.estado as AccionTarjeta);
    // «Lista» ya tiene su propio aviso (con «Avisar al mesero»).
    if (ok && mov.estado !== 'ready') {
      turno.aviso({
        titulo: ta('movida', { titulo: tituloDe(c), columna: nombreColumna(mov.estado) }),
        descripcion: c.pedido_web ? ta('movidaWeb', { columna: nombreColumna(mov.estado) }) : ta('movidaDesc', { columna: nombreColumna(mov.estado) }),
        tono: 'exito',
      });
    }
  };
  const rechazarArrastre = (c: KitchenTicket, desde: ColumnaComanda, _hacia: ColumnaComanda, motivo: Parameters<typeof motivoRechazo>[1]) =>
    turno.aviso({ titulo: ta('noMovida', { titulo: tituloDe(c) }), descripcion: motivoRechazo(desde, motivo, nombreColumna), tono: 'advertencia' });

  const subtitulo = [
    sedeNombre,
    estacion !== 'todas' ? nombreEstacion(estacion) : null,
    t('cabecera.activas', { n: tablero.activas }),
    estacion === 'todas' ? t('cabecera.demoradas', { n: tablero.demoradas }) : null,
    estacion === 'todas' && tablero.tiempoMedio != null ? t('cabecera.tiempoMedio', { n: tablero.tiempoMedio }) : null,
    estacion !== 'todas' ? t('cabecera.objetivo', { n: aspectoEstacion(estacion).objetivo }) : null,
    estacion === 'todas' ? (sonido ? t('cabecera.sonidoActivado') : t('cabecera.sonidoApagado')) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const subtituloSimple = [sedeNombre, t('cabecera.turnoActual')].filter(Boolean).join(' · ');
  const mostrarTablero = !turno.cargando && !turno.error && !sinPermiso && totalTurno > 0;

  const menuPagina = [
    { id: 'historial', etiqueta: t('cabecera.historialComandas'), icono: History, onSelect: onHistorial },
    { id: 'estaciones', etiqueta: t('cabecera.configurarEstaciones'), icono: Settings2, onSelect: onConfigurar },
    { id: 'impresoras', etiqueta: t('cabecera.impresoras'), icono: Printer, onSelect: onConfigurar },
    { id: 'sonido', etiqueta: sonido ? t('cabecera.silenciar') : t('cabecera.activarSonido'), icono: sonido ? VolumeX : Volume2, onSelect: onSonido },
  ];

  const tarjeta = (c: KitchenTicket, col: ColumnaComanda, asa?: React.ReactNode) => (
    <ComandaTarjeta
      key={c.id}
      asa={asa}
      comanda={c}
      columna={col}
      estacion={estacion}
      densidad="tablero"
      ahora={turno.ahora}
      timezone={timezone}
      ronda={rondas.get(c.id) ?? null}
      permisos={permisos}
      ocupada={turno.ocupadas.has(c.id)}
      nueva={turno.nuevas.has(c.id)}
      onAccion={onAccion}
      onConfirmarAlergia={setAlergia}
      onItem={(cc, item, hecho) => void turno.marcarItem(cc, item, hecho)}
      onVer={setDetalle}
      onReimprimir={(cc) => void turno.reimprimir(cc)}
      onMover={setAMover}
      onDevolver={setADevolver}
      onCancelar={setACancelar}
    />
  );

  const cabeceraColumna = (col: ColumnaComanda) => (
    <div className="flex items-center gap-2 px-1.5 pb-2">
      <h2 className="text-sm font-semibold text-fg">{t(`columnas.tablero.${col}`)}</h2>
      <span className="rounded-full bg-surface px-1.5 text-[11px] font-semibold leading-[22px] text-fg-secondary">{tablero.columnas[col].length}</span>
      <span className="flex-1" />
      {col === 'new' && <span className="text-xs text-fg-muted">{t('columnas.demoradasPrimero')}</span>}
      {col === 'delivered' && <span className="text-xs text-fg-muted">{t('columnas.ultimos30')}</span>}
      {col !== 'new' && col !== 'delivered' && estacion !== 'todas' && (
        <span className="text-xs text-fg-muted">{t('columnas.objetivo', { n: aspectoEstacion(estacion).objetivo })}</span>
      )}
    </div>
  );

  const contenidoColumna = (col: ColumnaComanda, arrastrable = false) =>
    col === 'delivered' ? (
      <div className="space-y-2">
        {tablero.columnas.delivered.map((c) => (
          <FilaEntregada key={c.id} comanda={c} timezone={timezone} onVer={setDetalle} />
        ))}
        <button type="button" onClick={onHistorial} className="px-1.5 pt-1 text-[13px] font-medium text-link hover:underline">
          {t('columnas.verHistorial')}
        </button>
      </div>
    ) : (
      <div className="space-y-3">
        {tablero.columnas[col].map((c) =>
          arrastrable ? (
            <ComandaArrastrable
              key={c.id}
              comanda={c}
              columna={col}
              titulo={tituloDe(c)}
              deshabilitada={!permisos.operar || c.ticket_type === 'adjustment' || turno.ocupadas.has(c.id)}
            >
              {(asa) => tarjeta(c, col, asa)}
            </ComandaArrastrable>
          ) : (
            tarjeta(c, col)
          ),
        )}
      </div>
    );

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas px-4 pb-6 pt-4 sm:px-6 lg:px-6 lg:pt-6">
      <PageHeader
        titulo={t('cabecera.titulo')}
        subtitulo={mostrarTablero ? subtitulo : subtituloSimple}
        icono={ChefHat}
        cargando={turno.cargando}
        migas={[{ etiqueta: 'POS', href: '/app/pos' }, { etiqueta: t('cabecera.titulo') }]}
        acciones={
          <>
            <button
              type="button"
              onClick={() => void turno.recargar()}
              aria-label={t('cabecera.actualizar')}
              className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-10 px-0')}
            >
              <RefreshCw aria-hidden="true" className={cn('size-4', turno.cargando && 'animate-spin')} strokeWidth={1.5} />
            </button>
            <button type="button" onClick={onHistorial} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
              <History aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('cabecera.historial')}
            </button>
            <button type="button" onClick={onPantallaCocina} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('cabecera.pantallaCocina')}
            </button>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('cabecera.titulo')} acciones={menuPagina} />
          </>
        }
        movil={{
          subtitulo: [sedeNombre, t('cabecera.activas', { n: tablero.activas })].filter(Boolean).join(' · '),
          accion: (
            <RowActionsMenu
              orientacion="vertical"
              tamano="md"
              titulo={t('cabecera.titulo')}
              acciones={[
                { id: 'kds', etiqueta: t('cabecera.pantallaCocina'), icono: ChefHat, onSelect: onPantallaCocina },
                { id: 'actualizar', etiqueta: t('cabecera.actualizar'), icono: RefreshCw, onSelect: () => void turno.recargar() },
                ...menuPagina,
              ]}
            />
          ),
        }}
      />

      {turno.cargando ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          <div className="flex gap-3">
            {[90, 140, 120, 80, 100].map((w, i) => <div key={i} className="h-7 animate-pulse rounded-lg bg-subtle" style={{ width: w }} />)}
          </div>
          <div className="grid gap-3 lg:grid-cols-4">
            {COLUMNAS.map((c) => (
              <div key={c} className="h-[580px] rounded-xl bg-subtle p-2">
                <div className="h-[170px] rounded-xl bg-surface" />
                <div className="mt-3 h-[140px] rounded-xl bg-surface" />
              </div>
            ))}
          </div>
        </div>
      ) : sinPermiso ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <EmptyState
            variante="forbidden"
            icono={Lock}
            titulo={t('estados.sinPermisoTitulo')}
            descripcion={t('estados.sinPermisoDescripcion')}
            accion={{ etiqueta: t('estados.volverPos'), href: '/app/pos' }}
          />
        </div>
      ) : turno.error ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <EmptyState
            variante="error"
            titulo={t('estados.errorTitulo')}
            descripcion={t('estados.errorDescripcion')}
            accion={{ etiqueta: t('estados.reintentar'), onClick: () => void turno.recargar() }}
          />
        </div>
      ) : (
        <>
          {totalTurno > 0 && (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <TabBar
                id="estaciones"
                etiqueta={t('filtros.estaciones')}
                valor={estacion}
                onValorChange={onEstacion}
                className="min-w-0 flex-1"
                pestanas={[
                  { valor: 'todas', etiqueta: t('filtros.todas'), contador: tablero.porEstacion.todas ?? 0 },
                  ...estaciones.map((e) => ({
                    valor: e,
                    etiqueta: nombreEstacion(e),
                    contador: tablero.porEstacion[e] ?? 0,
                    punto: puntoEstacion(e),
                  })),
                ]}
              />
              <div className="hidden items-center gap-2 lg:flex">
                <Select value={zona} onValueChange={setZona}>
                  <SelectTrigger aria-label={t('filtros.zona')} className="h-8 w-[170px] text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">{t('filtros.zonaTodas')}</SelectItem>
                    {zonas.map((z) => (
                      <SelectItem key={z} value={z}>{t('filtros.zonaValor', { zona: z })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SegmentedControl
                  etiqueta={t('filtros.agrupar')}
                  valor={vista}
                  onValorChange={setVista}
                  opciones={[
                    { valor: 'comandas', etiqueta: t('filtros.comandas') },
                    { valor: 'mesas', etiqueta: t('filtros.mesas') },
                  ]}
                />
              </div>
            </div>
          )}

          {turno.vivasAnteriores > 0 && (
            <AvisoTonal
              tono="advertencia"
              compacto
              titulo={t('anteriores.aviso', { n: turno.vivasAnteriores })}
              accion={permisos.gestionar ? { etiqueta: t('anteriores.revisar'), onClick: () => setAnteriores(true) } : undefined}
            />
          )}

          {totalTurno === 0 ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <EmptyState icono={Package} titulo={t('estados.vacioTitulo')} descripcion={t('estados.vacioDescripcion')} />
            </div>
          ) : vista === 'mesas' ? (
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agruparPorMesa(
                turno.tickets.filter((c) => zona === 'todas' || c.table_sessions?.restaurant_tables?.zone === zona),
                estacion,
              ).map((g) => (
                <GrupoMesaTarjeta
                  key={g.clave}
                  grupo={g}
                  estacion={estacion}
                  rondas={rondas}
                  ahora={turno.ahora}
                  timezone={timezone}
                  puedeOperar={permisos.operar}
                  ocupada={g.pendiente ? turno.ocupadas.has(g.pendiente.id) : false}
                  onAccion={onAccion}
                  onConfirmarAlergia={setAlergia}
                  onVer={setDetalle}
                />
              ))}
            </div>
          ) : (
            <>
              {/* Móvil 390: una columna por estado con SegmentedControl (959:585351). */}
              <div className="flex flex-col gap-3 lg:hidden">
                <SegmentedControl
                  etiqueta={t('filtros.columna')}
                  className="self-start"
                  valor={columnaMovil}
                  onValorChange={setColumnaMovil}
                  opciones={(['new', 'preparing', 'ready'] as const).map((c) => ({
                    valor: c,
                    etiqueta: t(`columnas.movil.${c}`, { n: tablero.columnas[c].length }),
                  }))}
                />
                {contenidoColumna(columnaMovil)}
              </div>
              <ArrastreComandas
                permisos={permisos}
                titulo={tituloDe}
                nombreColumna={nombreColumna}
                onMover={(c, mov) => void moverPorArrastre(c, mov)}
                onRechazo={rechazarArrastre}
                renderLevantada={({ comanda, desde }) => (
                  tarjeta(comanda, desde, <AsaEstatica />)
                )}
              >
                <div className="hidden min-h-0 gap-3 lg:grid lg:grid-cols-4">
                  {COLUMNAS.map((col) => (
                    <ColumnaSoltable
                      key={col}
                      columna={col}
                      nombre={nombreColumna(col)}
                      cabecera={cabeceraColumna(col)}
                      className="flex max-h-[calc(100dvh-260px)] min-h-[560px] flex-col rounded-xl bg-subtle p-2 pt-3"
                    >
                      <div className="min-h-0 flex-1 overflow-y-auto">{contenidoColumna(col, true)}</div>
                    </ColumnaSoltable>
                  ))}
                </div>
              </ArrastreComandas>
            </>
          )}
        </>
      )}

      <DetalleComandaDialog
        comanda={detalleVivo}
        abierto={!!detalle}
        onAbiertoChange={(v) => !v && setDetalle(null)}
        eventos={eventos}
        timezone={timezone}
        ahora={turno.ahora}
        ronda={detalleVivo ? rondas.get(detalleVivo.id) ?? null : null}
        estacion={estacion}
        permisos={permisos}
        ocupada={detalleVivo ? turno.ocupadas.has(detalleVivo.id) : false}
        onAccion={(c, accion, station) => void turno.cambiarEstado(c, accion, station)}
        onItem={(c, item, hecho) => void turno.marcarItem(c, item, hecho)}
        onReimprimir={(c) => void turno.reimprimir(c)}
        onCancelar={(c) => {
          setDetalle(null);
          setACancelar(c);
        }}
      />
      <CancelarComandaDialog
        comanda={aCancelar}
        abierto={!!aCancelar}
        onAbiertoChange={(v) => !v && setACancelar(null)}
        ronda={aCancelar ? rondas.get(aCancelar.id) ?? null : null}
        cargando={trabajando}
        onConfirmar={async (motivo) => {
          if (!aCancelar) return;
          setTrabajando(true);
          const ok = await turno.cancelar(aCancelar, motivo);
          setTrabajando(false);
          if (ok) setACancelar(null);
        }}
      />
      <DevolverComandaDialog
        comanda={aDevolver}
        abierto={!!aDevolver}
        onAbiertoChange={(v) => !v && setADevolver(null)}
        ronda={aDevolver ? rondas.get(aDevolver.id) ?? null : null}
        cargando={trabajando}
        onConfirmar={async () => {
          if (!aDevolver) return;
          setTrabajando(true);
          const ok = await turno.devolver(aDevolver, estacion === 'todas' ? null : estacion);
          setTrabajando(false);
          if (ok) setADevolver(null);
        }}
      />
      <MoverItemDialog
        comanda={aMover}
        abierto={!!aMover}
        onAbiertoChange={(v) => !v && setAMover(null)}
        cargando={trabajando}
        onConfirmar={async (itemId, destino) => {
          if (!aMover) return;
          setTrabajando(true);
          const ok = await turno.mover(aMover, itemId, destino);
          setTrabajando(false);
          if (ok) setAMover(null);
        }}
      />
      <ConfirmarAlergiaDialog
        comanda={alergia}
        abierto={!!alergia}
        timezone={timezone}
        cargando={trabajando}
        onAbiertoChange={(v) => !v && setAlergia(null)}
        onConfirmar={async () => {
          if (!alergia) return;
          setTrabajando(true);
          const ok = await turno.confirmarAlergia(alergia, true);
          setTrabajando(false);
          if (ok) setAlergia(null);
        }}
      />
      <CerrarAnterioresDialog
        abierto={anteriores}
        onAbiertoChange={setAnteriores}
        cantidad={turno.vivasAnteriores}
        cargando={trabajando}
        onConfirmar={async (motivo) => {
          setTrabajando(true);
          const ok = await turno.cerrarAnteriores(motivo);
          setTrabajando(false);
          if (ok) setAnteriores(false);
        }}
      />
    </div>
  );
}
