'use client';

/**
 * Elige el asistente de conexión por `item.asistente` (Frente INT). Contrato fijo que usa la página
 * de Conexiones y el detalle («Reemplazar» con `conexionId`).
 * 'logistica', 'enlace' y 'avanzado' no tienen asistente aquí: la página navega a su ruta.
 */
import type { ItemCatalogo } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { AsistenteDomicilios } from './AsistenteDomicilios';
import { AsistenteIcal } from './AsistenteIcal';
import { AsistenteLlaves } from './AsistenteLlaves';
import { AsistenteOauth } from './AsistenteOauth';
import { AsistenteOta } from './AsistenteOta';

export interface AsistenteConexionProps {
  item: ItemCatalogo;
  abierto: boolean;
  onCerrar: () => void;
  onConectado: (conexionId: string | null) => void;
  /** Reemplazar las llaves de una conexión existente (solo asistente «llaves»). */
  conexionId?: string;
}

/** Tipos de asistente que se abren en diálogo. */
export const ASISTENTES_EN_DIALOGO = ['llaves', 'ota', 'ical', 'domicilios', 'oauth'] as const;

export function tieneAsistente(item: Pick<ItemCatalogo, 'asistente'>): boolean {
  return (ASISTENTES_EN_DIALOGO as readonly string[]).includes(item.asistente);
}

export function AsistenteConexion({ item, abierto, onCerrar, onConectado, conexionId }: AsistenteConexionProps) {
  switch (item.asistente) {
    case 'llaves':
      return <AsistenteLlaves item={item} abierto={abierto} onCerrar={onCerrar} onConectado={onConectado} conexionId={conexionId} />;
    case 'ota':
      return <AsistenteOta item={item} abierto={abierto} onCerrar={onCerrar} onConectado={onConectado} />;
    case 'ical':
      return <AsistenteIcal item={item} abierto={abierto} onCerrar={onCerrar} onConectado={onConectado} />;
    case 'domicilios':
      return <AsistenteDomicilios item={item} abierto={abierto} onCerrar={onCerrar} />;
    case 'oauth':
      return <AsistenteOauth item={item} abierto={abierto} onCerrar={onCerrar} />;
    default:
      return null;
  }
}
