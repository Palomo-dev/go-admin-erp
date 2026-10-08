/**
 * Registro ÚNICO de secciones y ajustes de Configuración (decisión del dueño,
 * 2026-10-07: un solo lugar para todas las configuraciones; Figma página «10
 * Configuración», sección «10. Configuración unificada»).
 *
 * De aquí salen el menú, el buscador, los deep links, los permisos que el
 * servidor resuelve y las redirecciones de las rutas viejas. Es un módulo de
 * datos puro (sin React ni Supabase) para que lo usen la ruta del servidor,
 * el cliente y las pruebas por igual.
 *
 * - `id` es ESTABLE (`<modulo>.<seccion>`): lo usan los enlaces de correos y los
 *   favoritos. No se renombra; si una sección cambia de módulo, el id viejo se
 *   deja como alias en `ALIAS_SECCION`.
 * - Los textos (título, descripción y palabras clave) viven en
 *   `messages/<idioma>.json › configuracionUnificada.secciones.<clave>` y
 *   `….ajustes.<clave>`: el buscador busca en el idioma de quien busca.
 * - `permiso` es el código de `permissions` que exige EDITAR la sección. Lo
 *   resuelve el servidor (`/api/configuracion/secciones`, con
 *   `hasOrgAdminOrPermission`); el cliente nunca lo decide. Un ajuste puede
 *   pedir otro permiso (`AjusteConfig.permiso`).
 * - Qué módulos se ven depende del plan (`organization_modules`, vía
 *   `moduleManagementService` en el servidor): aquí no hay lista de módulos
 *   activos, solo el código de módulo de cada sección.
 */
import { CONFIG_MODULES } from './configModulesRegistry';

/** Permiso por defecto de los ajustes de la organización (mismo criterio que `withOrg({ admin: true })`). */
export const PERMISO_ADMIN = 'admin.full_access';

export interface AjusteConfig {
  /** Ancla del deep link (`#desinteres`): id del elemento en la sección. */
  ancla: string;
  /** Clave i18n en `configuracionUnificada.ajustes`. */
  clave: string;
  /** Permiso propio si difiere del de la sección. */
  permiso?: string;
}

export interface SeccionConfig {
  /** Id estable `<modulo>.<seccion>`. */
  id: string;
  /** `ConfigModule.id` (`configModulesRegistry.ts`). */
  modulo: string;
  /** Segmento del deep link (`?seccion=`). */
  seccion: string;
  /** Clave i18n en `configuracionUnificada.secciones`. */
  clave: string;
  /** Permiso para editar (resuelto en el servidor). */
  permiso: string;
  ajustes: readonly AjusteConfig[];
  /**
   * La sección solo enlaza a una pantalla que se queda donde está (Sitio web,
   * GO Assistant, avisos al cliente del POS): no se mueve ni se duplica.
   */
  enlace?: string;
  /** La propia sección maneja su solo lectura (ajustes con permisos distintos). */
  controlaLectura?: boolean;
}

export const SECCIONES_CONFIG: readonly SeccionConfig[] = [
  { id: 'general.general', modulo: 'general', seccion: 'general', clave: 'generalGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'general.asistente', modulo: 'general', seccion: 'asistente', clave: 'generalAsistente', permiso: PERMISO_ADMIN, ajustes: [], enlace: '/app/configuracion/asistente' },
  // Sitio web se queda en su módulo (decisión del dueño, 2026-10-07): aquí solo se enlaza.
  { id: 'sitioweb.general', modulo: 'sitioweb', seccion: 'general', clave: 'sitiowebGeneral', permiso: PERMISO_ADMIN, ajustes: [], enlace: '/app/sitio-web/configuracion' },
  { id: 'crm.general', modulo: 'crm', seccion: 'general', clave: 'crmGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  {
    id: 'crm.agente-voz',
    modulo: 'crm',
    seccion: 'agente-voz',
    clave: 'crmAgenteVoz',
    permiso: PERMISO_ADMIN,
    controlaLectura: true,
    ajustes: [
      { ancla: 'interruptor', clave: 'agenteVozInterruptor' },
      { ancla: 'numeros-prueba', clave: 'agenteVozNumerosPrueba' },
      // Mismo permiso que exige `PUT /api/crm/voice-agents/desinteres`.
      { ancla: 'desinteres', clave: 'agenteVozDesinteres', permiso: 'crm.stages.manage' },
    ],
  },
  { id: 'crm.telefonia', modulo: 'crm', seccion: 'telefonia', clave: 'crmTelefonia', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'crm.proveedores', modulo: 'crm', seccion: 'proveedores', clave: 'crmProveedores', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'crm.email', modulo: 'crm', seccion: 'email', clave: 'crmEmail', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'crm.whatsapp', modulo: 'crm', seccion: 'whatsapp', clave: 'crmWhatsapp', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'crm.creditos', modulo: 'crm', seccion: 'creditos', clave: 'crmCreditos', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'hrm.general', modulo: 'hrm', seccion: 'general', clave: 'hrmGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'pms.general', modulo: 'pms', seccion: 'general', clave: 'pmsGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'pos.general', modulo: 'pos', seccion: 'general', clave: 'posGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  // Se queda en POS › Reservas de mesas: el módulo Sitio web la enlaza como «Reservas web»
  // y ese flujo no se toca (decisión del dueño, 2026-10-07). Aquí, solo el enlace.
  { id: 'pos.reservas-mesas', modulo: 'pos', seccion: 'reservas-mesas', clave: 'posReservasMesas', permiso: PERMISO_ADMIN, ajustes: [], enlace: '/app/pos/reservas-mesas?tab=configuracion' },
  { id: 'pos.avisos-cliente', modulo: 'pos', seccion: 'avisos-cliente', clave: 'posAvisosCliente', permiso: PERMISO_ADMIN, ajustes: [], enlace: '/app/configuracion/pos/avisos-cliente' },
  { id: 'chat.general', modulo: 'chat', seccion: 'general', clave: 'chatGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'chat.ia', modulo: 'chat', seccion: 'ia', clave: 'chatIa', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'integraciones.general', modulo: 'integraciones', seccion: 'general', clave: 'integracionesGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'parking.general', modulo: 'parking', seccion: 'general', clave: 'parkingGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'calendario.general', modulo: 'calendario', seccion: 'general', clave: 'calendarioGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'timeline.general', modulo: 'timeline', seccion: 'general', clave: 'timelineGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'roles.general', modulo: 'roles', seccion: 'general', clave: 'rolesGeneral', permiso: 'roles.manage', ajustes: [] },
  { id: 'facturacion.resumen', modulo: 'facturacion', seccion: 'resumen', clave: 'facturacionResumen', permiso: PERMISO_ADMIN, ajustes: [] },
  // Mismo permiso que `POST /api/factus/config` (admin o «finance.approve»).
  { id: 'facturacion.servicio', modulo: 'facturacion', seccion: 'servicio', clave: 'facturacionServicio', permiso: 'finance.approve', ajustes: [] },
  { id: 'gym.general', modulo: 'gym', seccion: 'general', clave: 'gymGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
  { id: 'notificaciones.general', modulo: 'notificaciones', seccion: 'general', clave: 'notificacionesGeneral', permiso: 'notifications.manage', ajustes: [] },
  { id: 'datos-offline.general', modulo: 'datos-offline', seccion: 'general', clave: 'datosOfflineGeneral', permiso: PERMISO_ADMIN, ajustes: [] },
];

/**
 * Pantallas viejas que se movieron a Configuración: de dónde venían (clave
 * i18n en `configuracionUnificada.origenes`) y a qué sección y ajuste llevan.
 * Las redirecciones HTTP están en `next.config.js › REDIRECCIONES_CONFIGURACION`
 * (CommonJS: no puede importar este archivo); la prueba
 * `src/components/configuracion/__tests__/redirecciones.test.ts` exige que
 * coincidan una a una.
 */
export interface RutaMovida {
  /** Valor de `?movido=`: también es la clave i18n del origen. */
  origen: string;
  /** Ruta vieja (con su query si la tenía). */
  desde: string;
  seccion: string;
  ancla?: string;
}

export const RUTAS_MOVIDAS: readonly RutaMovida[] = [
  { origen: 'crmAgentesAjustes', desde: '/app/crm/agentes-ia?pestana=ajustes', seccion: 'crm.agente-voz', ancla: 'desinteres' },
  { origen: 'chatIaConfiguracion', desde: '/app/chat/ia/configuracion', seccion: 'chat.ia' },
  { origen: 'facturacionElectronicaConfiguracion', desde: '/app/finanzas/facturacion-electronica/configuracion', seccion: 'facturacion.servicio' },
];

/** `?tab=` de Configuración › CRM antes de las secciones (enlaces que siguen en correos y en el código). */
const TAB_CRM_A_SECCION: Readonly<Record<string, string>> = {
  general: 'general',
  telefonia: 'telefonia',
  proveedores: 'proveedores',
  email: 'email',
  whatsapp: 'whatsapp',
  creditos: 'creditos',
};

export function seccionPorId(id: string): SeccionConfig | undefined {
  return SECCIONES_CONFIG.find((s) => s.id === id);
}

export function seccionesDeModulo(moduloId: string): SeccionConfig[] {
  return SECCIONES_CONFIG.filter((s) => s.modulo === moduloId);
}

/** Módulo de Configuración de una sección (con su `moduleCode` del plan). */
export function moduloDeSeccion(s: SeccionConfig) {
  return CONFIG_MODULES.find((m) => m.id === s.modulo);
}

/**
 * Sección que pide la URL: `?seccion=` dentro de `?modulo=`; si no viene o no
 * existe, la primera del módulo. `?tab=` de CRM se traduce a su sección.
 */
export function resolverSeccion(moduloId: string, seccion: string | null, tab?: string | null): SeccionConfig | undefined {
  const delModulo = seccionesDeModulo(moduloId);
  const pedida = seccion ?? (moduloId === 'crm' && tab ? TAB_CRM_A_SECCION[tab] ?? null : null);
  return delModulo.find((s) => s.seccion === pedida) ?? delModulo[0];
}

export interface OpcionesRuta {
  ancla?: string;
  /** Origen de una ruta vieja: la página muestra una vez el aviso «se movió aquí». */
  movido?: string;
}

/** Deep link estable: `/app/configuracion?modulo=crm&seccion=agente-voz#desinteres`. */
export function rutaSeccion(id: string, opciones: OpcionesRuta = {}): string {
  const s = seccionPorId(id);
  if (!s) return '/app/configuracion';
  const q = new URLSearchParams({ modulo: s.modulo, seccion: s.seccion });
  if (opciones.movido) q.set('movido', opciones.movido);
  return `/app/configuracion?${q.toString()}${opciones.ancla ? `#${opciones.ancla}` : ''}`;
}

/**
 * Destino de una redirección de servidor. El ajuste va en `?ajuste=` y no en
 * `#`: un fragmento en el destino de `redirects()` no siempre sobrevive al 308.
 * La página acepta las dos formas.
 */
export function destinoRutaMovida(r: RutaMovida): string {
  const s = seccionPorId(r.seccion);
  if (!s) return '/app/configuracion';
  const q = new URLSearchParams({ modulo: s.modulo, seccion: s.seccion });
  if (r.ancla) q.set('ajuste', r.ancla);
  q.set('movido', r.origen);
  return `/app/configuracion?${q.toString()}`;
}
