/**
 * Lo que el asistente de creación del sitio toma del ERP (Figma A/03i: «nada se
 * escribe dos veces»): organización, sede principal, WhatsApp del sitio,
 * dirección real, pasarela y permisos. Lo arma `GET /api/sitio-web/onboarding`.
 */
import type { GiroSitio } from './onboardingSitio';
import type { DireccionSitio } from './resumenSitio';

export interface ContextoAsistente {
  organizacion: { nombre: string; logoUrl: string | null; giro: GiroSitio; subdominio: string | null };
  /** Sede principal (`branches.is_main`): dirección, teléfono y horario (`opening_hours`). */
  sede: { nombre: string; direccion: string | null; telefono: string | null; horario: unknown } | null;
  /** `website_settings.social_links.whatsapp` del sitio principal (legacy). */
  whatsapp: string | null;
  direccion: DireccionSitio;
  pasarela: boolean;
  permisos: { editar: boolean; publicar: boolean };
}
