/**
 * Texto de la columna «Vehículo» de un domiciliario (Logística 1b, Figma 3161-11986): placa del
 * vehículo por defecto, «a pie», «bici sin registrar» o «sin vehículo». Lo usan la lista y la
 * ficha de Domiciliarios para que digan lo mismo.
 */
import { vehiculoDePersona } from '@/lib/logistica/vehiculoAsignacion';

type Traductor = ((clave: string, valores?: Record<string, string | number>) => string) & { has: (clave: string) => boolean };

export function textoVehiculoPersona(
  d: Parameters<typeof vehiculoDePersona>[0],
  tv: Traductor,
): string {
  const v = vehiculoDePersona(d);
  const tipo = (x: string | null) => (x && tv.has(`tipos.${x}`) ? tv(`tipos.${x}`) : x ?? '');
  switch (v.estado) {
    case 'con':
      return [tipo(v.tipo), v.placa ?? tv('sinPlaca')].filter(Boolean).join(' · ');
    case 'a_pie':
      return tv('listas.aPie');
    case 'bici_sin':
      return tv('listas.biciSinRegistrar');
    case 'sin':
      return `${tipo(v.tipo)} · ${tv('listas.sinVehiculo')}`;
    default:
      return '—';
  }
}
