/**
 * Estado de la factura electrónica para la sección del cobro (POS-PLAN paso
 * 12, E-30): si el servicio de GO Admin no está activo para la organización,
 * la sección se muestra deshabilitada con el motivo en vez de dejar marcar un
 * envío que no va a salir.
 *
 * Lee `electronic_invoicing_config` con las columnas que la sesión puede ver
 * (`is_active`, `service_status`; las credenciales nunca). Mismo criterio que
 * `servicioActivo` de `colaFacturacion.server.ts`, sin la columna de
 * credenciales, que el navegador no ve: el servidor sigue siendo quien decide
 * al encolar. Si la consulta falla (sin red), el estado es desconocido y la
 * sección NO se bloquea: se conserva el comportamiento de antes.
 */

export type EstadoFacturaElectronica = 'activa' | 'pendiente' | 'suspendida' | 'noConfigurada';

export interface FilaConfigFactura {
  is_active?: boolean | null;
  service_status?: string | null;
}

export function estadoFacturaElectronica(fila: FilaConfigFactura | null | undefined): EstadoFacturaElectronica {
  if (!fila) return 'noConfigurada';
  if (fila.service_status === 'suspended' || fila.is_active === false) return 'suspendida';
  if (fila.service_status === 'active' && fila.is_active === true) return 'activa';
  return 'pendiente';
}

/** Cliente mínimo de Supabase (el del navegador) para leer la fila. */
export interface ClienteConfigFactura {
  from: (tabla: 'electronic_invoicing_config') => {
    select: (columnas: string) => {
      eq: (columna: string, valor: unknown) => {
        eq: (columna: string, valor: unknown) => {
          maybeSingle: () => PromiseLike<{ data: FilaConfigFactura | null; error: unknown }>;
        };
      };
    };
  };
}

/** Estado de la organización, o `null` si no se pudo leer (no se bloquea nada). */
export async function leerEstadoFacturaElectronica(cliente: ClienteConfigFactura, organizationId: number): Promise<EstadoFacturaElectronica | null> {
  try {
    const { data, error } = await cliente
      .from('electronic_invoicing_config')
      .select('is_active, service_status')
      .eq('organization_id', organizationId)
      .eq('provider', 'factus')
      .maybeSingle();
    if (error) return null;
    return estadoFacturaElectronica(data);
  } catch {
    return null;
  }
}
