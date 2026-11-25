'use client';

import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import type { AccionRapidaCrm } from '@/components/crm/kit/quickActionLogica';
import type { HealthCustomerInfo } from '@/lib/services/crm/healthScoreService';
import { InscribirSecuenciaDialog } from './InscribirSecuenciaDialog';
import type { AccionSalud } from './saludLogica';

/**
 * Lo que abre una acción de Salud (anotaciones 1415:1161 y 1424:931): las
 * acciones rápidas existentes del CRM con el cliente elegido —cobro →
 * WhatsApp, llamar → modos de llamada, visita → reunión, tarea → tarea
 * rápida— o la inscripción en una secuencia. Nada de lógica propia de
 * envío (regla 7).
 */
export interface AccionSaludPendiente {
  accion: AccionSalud;
  clienteId: string;
  nombre: string;
  cliente?: HealthCustomerInfo | null;
  /** Distinta en cada apertura (`abrirAccion.clave`). */
  clave: number;
}

const RAPIDA: Record<Exclude<AccionSalud, 'secuencia'>, AccionRapidaCrm> = { cobro: 'whatsapp', llamar: 'llamar', visita: 'reunion', tarea: 'tarea' };

export function AccionSaludAbierta({ pendiente, onCerrado }: { pendiente: AccionSaludPendiente | null; onCerrado: () => void }) {
  if (!pendiente) return null;
  if (pendiente.accion === 'secuencia') {
    return <InscribirSecuenciaDialog cliente={{ id: pendiente.clienteId, nombre: pendiente.nombre }} onCerrar={onCerrado} />;
  }
  const c = pendiente.cliente;
  return (
    <AccionesRapidasCrm
      variante="drawer"
      sinBarra
      clienteId={pendiente.clienteId}
      cliente={{ id: pendiente.clienteId, full_name: c?.full_name ?? pendiente.nombre, email: c?.email ?? null, phone: c?.phone ?? null, do_not_call: c?.do_not_call ?? null }}
      abrirAccion={{ accion: RAPIDA[pendiente.accion], clave: pendiente.clave }}
      onCerrado={onCerrado}
    />
  );
}
