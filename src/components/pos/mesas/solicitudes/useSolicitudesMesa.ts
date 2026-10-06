'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aplicarEvento, deLaSede, resumenPorMesa, type SolicitudMesa } from './solicitudesMesaLogica';
import { atenderSolicitud, listarSolicitudesPendientes, suscribirSolicitudes } from './solicitudesMesaService';

/**
 * Solicitudes pendientes de la Carta QR para POS › Mesas y la cuenta de una
 * mesa: carga inicial, tiempo real (INSERT llama a `onNueva` para el toast) y
 * «Voy» / «Atendida» con actualización optimista.
 */
export function useSolicitudesMesa(sedeId: number | null, onNueva?: (s: SolicitudMesa) => void) {
  const avisoRef = useRef(onNueva);
  avisoRef.current = onNueva;
  const [lista, setLista] = useState<SolicitudMesa[]>([]);
  const [disponible, setDisponible] = useState(true);
  const [version, setVersion] = useState(0);
  const [enCurso, setEnCurso] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelado = false;
    listarSolicitudesPendientes(sedeId)
      .then((r) => {
        if (cancelado) return;
        setDisponible(r.disponible);
        setLista(r.solicitudes);
      })
      .catch((error) => {
        // Sin solicitudes la pantalla sigue siendo útil.
        console.error('Error cargando solicitudes de mesa:', error);
      });
    return () => {
      cancelado = true;
    };
  }, [sedeId, version]);

  useEffect(() => {
    if (!disponible) return;
    return suscribirSolicitudes((evento) => {
      if (evento.tipo === 'INSERT' && evento.solicitud.estado === 'open') avisoRef.current?.(evento.solicitud);
      setLista((l) => aplicarEvento(l, evento));
    }, sedeId);
  }, [sedeId, disponible]);

  const atender = useCallback(async (s: SolicitudMesa, estado: 'ack' | 'done') => {
    setEnCurso((c) => new Set(c).add(s.id));
    const anterior = s;
    setLista((l) => aplicarEvento(l, { tipo: 'UPDATE', solicitud: { ...s, estado, vistaEn: s.vistaEn ?? new Date().toISOString() } }));
    try {
      await atenderSolicitud(s.id, estado);
    } catch (error) {
      setLista((l) => aplicarEvento(l, { tipo: 'UPDATE', solicitud: anterior }));
      throw error;
    } finally {
      setEnCurso((c) => {
        const n = new Set(c);
        n.delete(s.id);
        return n;
      });
    }
  }, []);

  const visibles = useMemo(() => deLaSede(lista, sedeId), [lista, sedeId]);
  const porMesa = useMemo(() => resumenPorMesa(visibles), [visibles]);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return { solicitudes: visibles, porMesa, disponible, atender, enCurso, recargar };
}
