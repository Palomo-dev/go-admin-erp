'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Lock, Minimize2, Package, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { EmptyState } from '@/components/kit';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import type { KitchenTicket } from '@/lib/services/kitchenService';
import {
  armarTablero,
  aspectoEstacion,
  numerarRondas,
  type ColumnaComanda,
} from '@/lib/pos/cocina/tableroComandas';
import { ComandaTarjeta, useTituloComanda, type AccionTarjeta } from './ComandaTarjeta';
import { ConfirmarAlergiaDialog } from './DialogosComanda';
import { EstacionChip, useNombreEstacion } from './estacionUi';
import { inicioTurno, type ComandasTurno } from './useComandasTurno';

/**
 * Modo Cocina (KDS) — Figma 960:278237 y estados 960:278490 (alergia),
 * 960:278809 (sin conexión), 960:279084 (vacío), 960:279168 (sin permiso).
 * Tablet horizontal a pantalla completa, oscuro por variables (`dark`), una
 * estación, tres columnas con desplazamiento propio y un toque por tarjeta.
 */
const COLUMNAS_KDS: readonly ColumnaComanda[] = ['new', 'preparing', 'ready'];

export function PantallaCocina({
  turno,
  estacion,
  estaciones,
  onEstacion,
  onSalir,
  timezone,
  sonido,
  onSonido,
}: {
  turno: ComandasTurno;
  estacion: string;
  estaciones: string[];
  onEstacion: (e: string) => void;
  onSalir: () => void;
  timezone: string;
  sonido: boolean;
  onSonido: () => void;
}) {
  const t = useTranslations('posComandasV2.kds');
  const tc = useTranslations('posComandasV2.columnas');
  const nombreEstacion = useNombreEstacion();
  const tituloKds = useTituloComanda();
  const [alergia, setAlergia] = React.useState<KitchenTicket | null>(null);
  const [confirmando, setConfirmando] = React.useState(false);
  const [reloj, setReloj] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setReloj(new Date()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const sinPermiso = turno.permisos !== null && !turno.permisos.operar;
  const tablero = armarTablero(turno.tickets, { estacion, ahora: turno.ahora });
  const rondas = numerarRondas(turno.tickets);
  const activas = tablero.columnas.new.length + tablero.columnas.preparing.length + tablero.columnas.ready.length;
  const objetivo = aspectoEstacion(estacion).objetivo;
  const permisos = turno.permisos ?? { operar: true, gestionar: false };

  // «Entregar» en la cocina: la tarjeta se oculta a los 60 s y hasta entonces
  // se puede deshacer (Figma 960:278237). El cambio se envía al vencer el plazo
  // o al salir de la pantalla.
  const [porEntregar, setPorEntregar] = React.useState<Record<number, number>>({});
  const temporizadores = React.useRef<Record<number, number>>({});
  const turnoRef = React.useRef(turno);
  turnoRef.current = turno;
  const entregarYa = React.useCallback((c: KitchenTicket) => {
    window.clearTimeout(temporizadores.current[c.id]);
    delete temporizadores.current[c.id];
    setPorEntregar((p) => {
      const n = { ...p };
      delete n[c.id];
      return n;
    });
    void turnoRef.current.cambiarEstado(c, 'delivered', null);
  }, []);
  const pendientesRef = React.useRef<Record<number, KitchenTicket>>({});
  React.useEffect(
    () => () => {
      // Al salir, lo que quedaba por entregar se entrega.
      Object.values(pendientesRef.current).forEach((c) => {
        window.clearTimeout(temporizadores.current[c.id]);
        void turnoRef.current.cambiarEstado(c, 'delivered', null);
      });
    },
    [],
  );
  const hayPorEntregar = Object.keys(porEntregar).length > 0;
  React.useEffect(() => {
    if (!hayPorEntregar) return;
    const id = window.setInterval(() => setReloj(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [hayPorEntregar]);

  const onAccion = (c: KitchenTicket, accion: AccionTarjeta) => {
    if (accion === 'recibido') return;
    if (accion === 'delivered') {
      pendientesRef.current[c.id] = c;
      setPorEntregar((p) => ({ ...p, [c.id]: Date.now() + 60_000 }));
      temporizadores.current[c.id] = window.setTimeout(() => {
        delete pendientesRef.current[c.id];
        entregarYa(c);
      }, 60_000);
      return;
    }
    void turno.cambiarEstado(c, accion, estacion);
  };
  const deshacerEntrega = (c: KitchenTicket) => {
    window.clearTimeout(temporizadores.current[c.id]);
    delete temporizadores.current[c.id];
    delete pendientesRef.current[c.id];
    setPorEntregar((p) => {
      const n = { ...p };
      delete n[c.id];
      return n;
    });
  };

  const conexion = (
    <span className={cn('flex items-center gap-1.5 text-[13px]', turno.enLinea ? 'text-fg-secondary' : 'text-danger-text')}>
      <span aria-hidden="true" className={cn('size-2 rounded-full', turno.enLinea ? 'bg-success' : 'bg-danger')} />
      {turno.enLinea ? t('enLinea') : t('sinConexion')}
    </span>
  );
  const botones = (
    <>
      <button
        type="button"
        onClick={onSonido}
        aria-pressed={sonido}
        aria-label={sonido ? t('silenciar') : t('activarSonido')}
        className="flex size-10 items-center justify-center rounded-lg border border-line-strong text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {sonido ? <Volume2 aria-hidden="true" className="size-5" strokeWidth={1.5} /> : <VolumeX aria-hidden="true" className="size-5" strokeWidth={1.5} />}
      </button>
      <button
        type="button"
        onClick={onSalir}
        aria-label={t('salir')}
        className="flex size-10 items-center justify-center rounded-lg border border-line-strong text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Minimize2 aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </button>
    </>
  );

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col bg-canvas text-fg" role="region" aria-label={t('titulo')}>
      <header className="flex h-[63px] shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        {sinPermiso ? (
          <h1 className="text-base font-semibold">{t('titulo')}</h1>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t('cambiarEstacion')}
                className="flex h-[42px] items-center gap-1.5 rounded-full border border-line-strong bg-canvas py-1 pl-1 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <EstacionChip clave={estacion} tamano="md" className="bg-white text-red-700" />
                <ChevronDown aria-hidden="true" className="size-4 text-fg-secondary" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="dark min-w-[220px] border-line bg-surface text-fg">
                {estaciones.map((e) => (
                  <DropdownMenuItem key={e} onSelect={() => onEstacion(e)} className="gap-2 py-2">
                    <EstacionChip clave={e} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="truncate text-[13px] text-fg-secondary">
              {t('resumen', { n: activas, objetivo })}
            </p>
          </>
        )}
        <span className="flex-1" />
        {conexion}
        <span className="text-2xl font-semibold tabular-nums">{formatTimeInTz(reloj, timezone)}</span>
        {botones}
      </header>

      {!turno.enLinea && (
        <div role="status" className="flex shrink-0 items-start gap-2.5 bg-warning-subtle px-4 py-2.5 text-sm font-medium text-warning-text">
          <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
          <span>
            {t('bandaSinConexion', {
              hora: formatTimeInTz(turno.sinConexionDesde ?? new Date(), timezone),
              n: turno.cola.length,
            })}
          </span>
        </div>
      )}

      {sinPermiso ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            variante="forbidden"
            icono={Lock}
            titulo={t('sinPermisoTitulo')}
            descripcion={t('sinPermisoDescripcion')}
            accion={{ etiqueta: t('volverTablero'), onClick: onSalir }}
          />
        </div>
      ) : turno.cargando ? (
        <div className="grid flex-1 grid-cols-3 gap-4 p-4" aria-busy="true">
          {COLUMNAS_KDS.map((c) => (
            <div key={c} className="rounded-xl bg-subtle p-3">
              <div className="h-5 w-24 animate-pulse rounded bg-hover" />
              <div className="mt-3 h-64 animate-pulse rounded-xl bg-surface" />
            </div>
          ))}
        </div>
      ) : activas === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icono={Package}
            titulo={t('vacioTitulo', { estacion: nombreEstacion(estacion) })}
            descripcion={t('vacioDescripcion', { hora: formatTimeInTz(inicioTurno(timezone), timezone) })}
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 p-4">
          {COLUMNAS_KDS.map((col) => (
            <section key={col} aria-label={tc(`kds.${col}`)} className="flex min-h-0 flex-col rounded-xl bg-subtle">
              <h2 className="flex items-baseline gap-2 px-3 pb-2 pt-3 text-[15px] font-semibold">
                {tc(`kds.${col}`)}
                <span className="font-medium text-fg-muted">{tablero.columnas[col].length}</span>
              </h2>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
                {tablero.columnas[col].map((c) => porEntregar[c.id] ? (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-fg-secondary">{tituloKds(c)}</p>
                      <p className="text-xs text-fg-muted">
                        {t('entregadaPendiente', { s: Math.max(0, Math.ceil((porEntregar[c.id] - reloj.getTime()) / 1000)) })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deshacerEntrega(c)}
                      className="h-10 rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {t('deshacer')}
                    </button>
                  </div>
                ) : (
                  <ComandaTarjeta
                    key={c.id}
                    comanda={c}
                    columna={col}
                    estacion={estacion}
                    densidad="kds"
                    ahora={turno.ahora}
                    timezone={timezone}
                    ronda={rondas.get(c.id) ?? null}
                    permisos={permisos}
                    pendienteEnvio={turno.pendientesPorComanda.has(c.id)}
                    ocupada={turno.ocupadas.has(c.id)}
                    nueva={turno.nuevas.has(c.id)}
                    onAccion={onAccion}
                    onConfirmarAlergia={setAlergia}
                    onItem={(cc, item, hecho) => void turno.marcarItem(cc, item, hecho)}
                  />
                ))}
                {col === 'ready' && <p className="px-1 text-xs text-fg-muted">{t('entregadasSeOcultan')}</p>}
              </div>
            </section>
          ))}
        </div>
      )}

      <ConfirmarAlergiaDialog
        comanda={alergia}
        abierto={!!alergia}
        oscuro
        timezone={timezone}
        cargando={confirmando}
        onAbiertoChange={(v) => !v && setAlergia(null)}
        onConfirmar={async () => {
          if (!alergia) return;
          setConfirmando(true);
          const ok = await turno.confirmarAlergia(alergia, true);
          setConfirmando(false);
          if (ok) setAlergia(null);
        }}
      />
    </div>
  );
}

