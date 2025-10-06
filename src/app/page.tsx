'use client';
import Link from 'next/link';
import { signOut } from '@/lib/supabase/config';
import { useState } from 'react';
import { 
  HomeIcon, 
  UsersIcon, 
  BriefcaseIcon, 
  CurrencyDollarIcon,
  CubeIcon,
  ShoppingCartIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  ChartBarIcon,
  ClockIcon,
  TruckIcon,
  BellIcon,
  LinkIcon,
  BuildingStorefrontIcon,
  ArrowRightOnRectangleIcon,
  LockClosedIcon,
  KeyIcon
} from '@heroicons/react/24/outline';

interface Module {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
  category: 'core' | 'auth' | 'business';
}

const modules: Module[] = [
  {
    name: 'Inicio',
    path: '/app/inicio',
    icon: HomeIcon,
    description: 'Panel principal',
    color: 'from-blue-500 to-blue-600',
    category: 'core'
  },
  {
    name: 'CRM',
    path: '/app/crm',
    icon: UsersIcon,
    description: 'Gestión de clientes',
    color: 'from-purple-500 to-purple-600',
    category: 'business'
  },
  {
    name: 'HRM',
    path: '/app/hrm',
    icon: BriefcaseIcon,
    description: 'Recursos humanos',
    color: 'from-pink-500 to-pink-600',
    category: 'business'
  },
  {
    name: 'Finanzas',
    path: '/app/finanzas',
    icon: CurrencyDollarIcon,
    description: 'Gestión financiera',
    color: 'from-green-500 to-green-600',
    category: 'business'
  },
  {
    name: 'Inventario',
    path: '/app/inventario',
    icon: CubeIcon,
    description: 'Control de stock',
    color: 'from-orange-500 to-orange-600',
    category: 'business'
  },
  {
    name: 'POS',
    path: '/app/pos',
    icon: ShoppingCartIcon,
    description: 'Punto de venta',
    color: 'from-indigo-500 to-indigo-600',
    category: 'business'
  },
  {
    name: 'PMS',
    path: '/app/pms',
    icon: BuildingStorefrontIcon,
    description: 'Property Management',
    color: 'from-teal-500 to-teal-600',
    category: 'business'
  },
  {
    name: 'Calendario',
    path: '/app/calendario',
    icon: CalendarIcon,
    description: 'Agenda y eventos',
    color: 'from-cyan-500 to-cyan-600',
    category: 'core'
  },
  {
    name: 'Organización',
    path: '/app/organizacion',
    icon: BuildingOfficeIcon,
    description: 'Configuración empresarial',
    color: 'from-gray-500 to-gray-600',
    category: 'core'
  },
  {
    name: 'Reportes',
    path: '/app/reportes',
    icon: ChartBarIcon,
    description: 'Análisis y reportes',
    color: 'from-yellow-500 to-yellow-600',
    category: 'business'
  },
  {
    name: 'Timeline',
    path: '/app/timeline',
    icon: ClockIcon,
    description: 'Línea de tiempo',
    color: 'from-red-500 to-red-600',
    category: 'core'
  },
  {
    name: 'Transporte',
    path: '/app/transporte',
    icon: TruckIcon,
    description: 'Logística y envíos',
    color: 'from-blue-600 to-blue-700',
    category: 'business'
  },
  {
    name: 'Notificaciones',
    path: '/app/notificaciones',
    icon: BellIcon,
    description: 'Centro de alertas',
    color: 'from-amber-500 to-amber-600',
    category: 'core'
  },
  {
    name: 'Integraciones',
    path: '/app/integraciones',
    icon: LinkIcon,
    description: 'Conectores externos',
    color: 'from-violet-500 to-violet-600',
    category: 'core'
  },
  {
    name: 'Login',
    path: '/auth/login',
    icon: ArrowRightOnRectangleIcon,
    description: 'Iniciar sesión',
    color: 'from-slate-500 to-slate-600',
    category: 'auth'
  },
  {
    name: 'Restablecer',
    path: '/auth/reset-password',
    icon: KeyIcon,
    description: 'Cambiar contraseña',
    color: 'from-slate-500 to-slate-600',
    category: 'auth'
  },
  {
    name: 'Recuperar',
    path: '/auth/forgot-password',
    icon: LockClosedIcon,
    description: 'Olvidé mi contraseña',
    color: 'from-slate-500 to-slate-600',
    category: 'auth'
  }
];

export default function Home() {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await signOut();
      
      // Limpiar localStorage
      localStorage.removeItem('currentOrganizationId');
      localStorage.removeItem('currentOrganizationName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('rememberMe');
      
      // Redireccionar a la página de login
      window.location.replace('/auth/login'); 
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    } finally {
      setLoading(false);
    }
  };

  const coreModules = modules.filter(m => m.category === 'core');
  const businessModules = modules.filter(m => m.category === 'business');
  const authModules = modules.filter(m => m.category === 'auth');

  return (
    <main className="min-h-screen h-screen overflow-y-auto bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header con botón de cerrar sesión */}
      <div className="sticky top-0 z-50 backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg p-2 shadow-lg">
              <div className="text-white font-black text-xl">GO</div>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">GO Admin ERP</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Sistema de gestión empresarial</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            <span className="hidden sm:inline">{loading ? 'Cerrando...' : 'Cerrar Sesión'}</span>
          </button>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero Section */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-block mb-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-8 shadow-2xl transform hover:scale-105 transition-transform duration-300">
              <div className="text-white font-black text-5xl sm:text-6xl">GO</div>
              <div className="text-blue-100 font-medium text-sm mt-2 tracking-widest">ADMIN ERP</div>
            </div>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Bienvenido a tu Centro de Control
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Gestiona todos los aspectos de tu negocio desde una única plataforma integrada
          </p>
        </div>

        {/* Módulos de Negocio */}
        <section className="mb-12">
          <div className="flex items-center mb-6">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg p-2 mr-3">
              <BriefcaseIcon className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Módulos de Negocio</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {businessModules.map((module) => (
              <ModuleCard key={module.path} module={module} />
            ))}
          </div>
        </section>

        {/* Módulos Core */}
        <section className="mb-12">
          <div className="flex items-center mb-6">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg p-2 mr-3">
              <HomeIcon className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Herramientas Principales</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {coreModules.map((module) => (
              <ModuleCard key={module.path} module={module} />
            ))}
          </div>
        </section>

        {/* Módulos de Autenticación */}
        <section className="mb-12">
          <div className="flex items-center mb-6">
            <div className="bg-gradient-to-r from-gray-500 to-gray-600 rounded-lg p-2 mr-3">
              <LockClosedIcon className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Autenticación</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {authModules.map((module) => (
              <ModuleCard key={module.path} module={module} />
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-700 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            GO Admin ERP © 2025 - Sistema de gestión empresarial integral
          </p>
        </div>
      </div>
    </main>
  );
}

function ModuleCard({ module }: { module: Module }) {
  const Icon = module.icon;
  
  return (
    <Link href={module.path} className="group block">
      <div className="relative h-full bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700 hover:border-transparent">
        {/* Gradient overlay on hover */}
        <div className={`absolute inset-0 bg-gradient-to-br ${module.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
        
        {/* Content */}
        <div className="relative p-6">
          {/* Icon con gradiente */}
          <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${module.color} shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300`}>
            <Icon className="w-7 h-7 text-white" />
          </div>
          
          {/* Title */}
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {module.name}
          </h3>
          
          {/* Description */}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {module.description}
          </p>
          
          {/* Arrow indicator */}
          <div className="mt-4 flex items-center text-blue-600 dark:text-blue-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span>Acceder</span>
            <svg className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}
