'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import KitchenService, { type KitchenTicket, type KitchenTicketItem } from '@/lib/services/kitchenService';
import { playNotificationBeep } from '@/lib/utils/sound';
import { startOfDayInstant, todayInTz } from '@/lib/utils/dateCore';
import { imprimirComanda, textosImpresionDe } from '@/lib/pos/cocina/imprimirComanda';
import {
  aplicarEstadoLocal,
  aplicarItemLocal,
  estadoDerivado,
  type ColumnaComanda,
} from '@/lib/pos/cocina/tableroComandas';
import {
  avisarMesero,
  cambiarEstadoComanda,
  cancelarComanda,
  CocinaError,
  cerrarComandasAnteriores,
  confirmarAlergia,
  esRpcNoDisponible,
  leerPermisosCocina,
  marcarItemComanda,
  moverItemDeEstacion,
  type PermisosCocina,
} from '@/components/pos/cocina/cocinaCliente';

/**
 * Estado y acciones de Comandas v2 (tablero y pantalla de cocina) sobre los
 * mismos datos: el turno actual de la sede, en tiempo real.
 *
 * Escrituras por las rutas /api/pos/cocina/* (organización y permiso en el
 * servidor, estado derivado en la base). Si la migración de Comandas v2 aún no
 * está aplicada (`rpc_no_disponible`), se usa el camino anterior de
 * `KitchenService`, que ya existía. Sin conexión, las acciones quedan en cola y
 * se envían al volver (las RPC son idempotentes por comanda).
 */

type Aviso = (a: { titulo: string; descripcion?: string; tono?: 'error' | 'ok' | 'exito' | 'advertencia'; accion?: { etiqueta: string; onClick: () => void } }) => void;

type Pendiente =
  | { tipo: 'estado'; ticketId: number; estado: ColumnaComanda; station: string | null }
  | { tipo: 'item'; ticketId: number; itemId: number; hecho: boolean };

const CLAVE_COLA = 'goadmin.cocina.cola';

function leerCola(): Pendiente[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE_COLA);
    return crudo ? (JSON.parse(crudo) as Pendiente[]) : [];
  } catch {
    return [];
  }
}

function guardarCola(cola: Pendiente[]) {
  try {
    window.localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
  } catch {
    // sin almacenamiento: la cola vive solo en memoria
  }
}

export function inicioTurno(timezone: string): Date {
  return startOfDayInstant(todayInTz(timezone), timezone);
}

export function useComandasTurno({
  organizationId,
  branchId,
  timezone,
  aviso,
  sonido,
}: {
  organizationId: number | null | undefined;
  branchId: number | null;
  timezone: string;
  aviso: Aviso;
  sonido: boolean;
}) {
  const t = useTranslations('posComandasV2.avisos');
  const tCocina = useTranslations('posCocina');
  const [tickets, setTickets] = React.useState<KitchenTicket[]>([]);
  const [vivasAnteriores, setVivasAnteriores] = React.useState(0);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [permisos, setPermisos] = React.useState<PermisosCocina | null>(null);
  const [ahora, setAhora] = React.useState(() => new Date());
  const [ocupadas, setOcupadas] = React.useState<Set<number>>(new Set());
  const [nuevas, setNuevas] = React.useState<Set<number>>(new Set());
  const [enLinea, setEnLinea] = React.useState(true);
  const [sinConexionDesde, setSinConexionDesde] = React.useState<Date | null>(null);
  const [cola, setCola] = React.useState<Pendiente[]>([]);
  const conocidas = React.useRef<Set<number> | null>(null);
  const sonidoRef = React.useRef(sonido);
  sonidoRef.current = sonido;

  // Reloj de la pantalla (semáforo y minutos): cada 30 s.
  React.useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    let vivo = true;
    leerPermisosCocina()
      .then((p) => vivo && setPermisos(p))
      .catch(() => vivo && setPermisos({ operar: true, gestionar: false }));
    return () => {
      vivo = false;
    };
  }, [organizationId]);

  const cargar = React.useCallback(
    async (silencioso = false) => {
      if (!organizationId) return;
      if (!silencioso) setCargando(true);
      try {
        const desde = inicioTurno(timezone).toISOString();
        const entregadasDesde = new Date(Date.now() - 30 * 60_000).toISOString();
        const r = await KitchenService.getTableroTurno({ organizationId, branchId, desde, entregadasDesde });
        if (conocidas.current) {
          const recien = r.tickets.filter((tk) => tk.status === 'new' && !conocidas.current!.has(tk.id));
          if (recien.length > 0) {
            if (sonidoRef.current) playNotificationBeep();
            setNuevas(new Set(recien.map((x) => x.id)));
            window.setTimeout(() => setNuevas(new Set()), 3000);
            aviso({ titulo: t('nuevaComanda', { n: recien.length }) });
          }
        }
        conocidas.current = new Set(r.tickets.map((x) => x.id));
        setTickets(r.tickets);
        setVivasAnteriores(r.vivasAnteriores);
        setError(false);
      } catch (err) {
        console.error('[comandas] no se pudo cargar el turno', err);
        if (!silencioso) setError(true);
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    [organizationId, branchId, timezone, aviso, t],
  );

  React.useEffect(() => {
    conocidas.current = null;
    void cargar();
    if (!organizationId) return;
    const quitar = KitchenService.subscribeToKitchenTickets(organizationId, () => void cargar(true));
    return () => quitar();
  }, [organizationId, branchId, cargar]);

  const marcarOcupada = (id: number, si: boolean) =>
    setOcupadas((prev) => {
      const s = new Set(prev);
      if (si) s.add(id);
      else s.delete(id);
      return s;
    });

  const reemplazar = (id: number, f: (c: KitchenTicket) => KitchenTicket) =>
    setTickets((prev) => prev.map((c) => (c.id === id ? f(c) : c)));

  const errorDe = (err: unknown) =>
    err instanceof CocinaError && err.codigo === 'alergia_sin_confirmar'
      ? t('alergiaPendiente')
      : err instanceof CocinaError && err.codigo === 'comanda_sin_empezar'
        ? t('sinEmpezar')
        : t('errorEstado');

  // ── Envío (con cola sin conexión) ────────────────────────────────────────

  const enviarPendiente = React.useCallback(async (p: Pendiente) => {
    if (p.tipo === 'estado') {
      try {
        await cambiarEstadoComanda(p.ticketId, p.estado, { station: p.station });
      } catch (err) {
        if (!esRpcNoDisponible(err)) throw err;
        await KitchenService.updateTicketStatus(p.ticketId, p.estado);
      }
    } else {
      try {
        await marcarItemComanda(p.itemId, p.hecho);
      } catch (err) {
        if (!esRpcNoDisponible(err)) throw err;
        await KitchenService.updateItemStatus(p.itemId, p.hecho ? 'ready' : 'in_progress');
      }
    }
  }, []);

  const esFalloDeRed = (err: unknown) => err instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine);

  const encolar = (p: Pendiente) =>
    setCola((prev) => {
      const nueva = [...prev, p];
      guardarCola(nueva);
      return nueva;
    });

  // Al volver la red, se vacía la cola en orden.
  React.useEffect(() => {
    setCola(leerCola());
    const alCaer = () => {
      setEnLinea(false);
      setSinConexionDesde((d) => d ?? new Date());
    };
    const alVolver = async () => {
      setEnLinea(true);
      setSinConexionDesde(null);
      const pendientes = leerCola();
      for (const p of pendientes) {
        try {
          await enviarPendiente(p);
        } catch (err) {
          console.warn('[comandas] cambio en cola rechazado', err);
        }
      }
      guardarCola([]);
      setCola([]);
      void cargar(true);
    };
    if (typeof navigator !== 'undefined' && !navigator.onLine) alCaer();
    window.addEventListener('offline', alCaer);
    window.addEventListener('online', alVolver);
    return () => {
      window.removeEventListener('offline', alCaer);
      window.removeEventListener('online', alVolver);
    };
  }, [enviarPendiente, cargar]);

  // ── Acciones ────────────────────────────────────────────────────────────

  /** Optimista: pinta el estado nuevo y lo revierte si la base lo rechaza. Devuelve si quedó aplicado (o en cola). */
  const cambiarEstado = async (c: KitchenTicket, estado: ColumnaComanda, station: string | null): Promise<boolean> => {
    const antes = tickets;
    const ahoraIso = new Date().toISOString();
    reemplazar(c.id, (x) => aplicarEstadoLocal(x, estado, station, ahoraIso) as KitchenTicket);
    const p: Pendiente = { tipo: 'estado', ticketId: c.id, estado, station };
    if (!enLinea) {
      encolar(p);
      return true;
    }
    marcarOcupada(c.id, true);
    try {
      await enviarPendiente(p);
      if (estado === 'ready') {
        const mesa = c.table_sessions?.restaurant_tables?.name;
        aviso({
          titulo: t('comandaLista'),
          descripcion: mesa ? t('comandaListaMesa', { id: c.id, mesa }) : t('comandaListaSin', { id: c.id }),
          tono: 'ok',
          accion: c.table_session_id ? { etiqueta: t('avisarMesero'), onClick: () => void avisar(c) } : undefined,
        });
      }
      void cargar(true);
      return true;
    } catch (err) {
      if (esFalloDeRed(err)) {
        encolar(p);
        return true;
      }
      setTickets(antes);
      aviso({ titulo: t('errorTitulo'), descripcion: errorDe(err), tono: 'error' });
      return false;
    } finally {
      marcarOcupada(c.id, false);
    }
  };

  const marcarItem = async (c: KitchenTicket, item: KitchenTicketItem, hecho: boolean) => {
    const antes = tickets;
    reemplazar(c.id, (x) => aplicarItemLocal(x, item.id, hecho, new Date().toISOString()) as KitchenTicket);
    const p: Pendiente = { tipo: 'item', ticketId: c.id, itemId: item.id, hecho };
    if (!enLinea) {
      encolar(p);
      return;
    }
    try {
      try {
        await marcarItemComanda(item.id, hecho);
      } catch (err) {
        if (!esRpcNoDisponible(err)) throw err;
        // Camino anterior: el ítem y, si cambia, la comanda (como hacía la pantalla).
        await KitchenService.updateItemStatus(item.id, hecho ? 'ready' : 'in_progress');
        const items = (c.kitchen_ticket_items ?? []).map((i) => (i.id === item.id ? { ...i, status: hecho ? 'ready' : 'in_progress' } : i));
        const derivado = estadoDerivado(items);
        if (derivado && derivado !== c.status) await KitchenService.updateTicketStatus(c.id, derivado);
      }
      void cargar(true);
    } catch (err) {
      if (esFalloDeRed(err)) {
        encolar(p);
        return;
      }
      setTickets(antes);
      aviso({ titulo: t('errorTitulo'), descripcion: errorDe(err), tono: 'error' });
    }
  };

  const confirmarAlergiaDe = async (c: KitchenTicket, empezar: boolean) => {
    marcarOcupada(c.id, true);
    try {
      const r = await confirmarAlergia(c.id);
      reemplazar(c.id, (x) => ({ ...x, allergy_ack_at: r.allergy_ack_at, allergy_ack_by: r.allergy_ack_by }));
      aviso({ titulo: t('alergiaConfirmada', { id: c.id }), tono: 'ok' });
      if (empezar) await cambiarEstado({ ...c, allergy_ack_at: r.allergy_ack_at }, 'preparing', null);
      return true;
    } catch (err) {
      console.error('[comandas] alergia', err);
      aviso({ titulo: t('errorTitulo'), descripcion: t('errorAlergia'), tono: 'error' });
      return false;
    } finally {
      marcarOcupada(c.id, false);
    }
  };

  const imprimir = async (c: KitchenTicket, anulada = false) =>
    imprimirComanda(c, textosImpresionDe((k, v) => tCocina(k, v), t('anulada')), { anulada });

  const reimprimir = async (c: KitchenTicket) => {
    try {
      const { enqueued, skippedStations } = await imprimir(c);
      if (enqueued > 0) aviso({ titulo: t('reimpresionEnviada'), descripcion: t('reimpresionDesc', { n: enqueued }), tono: 'ok' });
      else aviso({ titulo: t('sinImpresora'), descripcion: t('sinImpresoraDesc', { estaciones: skippedStations.join(', ') }), tono: 'error' });
    } catch (err) {
      console.error('[comandas] reimprimir', err);
      aviso({ titulo: t('errorTitulo'), descripcion: t('errorReimprimir'), tono: 'error' });
    }
  };

  const cancelar = async (c: KitchenTicket, motivo: string) => {
    marcarOcupada(c.id, true);
    try {
      try {
        await cancelarComanda(c.id, motivo);
      } catch (err) {
        if (!esRpcNoDisponible(err)) throw err;
        await KitchenService.cancelTicketLegacy(c.id, motivo);
      }
      setTickets((prev) => prev.filter((x) => x.id !== c.id));
      void imprimir(c, true).catch(() => undefined);
      aviso({ titulo: t('cancelada', { id: c.id }), tono: 'ok' });
      return true;
    } catch (err) {
      console.error('[comandas] cancelar', err);
      aviso({ titulo: t('errorTitulo'), descripcion: err instanceof CocinaError && err.codigo === 'sin_permiso' ? t('sinPermiso') : t('errorCancelar'), tono: 'error' });
      return false;
    } finally {
      marcarOcupada(c.id, false);
    }
  };

  const devolver = async (c: KitchenTicket, station: string | null) => {
    marcarOcupada(c.id, true);
    const antes = tickets;
    reemplazar(c.id, (x) => ({
      ...x,
      status: 'new',
      kitchen_ticket_items: (x.kitchen_ticket_items ?? []).map((i) =>
        i.status === 'cancelled' || (station && (i.station || 'all') !== station) ? i : { ...i, status: 'pending' as const },
      ),
    }));
    try {
      try {
        await cambiarEstadoComanda(c.id, 'new', { station });
      } catch (err) {
        if (!esRpcNoDisponible(err)) throw err;
        await KitchenService.updateTicketStatus(c.id, 'new');
      }
      aviso({ titulo: t('devuelta', { id: c.id }), tono: 'ok' });
      void cargar(true);
      return true;
    } catch (err) {
      setTickets(antes);
      aviso({ titulo: t('errorTitulo'), descripcion: err instanceof CocinaError && err.codigo === 'sin_permiso' ? t('sinPermiso') : t('errorEstado'), tono: 'error' });
      return false;
    } finally {
      marcarOcupada(c.id, false);
    }
  };

  const mover = async (c: KitchenTicket, itemId: number, estacion: string) => {
    try {
      await moverItemDeEstacion(itemId, estacion);
      aviso({ titulo: t('movido'), tono: 'ok' });
      void cargar(true);
      return true;
    } catch (err) {
      aviso({
        titulo: t('errorTitulo'),
        descripcion: esRpcNoDisponible(err) ? t('pendienteMigracion') : t('errorMover'),
        tono: 'error',
      });
      return false;
    }
  };

  const avisar = async (c: KitchenTicket) => {
    try {
      const r = await avisarMesero(c.id);
      aviso({ titulo: r.avisado ? t('meseroAvisado') : t('sinMesero'), tono: r.avisado ? 'ok' : 'error' });
    } catch (err) {
      aviso({ titulo: t('errorTitulo'), descripcion: esRpcNoDisponible(err) ? t('pendienteMigracion') : t('errorAvisar'), tono: 'error' });
    }
  };

  const cerrarAnteriores = async (motivo: string) => {
    try {
      const r = await cerrarComandasAnteriores(branchId, inicioTurno(timezone).toISOString(), motivo);
      aviso({ titulo: t('anterioresCerradas', { n: r.cerradas }), tono: 'ok' });
      void cargar(true);
      return true;
    } catch (err) {
      aviso({
        titulo: t('errorTitulo'),
        descripcion: esRpcNoDisponible(err) ? t('pendienteMigracion') : err instanceof CocinaError && err.codigo === 'sin_permiso' ? t('sinPermiso') : t('errorCerrar'),
        tono: 'error',
      });
      return false;
    }
  };

  const pendientesPorComanda = React.useMemo(() => new Set(cola.map((p) => p.ticketId)), [cola]);

  return {
    tickets,
    vivasAnteriores,
    cargando,
    error,
    permisos,
    ahora,
    ocupadas,
    nuevas,
    enLinea,
    sinConexionDesde,
    cola,
    pendientesPorComanda,
    recargar: () => cargar(),
    aviso,
    cambiarEstado,
    marcarItem,
    confirmarAlergia: confirmarAlergiaDe,
    reimprimir,
    cancelar,
    devolver,
    mover,
    avisar,
    cerrarAnteriores,
  };
}

export type ComandasTurno = ReturnType<typeof useComandasTurno>;
