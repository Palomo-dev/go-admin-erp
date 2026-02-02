'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/config'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Users, Settings, Key, TrendingUp, Activity, Loader2 } from 'lucide-react'

interface RoleAnalyticsProps {
  organizationId: number
}

interface Stats {
  totalRoles: number
  totalMembers: number
  customRoles: number
  systemRoles: number
  totalPermissions: number
  activeMembers: number
  rolesDistribution: Array<{ name: string; count: number }>
  recentChanges: Array<{
    id: string
    action: string
    entity: string
    user_email: string
    logged_at: string
  }>
}

export default function RoleAnalytics({ organizationId }: RoleAnalyticsProps) {
  const { toast } = useToast()
  const [stats, setStats] = useState<Stats>({
    totalRoles: 0,
    totalMembers: 0,
    customRoles: 0,
    systemRoles: 0,
    totalPermissions: 0,
    activeMembers: 0,
    rolesDistribution: [],
    recentChanges: []
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [organizationId])

  const loadStats = async () => {
    try {
      setLoading(true)

      // Obtener roles (todos son globales ahora)
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('id, name, is_system')

      if (rolesError) throw rolesError

      // Obtener miembros
      const { data: membersData, error: membersError } = await supabase
        .from('organization_members')
        .select('id, is_active, role_id, roles(name)')
        .eq('organization_id', organizationId)

      if (membersError) throw membersError

      // Obtener permisos
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('permissions')
        .select('id')

      if (permissionsError) throw permissionsError

      // Obtener cambios recientes (últimos 10)
      const { data: auditData, error: auditError } = await supabase
        .from('roles_audit_log')
        .select(`
          id,
          action,
          entity,
          logged_at,
          user_id
        `)
        .eq('organization_id', organizationId)
        .order('logged_at', { ascending: false })
        .limit(10)

      // Obtener emails de usuarios para el audit log
      let recentChanges: any[] = []
      if (auditData && auditData.length > 0) {
        const userIds = [...new Set(auditData.map(a => a.user_id))]
        const { data: usersData } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds)

        const userMap = new Map(usersData?.map(u => [u.id, u.email]) || [])
        
        recentChanges = auditData.map(change => ({
          ...change,
          user_email: userMap.get(change.user_id) || 'Usuario desconocido'
        }))
      }

      // Calcular distribución de roles
      const roleCountMap = new Map<string, number>()
      membersData?.forEach((member: any) => {
        const roleName = member.roles?.name || 'Sin rol'
        roleCountMap.set(roleName, (roleCountMap.get(roleName) || 0) + 1)
      })

      const rolesDistribution = Array.from(roleCountMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      // Calcular estadísticas
      const totalRoles = rolesData?.length || 0
      const systemRoles = rolesData?.filter(r => r.is_system).length || 0
      const customRoles = totalRoles - systemRoles
      const totalMembers = membersData?.length || 0
      const activeMembers = membersData?.filter((m: any) => m.is_active).length || 0
      const totalPermissions = permissionsData?.length || 0

      setStats({
        totalRoles,
        totalMembers,
        customRoles,
        systemRoles,
        totalPermissions,
        activeMembers,
        rolesDistribution,
        recentChanges
      })
    } catch (error) {
      console.error('Error loading analytics:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las estadísticas',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando estadísticas...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Título */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Analíticas de Roles</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Estadísticas y métricas sobre roles y permisos en tu organización
        </p>
      </div>

      {/* Tarjetas de estadísticas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                  <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="ml-4 flex-1">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Total de Roles
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalRoles}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {stats.customRoles} personalizados
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                  <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="ml-4 flex-1">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Total de Miembros
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalMembers}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {stats.activeMembers} activos
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                  <Key className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <div className="ml-4 flex-1">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Total de Permisos
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalPermissions}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Disponibles en el sistema
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribución de roles */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
            Distribución de Roles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.rolesDistribution.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No hay datos de distribución disponibles
            </p>
          ) : (
            <div className="space-y-4">
              {stats.rolesDistribution.map((role, index) => {
                const percentage = stats.totalMembers > 0 
                  ? (role.count / stats.totalMembers * 100).toFixed(1) 
                  : 0
                
                return (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {role.name}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {role.count} miembros ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actividad reciente */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center">
            <Activity className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
            Actividad Reciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentChanges.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No hay actividad reciente
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentChanges.map((change) => (
                <div
                  key={change.id}
                  className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                >
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                      <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {change.action} - {change.entity}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Por {change.user_email}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(change.logged_at).toLocaleString('es-ES')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
