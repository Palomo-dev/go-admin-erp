'use client';

import { RedirigirAlDialogo } from '@/components/configuracion/dialogo/RedirigirAlDialogo';

/**
 * /app/crm/salud/configuracion — los factores de salud se movieron al diálogo de
 * Configuración › CRM › Salud de clientes (Figma pág. 10, S10; 2026-11-24). La ruta
 * se conserva para que ningún favorito ni enlace se rompa: abre el diálogo en
 * `crm.salud` con el aviso «se movió aquí» (`dialogoUrl.ts › PAGINAS_VIEJAS`),
 * sobre la pantalla previa o, si se entró directo, sobre Salud de clientes.
 */
export default function CrmSaludConfiguracionMovida() {
  return <RedirigirAlDialogo base="/app/crm/salud" />;
}
