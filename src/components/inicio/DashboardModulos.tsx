'use client';

/**
 * Contenedor del dashboard unificado que renderiza una sección por cada
 * módulo de negocio activo para la organización.
 *
 * Solo muestra secciones de módulos activos (activeModuleCodes). Si
 * activeModuleCodes es undefined (aún cargando), muestra todas las
 * secciones en estado skeleton.
 *
 * El orden de las secciones sigue el criterio de valor/complejidad acordado:
 * finanzas → inventario → pos → crm → pms → parking → gym → hrm →
 * transporte → pm → notificaciones → integraciones → calendario → timeline → chat
 *
 * Cada módulo se renderiza con <ModuloSection>. El contenido real de cada
 * dashboard se inyecta en las Fases 1-15; la Fase 0 muestra placeholders.
 */

import React from 'react';
import {
  Banknote,
  Package,
  ShoppingCart,
  UserCheck,
  BedDouble,
  ParkingCircle,
  Dumbbell,
  Briefcase,
  Truck,
  FolderKanban,
  Bell,
  Zap,
  Calendar,
  Activity,
  MessageSquare,
} from 'lucide-react';
import ModuloSection, { type ModuloSectionProps } from './ModuloSection';
import FinanzasSection from './sections/FinanzasSection';
import InventarioSection from './sections/InventarioSection';
import CrmSection from './sections/CrmSection';
import PmsSection from './sections/PmsSection';
import HrmSection from './sections/HrmSection';
import GymSection from './sections/GymSection';
import ParkingSection from './sections/ParkingSection';
import PosSection from './sections/PosSection';
import TransporteSection from './sections/TransporteSection';
import PmSection from './sections/PmSection';
import NotificacionesSection from './sections/NotificacionesSection';
import IntegracionesSection from './sections/IntegracionesSection';
import CalendarioSection from './sections/CalendarioSection';
import TimelineSection from './sections/TimelineSection';
import ChatSection from './sections/ChatSection';

const SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  finance: FinanzasSection,
  inventory: InventarioSection,
  pos: PosSection,
  crm: CrmSection,
  pms_hotel: PmsSection,
  hrm: HrmSection,
  gym: GymSection,
  parking: ParkingSection,
  transport: TransporteSection,
  pm: PmSection,
  notifications: NotificacionesSection,
  integrations: IntegracionesSection,
  calendar: CalendarioSection,
  operations: TimelineSection,
  chat: ChatSection,
};

// ─── Configuración de módulos de negocio ─────────────────────────────────────
// Orden: valor/complejidad (finanzas primero, chat último)
// hasReportes: true si el módulo tiene página de reportes propia

interface ModuloConfig {
  code: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  accentBg: string;
  hasReportes: boolean;
}

const MODULOS_NEGOCIO: ModuloConfig[] = [
  {
    code: 'finance',
    name: 'Finanzas',
    icon: Banknote,
    accentColor: 'text-emerald-600 dark:text-emerald-400',
    accentBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    hasReportes: true,
  },
  {
    code: 'inventory',
    name: 'Inventario',
    icon: Package,
    accentColor: 'text-amber-600 dark:text-amber-400',
    accentBg: 'bg-amber-100 dark:bg-amber-900/30',
    hasReportes: true,
  },
  {
    code: 'pos',
    name: 'POS',
    icon: ShoppingCart,
    accentColor: 'text-blue-600 dark:text-blue-400',
    accentBg: 'bg-blue-100 dark:bg-blue-900/30',
    hasReportes: true,
  },
  {
    code: 'crm',
    name: 'CRM',
    icon: UserCheck,
    accentColor: 'text-purple-600 dark:text-purple-400',
    accentBg: 'bg-purple-100 dark:bg-purple-900/30',
    hasReportes: true,
  },
  {
    code: 'pms_hotel',
    name: 'PMS Hotel',
    icon: BedDouble,
    accentColor: 'text-indigo-600 dark:text-indigo-400',
    accentBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    hasReportes: false,
  },
  {
    code: 'parking',
    name: 'Parking',
    icon: ParkingCircle,
    accentColor: 'text-cyan-600 dark:text-cyan-400',
    accentBg: 'bg-cyan-100 dark:bg-cyan-900/30',
    hasReportes: true,
  },
  {
    code: 'gym',
    name: 'Gym',
    icon: Dumbbell,
    accentColor: 'text-rose-600 dark:text-rose-400',
    accentBg: 'bg-rose-100 dark:bg-rose-900/30',
    hasReportes: true,
  },
  {
    code: 'hrm',
    name: 'HRM',
    icon: Briefcase,
    accentColor: 'text-teal-600 dark:text-teal-400',
    accentBg: 'bg-teal-100 dark:bg-teal-900/30',
    hasReportes: true,
  },
  {
    code: 'transport',
    name: 'Transporte',
    icon: Truck,
    accentColor: 'text-orange-600 dark:text-orange-400',
    accentBg: 'bg-orange-100 dark:bg-orange-900/30',
    hasReportes: false,
  },
  {
    code: 'pm',
    name: 'Project Management',
    icon: FolderKanban,
    accentColor: 'text-violet-600 dark:text-violet-400',
    accentBg: 'bg-violet-100 dark:bg-violet-900/30',
    hasReportes: false,
  },
  {
    code: 'notifications',
    name: 'Notificaciones',
    icon: Bell,
    accentColor: 'text-yellow-600 dark:text-yellow-400',
    accentBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    hasReportes: false,
  },
  {
    code: 'integrations',
    name: 'Integraciones',
    icon: Zap,
    accentColor: 'text-fuchsia-600 dark:text-fuchsia-400',
    accentBg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30',
    hasReportes: false,
  },
  {
    code: 'calendar',
    name: 'Calendario',
    icon: Calendar,
    accentColor: 'text-sky-600 dark:text-sky-400',
    accentBg: 'bg-sky-100 dark:bg-sky-900/30',
    hasReportes: false,
  },
  {
    code: 'operations',
    name: 'Timeline',
    icon: Activity,
    accentColor: 'text-slate-600 dark:text-slate-400',
    accentBg: 'bg-slate-100 dark:bg-slate-900/30',
    hasReportes: false,
  },
  {
    code: 'chat',
    name: 'Chat',
    icon: MessageSquare,
    accentColor: 'text-green-600 dark:text-green-400',
    accentBg: 'bg-green-100 dark:bg-green-900/30',
    hasReportes: false,
  },
];

// ─── Navegación rápida entre secciones ───────────────────────────────────────

function SectionNav({
  modulos,
  activeModuleCodes,
}: {
  modulos: ModuloConfig[];
  activeModuleCodes: string[] | undefined;
}) {
  const visible = activeModuleCodes
    ? modulos.filter((m) => activeModuleCodes.includes(m.code))
    : modulos;

  if (!visible.length) return null;

  return (
    <nav
      className="flex flex-wrap gap-2 mb-6 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
      aria-label="Navegación entre módulos"
    >
      {visible.map((m) => {
        const Icon = m.icon;
        return (
          <a
            key={m.code}
            href={`#${m.code}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Icon className={`h-3.5 w-3.5 ${m.accentColor}`} />
            {m.name}
          </a>
        );
      })}
    </nav>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export interface DashboardModulosProps {
  /** Códigos de módulos activos. undefined = aún cargando (muestra skeleton) */
  activeModuleCodes: string[] | undefined;
  /** Si el dashboard general está cargando */
  isLoading?: boolean;
}

export default function DashboardModulos({
  activeModuleCodes,
  isLoading = false,
}: DashboardModulosProps) {
  const modulos = MODULOS_NEGOCIO;

  // Filtrar por módulos activos (si undefined, mostrar todos en skeleton)
  const modulosVisibles = activeModuleCodes
    ? modulos.filter((m) => activeModuleCodes.includes(m.code))
    : modulos;

  if (!modulosVisibles.length) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No hay módulos de negocio activos. Activa módulos desde{' '}
          <a
            href="/app/organizacion/modulos"
            className="text-blue-600 dark:text-blue-400 underline"
          >
            Configuración de módulos
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Navegación rápida entre secciones */}
      <SectionNav
        modulos={modulos}
        activeModuleCodes={activeModuleCodes}
      />

      {/* Secciones por módulo */}
      {modulosVisibles.map((modulo) => {
        const SectionComponent = SECTION_COMPONENTS[modulo.code];
        if (SectionComponent) {
          return <SectionComponent key={modulo.code} />;
        }
        const sectionProps: ModuloSectionProps = {
          moduleCode: modulo.code,
          moduleName: modulo.name,
          icon: modulo.icon,
          accentColor: modulo.accentColor,
          accentBg: modulo.accentBg,
          hasReportes: modulo.hasReportes,
          isLoading,
        };
        return (
          <ModuloSection key={modulo.code} {...sectionProps} />
        );
      })}
    </div>
  );
}
