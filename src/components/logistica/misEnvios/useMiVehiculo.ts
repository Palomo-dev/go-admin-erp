'use client';

/**
 * «Mi vehículo hoy» (Figma «11/12 Vehículo y documentos» y la tarjeta del computador): el vehículo
 * congelado en los envíos de la ruta (o el por defecto), su SOAT y tecnomecánica, la licencia del
 * domiciliario y, si hoy lo asignaron con excepción, quién la autorizó y por qué.
 *
 * Lee con el cliente del navegador (RLS): `vehicles` (miembros de la organización),
 * `driver_credentials` (el propio domiciliario) y la excepción guardada en sus envíos. El nombre
 * de quien autorizó sale de `fn_logistica_autorizadores`; si la base no se lo muestra, no se
 * muestra (nunca se inventa).
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { deliveryIntegrationService } from '@/lib/services/deliveryIntegrationService';
import { leerVehiculo, type EnvioApp, type VehiculoApp } from '@/lib/services/logistica/misEnviosService';
import {
  agruparMisEnvios,
  excepcionDeHoy,
  peorVigencia,
  vehiculoDelDia,
  vigenciaDocumento,
  type ExcepcionAsignacion,
  type VigenciaDocumento,
} from '@/lib/logistica/misEnvios';

export interface DocumentoVehiculo {
  clave: 'soat' | 'tecnomecanica' | 'licencia';
  vence: string | null;
  vigencia: VigenciaDocumento;
  /** Categoría de la licencia («A2»). */
  categoria?: string | null;
}

export interface MiVehiculo {
  estado: 'cargando' | 'listo' | 'error';
  vehiculo: VehiculoApp | null;
  porDefecto: boolean;
  enviosConPlaca: number;
  /** SOAT y tecnomecánica: solo si hay vehículo y no es de un tercero ni bici (la base no los revisa). */
  documentosVehiculo: DocumentoVehiculo[];
  licencia: DocumentoVehiculo | null;
  peor: VigenciaDocumento | null;
  excepcion: ExcepcionAsignacion | null;
  autorizoNombre: string | null;
}

interface DriverConLicencia {
  id: string;
  default_vehicle_id?: string | null;
  license_category?: string | null;
  license_expiry?: string | null;
}

export function useMiVehiculo(p: {
  orgId: number | null;
  driver: DriverConLicencia | null;
  envios: readonly EnvioApp[];
  hoy: string;
  zonaDe: (e: EnvioApp) => string;
}): MiVehiculo {
  const { orgId, driver, envios, hoy, zonaDe } = p;
  const grupos = useMemo(() => agruparMisEnvios(envios, hoy, zonaDe), [envios, hoy, zonaDe]);
  const { vehicleId, enviosConPlaca } = useMemo(() => vehiculoDelDia(grupos, driver?.default_vehicle_id), [grupos, driver?.default_vehicle_id]);
  const excepcion = useMemo(() => excepcionDeHoy(grupos, hoy, zonaDe), [grupos, hoy, zonaDe]);
  const [vehiculo, setVehiculo] = useState<VehiculoApp | null>(null);
  const [estado, setEstado] = useState<MiVehiculo['estado']>('cargando');
  const [autorizoNombre, setAutorizoNombre] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    if (!vehicleId) {
      setVehiculo(null);
      setEstado('listo');
      return;
    }
    let cancelado = false;
    leerVehiculo(supabase, orgId, vehicleId)
      .then((v) => {
        if (cancelado) return;
        setVehiculo(v);
        setEstado('listo');
      })
      .catch(() => !cancelado && setEstado('error'));
    return () => {
      cancelado = true;
    };
  }, [orgId, vehicleId]);

  useEffect(() => {
    if (!orgId || !excepcion?.autorizo) {
      setAutorizoNombre(null);
      return;
    }
    let cancelado = false;
    deliveryIntegrationService
      .getAutorizadoresAsignacion(orgId)
      .then((lista) => !cancelado && setAutorizoNombre(lista.find((a) => a.userId === excepcion.autorizo)?.nombre ?? null))
      .catch(() => !cancelado && setAutorizoNombre(null));
    return () => {
      cancelado = true;
    };
  }, [orgId, excepcion?.autorizo]);

  const revisaDocumentos = !!vehiculo && vehiculo.ownership !== 'third_party' && vehiculo.vehicle_type !== 'bicycle';
  const documentosVehiculo: DocumentoVehiculo[] = revisaDocumentos
    ? [
        { clave: 'soat', vence: vehiculo?.soat_expiry ?? null, vigencia: vigenciaDocumento(vehiculo?.soat_expiry, hoy) },
        { clave: 'tecnomecanica', vence: vehiculo?.techno_expiry ?? null, vigencia: vigenciaDocumento(vehiculo?.techno_expiry, hoy) },
      ]
    : [];
  const licencia: DocumentoVehiculo | null =
    driver && (driver.license_category || driver.license_expiry)
      ? { clave: 'licencia', vence: driver.license_expiry ?? null, vigencia: vigenciaDocumento(driver.license_expiry, hoy), categoria: driver.license_category ?? null }
      : null;

  return {
    estado: !orgId ? 'cargando' : estado,
    vehiculo,
    porDefecto: !!vehiculo && vehiculo.id === driver?.default_vehicle_id,
    enviosConPlaca,
    documentosVehiculo,
    licencia,
    peor: peorVigencia([...documentosVehiculo, ...(licencia ? [licencia] : [])].map((d) => d.vigencia)),
    excepcion,
    autorizoNombre,
  };
}
