/**
 * Submenú CRM — única fuente de verdad (F0 §5.1).
 *
 * La consumen `src/components/app-layout/AppLayout.tsx` (MODULES_WITH_SUBMENU)
 * y `src/config/moduleConfig.ts` (moduleSubroutes.crm). Las entradas con
 * `enabled: false` NO se renderizan hasta que exista la página:
 *   - Agentes IA → F6 · Plantillas → F7 · Secuencias / Automatizaciones → F8.
 * Para activarlas basta con cambiar `enabled` a `true` en este archivo.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Users,
  Target,
  TrendingUp,
  Activity,
  Phone,
  Megaphone,
  Tag,
  BarChart3,
  HeartPulse,
  User,
  UserPlus,
  Bot,
  FileText,
  GitBranch,
  Zap,
} from 'lucide-react';

export interface CrmNavItem {
  /** Clave estable (para tests y feature flags). */
  key: string;
  name: string;
  href: string;
  icon: LucideIcon;
  /** Fase que activa la entrada cuando `enabled` es false. */
  phase?: string;
  enabled: boolean;
}

export const CRM_NAV: CrmNavItem[] = [
  { key: 'clientes', name: 'Clientes', href: '/app/crm/clientes', icon: Users, enabled: true },
  { key: 'leads', name: 'Leads', href: '/app/crm/leads', icon: UserPlus, enabled: true },
  { key: 'pipeline', name: 'Pipeline', href: '/app/crm/pipeline', icon: Target, enabled: true },
  { key: 'oportunidades', name: 'Oportunidades', href: '/app/crm/oportunidades', icon: TrendingUp, enabled: true },
  { key: 'actividades', name: 'Actividades', href: '/app/crm/actividades', icon: Activity, enabled: true },
  { key: 'llamadas', name: 'Llamadas', href: '/app/crm/llamadas', icon: Phone, enabled: true },
  { key: 'campanas', name: 'Campañas', href: '/app/crm/campanas', icon: Megaphone, enabled: true },
  { key: 'segmentos', name: 'Segmentos', href: '/app/crm/segmentos', icon: Tag, enabled: true },
  { key: 'equipo', name: 'Equipo', href: '/app/crm/equipo', icon: Users, enabled: true },
  { key: 'pronostico', name: 'Pronóstico', href: '/app/crm/pronostico', icon: BarChart3, enabled: true },
  { key: 'salud', name: 'Salud', href: '/app/crm/salud', icon: HeartPulse, enabled: true },
  { key: 'identidades', name: 'Identidades', href: '/app/crm/identidades', icon: User, enabled: true },
  // Se activan cuando exista la página (F6/F7/F8).
  // Activada tras el visto bueno del tester de F6 (ronda 4, 9,5/10), que lo dio
  // "sin condiciones previas": el libro de intentos ya no es borrable, el techo
  // declarado es el real, y las revocaciones se comprobaron en vivo con la clave
  // publica. La pestana de agente por etapa cuelga del dialogo que el engranaje
  // abre de verdad, asi que la configuracion por etapa por fin es alcanzable.
  { key: 'agentes-ia', name: 'Agentes IA', href: '/app/crm/agentes-ia', icon: Bot, phase: 'F6', enabled: true },
  { key: 'plantillas', name: 'Plantillas', href: '/app/crm/plantillas', icon: FileText, phase: 'F7', enabled: true },
  // Activada tras el visto bueno expreso del tester de F8 (ronda 4, 9,5/10): el paso
  // de condicion ya se puede configurar, la validacion rechaza un paso vacio y la
  // ejecucion CORTA en vez de dejar pasar, probado por la cola con el orden mas
  // adverso. Aviso del propio tester: esta casilla NO es contencion real, porque la
  // pagina es alcanzable por URL directa este como este; por eso el bloqueante habia
  // que cerrarlo de verdad, y se cerro.
  { key: 'secuencias', name: 'Secuencias', href: '/app/crm/secuencias', icon: GitBranch, phase: 'F8', enabled: true },
  // Activada tras el visto bueno expreso del tester de F8 (ronda 3): su única
  // accion real exige rol de administrador, el boton de probar es en seco, y el
  // forzado que ejecutaba una regla desactivada quedo retirado. `secuencias` sigue
  // apagada a proposito: es la pantalla desde la que se inicia un envio a un
  // cliente real y su paso de condicion aun no se puede configurar.
  // Esta casilla es ademas el unico interruptor real: los enlaces de
  // AutomationsView solo se renderizan si esta entrada esta activa.
  { key: 'automatizaciones', name: 'Automatizaciones', href: '/app/crm/automatizaciones', icon: Zap, phase: 'F8', enabled: true },
];

/** Entradas visibles en el nav (solo `enabled`). */
export const CRM_NAV_ENABLED: CrmNavItem[] = CRM_NAV.filter((i) => i.enabled);

/** Shape de `moduleSubroutes` (moduleConfig.ts). */
export const CRM_MODULE_SUBROUTES = CRM_NAV_ENABLED.map((i) => ({ name: i.name, path: i.href, icon: i.icon }));
