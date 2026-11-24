'use client';

/**
 * Catálogo común › Historial como hoja lateral (Figma «23 Transporte» 2972:21903): «quién cambió
 * qué y cuándo», con lo que la base guarda (`eventosHistorial`). Reemplaza a `VehicleHistoryDialog`
 * y `DriverHistoryDialog` (pestañas Viajes/Manifiestos y Viajes/Estadísticas): los viajes completos
 * siguen en la pestaña «Viajes» de cada ficha.
 *
 * Se carga sola al abrirse: viajes (`transportService`), documentos también archivados y novedades
 * (`fichaCatalogoService`). Los viajes de una persona se buscan por su USUARIO (`trips.driver_id` →
 * auth.users).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/kit';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { supabase } from '@/lib/supabase/config';
import { transportService, type Trip, type Vehicle } from '@/lib/services/transportService';
import type { PersonaCatalogo } from '@/lib/services/transporte/catalogoComunService';
import { listarDocumentosHistorial, listarNovedadesFicha, type DocumentoHistorial, type NovedadFicha } from '@/lib/services/transporte/fichaCatalogoService';
import { eventosHistorial, type EventoHistorial } from '@/lib/transporte/fichaCatalogo';
import { leerBitacora } from '@/lib/transporte/formulariosCatalogo';
import { useTipoDocumento } from './TarjetasFicha';

export type ObjetivoHistorial = { de: 'vehiculo'; vehiculo: Vehicle } | { de: 'persona'; persona: PersonaCatalogo };

export interface HojaHistorialProps {
  objetivo: ObjetivoHistorial | null;
  organizationId: number | null;
  onCerrar: () => void;
  /** Nombre de la persona por usuario (viajes de un vehículo) o placa por vehículo (viajes de una persona). */
  nombreOtro?: (v: Trip) => string | null;
}

export function HojaHistorial({ objetivo, organizationId, onCerrar, nombreOtro }: HojaHistorialProps) {
  const t = useTranslations('catalogoComun.dialogos.historial');
  const tv = useTranslations('catalogoComun.vehiculos');
  const tViajes = useTranslations('catalogoComun.comun.ficha.viajes');
  const tipoDocumento = useTipoDocumento();
  const { formatDateTime, formatPlain } = useFormatDate();
  const [eventos, setEventos] = useState<EventoHistorial[] | null>(null);
  const [error, setError] = useState(false);

  const clave = objetivo ? `${objetivo.de}:${objetivo.de === 'vehiculo' ? objetivo.vehiculo.id : objetivo.persona.id}` : null;

  useEffect(() => {
    if (!objetivo || !organizationId) return;
    let cancelado = false;
    setEventos(null);
    setError(false);
    (async () => {
      try {
        const esVehiculo = objetivo.de === 'vehiculo';
        const userId = esVehiculo ? null : objetivo.persona.userId;
        const [viajes, docs] = await Promise.all([
          esVehiculo ? transportService.getVehicleTrips(objetivo.vehiculo.id) : userId ? transportService.getDriverTrips(userId) : Promise.resolve([] as Trip[]),
          listarDocumentosHistorial(supabase, organizationId, esVehiculo ? { vehicleId: objetivo.vehiculo.id } : { driverCredentialId: objetivo.persona.id }).catch(() => [] as DocumentoHistorial[]),
        ]);
        const novedades = await listarNovedadesFicha(supabase, organizationId, [
          ...(esVehiculo ? [{ tipo: 'vehicle' as const, ids: [objetivo.vehiculo.id] }] : []),
          { tipo: 'trip', ids: viajes.map((v) => v.id) },
        ]).catch(() => [] as NovedadFicha[]);
        if (cancelado) return;
        setEventos(
          eventosHistorial({
            bitacora: esVehiculo ? leerBitacora(objetivo.vehiculo.metadata) : [],
            documentos: docs,
            viajes,
            otroDeViaje: nombreOtro,
            novedades,
            creado: esVehiculo ? objetivo.vehiculo.created_at : objetivo.persona.credencial.created_at,
          }),
        );
      } catch {
        if (!cancelado) setError(true);
      }
    })();
    return () => {
      cancelado = true;
    };
    // `clave` identifica el objetivo; `nombreOtro` cambia en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, organizationId]);

  const nombre = objetivo ? (objetivo.de === 'vehiculo' ? objetivo.vehiculo.plate : objetivo.persona.nombre || '—') : '';
  const estadoTexto = (s: string | null) => (s && tv.has(`estados.${s}`) ? tv(`estados.${s}`) : s ?? '—');

  const texto = (e: EventoHistorial): { titulo: string; detalle: string | null } => {
    switch (e.tipo) {
      case 'estado':
        return { titulo: t('estado', { de: estadoTexto(e.de), a: estadoTexto(e.a) }), detalle: e.motivo };
      case 'conductor':
        return { titulo: e.a ? t('conductorAsignado', { nombre: e.a }) : t('conductorQuitado'), detalle: e.de ? t('antes', { nombre: e.de }) : t('antesNinguno') };
      case 'documento':
        return {
          titulo: t(e.archivado ? 'documentoArchivado' : 'documentoSubido', { documento: tipoDocumento(e.documento) }),
          detalle: e.vence ? t('vence', { fecha: formatPlain(e.vence) }) : null,
        };
      case 'despacho':
        return { titulo: t('despacho', { codigo: e.codigo }), detalle: e.otro ? `${tViajes(objetivo?.de === 'vehiculo' ? 'columnas.conductor' : 'columnas.vehiculo')}: ${e.otro}` : null };
      case 'novedad':
        return { titulo: t('novedad', { titulo: e.titulo }), detalle: null };
      case 'alta':
        return { titulo: objetivo?.de === 'vehiculo' ? t('altaVehiculo') : t('altaPersona'), detalle: null };
    }
  };

  return (
    <HojaDetalle abierto={!!objetivo} onAbiertoChange={(v) => !v && onCerrar()} titulo={t('titulo', { nombre })} subtitulo={t('subtitulo')}>
      {error ? (
        <EmptyState variante="error" compacto titulo={t('error')} />
      ) : eventos === null ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : eventos.length === 0 ? (
        <EmptyState compacto titulo={t('vacio')} />
      ) : (
        <ol className="flex flex-col gap-5" aria-label={t('titulo', { nombre })}>
          {eventos.map((e) => {
            const { titulo, detalle } = texto(e);
            return (
              <li key={e.id} className="flex gap-3">
                <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-fg">{titulo}</span>
                  {detalle && <span className="text-[13px] text-fg-secondary">{detalle}</span>}
                  <span className="text-xs text-fg-muted">{formatDateTime(e.at)}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-6 text-xs text-fg-muted">{t('nota')}</p>
    </HojaDetalle>
  );
}
