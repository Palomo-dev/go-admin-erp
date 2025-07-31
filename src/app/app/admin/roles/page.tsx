'use client';

import { useState, useEffect } from 'react';
import { usePermissionContext } from '@/hooks/usePermissionContext';
import PermissionGuard from '@/components/auth/PermissionGuard';
import RolesManagement from '@/components/admin/RolesManagement';
import RoleAssignment from '@/components/admin/RoleAssignment';
import { Shield, Users, Settings, BarChart3 } from 'lucide-react';
import { PERMISSIONS, MODULES } from '@/lib/middleware/permissions';
import { supabase } from '@/lib/supabase/config';
import { toast } from 'react-hot-toast';

type TabType = 'roles' | 'assignments' | 'analytics';

export default function RolesAdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('roles');
  const { context, loading } = usePermissionContext();

  if (loading || !context) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    {
      id: 'roles' as TabType,
      name: 'Gestión de Roles',
      icon: Shield,
      description: 'Crear y gestionar roles personalizados'
    },
    {
      id: 'assignments' as TabType,
      name: 'Asignación de Roles',
      icon: Users,
      description: 'Asignar roles a los miembros de la organización'
    },
    {
      id: 'analytics' as TabType,
      name: 'Analíticas',
      icon: BarChart3,
      description: 'Estadísticas y reportes de roles y permisos'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Shield className="h-8 w-8 text-indigo-600" />
                <h1 className="text-2xl font-bold text-gray-900">Administración de Roles</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                Gestión de roles y permisos
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navegación de pestañas */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                    isActive
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className={`mr-2 h-5 w-5 ${
                    isActive ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-500'
                  }`} />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PermissionGuard
          permissions={[PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USER_MANAGEMENT, PERMISSIONS.ADMIN_FULL_ACCESS]}
          requireAll={false}
          moduleCode={MODULES.ADMIN}
          organizationId={context.organizationId}
        >
          {activeTab === 'roles' && (
            <RolesManagement organizationId={context.organizationId} />
          )}
          
          {activeTab === 'assignments' && (
            <RoleAssignment organizationId={context.organizationId} />
          )}
          
          {activeTab === 'analytics' && (
            <RoleAnalytics organizationId={context.organizationId} />
          )}
        </PermissionGuard>
      </div>
    </div>
  );
}

// Componente placeholder para analíticas
interface RoleAnalyticsProps {
  organizationId: number;
}

function RoleAnalytics({ organizationId }: RoleAnalyticsProps) {
  const [stats, setStats] = useState({
    totalRoles: 0,
    totalMembers: 0,
    customRoles: 0,
    systemRoles: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        
        // Obtener estadísticas de roles
        const { data: rolesData, error: rolesError } = await supabase
          .from('roles')
          .select('id, is_system')
          .or(`organization_id.eq.${organizationId},is_system.eq.true`);

        if (rolesError) throw rolesError;

        // Obtener estadísticas de miembros
        const { data: membersData, error: membersError } = await supabase
          .from('organization_members')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('is_active', true);

        if (membersError) throw membersError;

        const totalRoles = rolesData?.length || 0;
        const systemRoles = rolesData?.filter((r: any) => r.is_system).length || 0;
        const customRoles = totalRoles - systemRoles;
        const totalMembers = membersData?.length || 0;

        setStats({
          totalRoles,
          totalMembers,
          customRoles,
          systemRoles
        });
        
      } catch (error) {
        console.error('Error loading analytics:', error);
        toast.error('Error al cargar estadísticas');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [organizationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-2 text-gray-600">Cargando estadísticas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Analíticas de Roles</h2>
        <p className="mt-1 text-sm text-gray-500">
          Estadísticas y métricas sobre roles y permisos en tu organización
        </p>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Shield className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total de Roles
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.totalRoles}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total de Miembros
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.totalMembers}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Settings className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Roles Personalizados
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.customRoles}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Shield className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Roles del Sistema
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.systemRoles}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Placeholder para más analíticas */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Próximas Funcionalidades
        </h3>
        <div className="space-y-3 text-sm text-gray-600">
          <p>• Gráfico de distribución de roles por miembro</p>
          <p>• Análisis de permisos más utilizados</p>
          <p>• Historial de cambios de roles</p>
          <p>• Reporte de accesos por módulo</p>
          <p>• Alertas de seguridad y permisos</p>
        </div>
      </div>
    </div>
  );
}
