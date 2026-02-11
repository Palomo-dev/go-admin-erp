'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/config'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Shield, 
  Users, 
  Briefcase, 
  Key, 
  TrendingUp, 
  Activity, 
  Loader2,
  Download,
  Calendar,
  Eye,
  CheckCircle2,
  XCircle
} from 'lucide-react'
import { AnalyticsSkeleton } from './RolesSkeleton'

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
  totalJobPositions: number
  rolesDistribution: Array<{ name: string; count: number }>
  jobPositionsDistribution: Array<{ name: string; count: number }>
  topGrantedPermissions: Array<{ name: string; count: number; module: string }>
  topDeniedPermissions: Array<{ name: string; count: number; module: string }>
  recentChanges: Array<{
    id: string
    action: string
    entity: string
    user_email: string
    logged_at: string
    diff: any
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
    totalJobPositions: 0,
    rolesDistribution: [],
    jobPositionsDistribution: [],
    topGrantedPermissions: [],
    topDeniedPermissions: [],
    recentChanges: []
  })
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedChange, setSelectedChange] = useState<any>(null)

  useEffect(() => {
    loadStats()
  }, [organizationId])

  const loadStats = async () => {
    try {
      setLoading(true)

      // Obtener roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('id, name, is_system')

      if (rolesError) throw rolesError

      // Obtener miembros con job_position
      const { data: membersData, error: membersError } = await supabase
        .from('organization_members')
        .select(`
          id, 
          is_active, 
          role_id, 
          job_position_id,
          roles(name),
          job_positions(name)
        `)
        .eq('organization_id', organizationId)

      if (membersError) throw membersError

      // Obtener permisos
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('permissions')
        .select('id, name, code, module')

      if (permissionsError) throw permissionsError

      // Obtener job positions
      const { data: jobPositionsData, error: jobPositionsError } = await supabase
        .from('job_positions')
        .select('id, name')
        .eq('organization_id', organizationId)

      if (jobPositionsError) throw jobPositionsError

      // Obtener permisos otorgados en roles
      const { data: rolePermsData, error: rolePermsError } = await supabase
        .from('role_permissions')
        .select(`
          permission_id,
          allowed,
          permissions(name, module)
        `)
        .eq('allowed', true)

      if (rolePermsError) throw rolePermsError

      // Obtener permisos otorgados en job positions
      const { data: jobPermsData, error: jobPermsError } = await supabase
        .from('job_position_permissions')
        .select(`
          permission_id,
          allowed,
          job_position_id,
          permissions(name, module)
        `)
        .eq('allowed', true)

      if (jobPermsError) throw jobPermsError

      // Construir query de audit log con filtros de fecha
      let auditQuery = supabase
        .from('roles_audit_log')
        .select(`
          id,
          action,
          entity,
          logged_at,
          user_id,
          diff
        `)
        .eq('organization_id', organizationId)

      if (dateFrom) {
        auditQuery = auditQuery.gte('logged_at', dateFrom)
      }
      if (dateTo) {
        auditQuery = auditQuery.lte('logged_at', dateTo)
      }

      const { data: auditData } = await auditQuery
        .order('logged_at', { ascending: false })
        .limit(20)

      // Obtener emails de usuarios para el audit log
      let recentChanges: any[] = []
      if (auditData && auditData.length > 0) {
        // Intentar obtener usuarios desde auth.users
        const userIds = [...new Set(auditData.map(a => a.user_id).filter(Boolean))]
        
        if (userIds.length > 0) {
          const { data: authData } = await supabase.auth.admin.listUsers()
          const userMap = new Map(authData?.users?.map(u => [u.id, u.email]) || [])
          
          recentChanges = auditData.map(change => ({
            ...change,
            user_email: userMap.get(change.user_id) || 'Sistema'
          }))
        } else {
          recentChanges = auditData.map(change => ({
            ...change,
            user_email: 'Sistema'
          }))
        }
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

      // Calcular distribución de job positions
      const jobPosCountMap = new Map<string, number>()
      membersData?.forEach((member: any) => {
        if (member.job_positions?.name) {
          const posName = member.job_positions.name
          jobPosCountMap.set(posName, (jobPosCountMap.get(posName) || 0) + 1)
        }
      })

      const jobPositionsDistribution = Array.from(jobPosCountMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      // Calcular permisos más otorgados
      const permCountMap = new Map<string, { count: number; module: string }>()
      
      rolePermsData?.forEach((rp: any) => {
        if (rp.permissions) {
          const key = rp.permissions.name
          const current = permCountMap.get(key) || { count: 0, module: rp.permissions.module }
          permCountMap.set(key, { count: current.count + 1, module: rp.permissions.module })
        }
      })

      jobPermsData?.forEach((jp: any) => {
        if (jp.permissions) {
          const key = jp.permissions.name
          const current = permCountMap.get(key) || { count: 0, module: jp.permissions.module }
          permCountMap.set(key, { count: current.count + 1, module: jp.permissions.module })
        }
      })

      const topGrantedPermissions = Array.from(permCountMap.entries())
        .map(([name, data]) => ({ name, count: data.count, module: data.module }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      // Para permisos negados, buscar en role_permissions con allowed=false
      const { data: deniedPermsData } = await supabase
        .from('role_permissions')
        .select(`
          permission_id,
          permissions(name, module)
        `)
        .eq('allowed', false)

      const deniedCountMap = new Map<string, { count: number; module: string }>()
      deniedPermsData?.forEach((rp: any) => {
        if (rp.permissions) {
          const key = rp.permissions.name
          const current = deniedCountMap.get(key) || { count: 0, module: rp.permissions.module }
          deniedCountMap.set(key, { count: current.count + 1, module: rp.permissions.module })
        }
      })

      const topDeniedPermissions = Array.from(deniedCountMap.entries())
        .map(([name, data]) => ({ name, count: data.count, module: data.module }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      // Calcular estadísticas
      const totalRoles = rolesData?.length || 0
      const systemRoles = rolesData?.filter(r => r.is_system).length || 0
      const customRoles = totalRoles - systemRoles
      const totalMembers = membersData?.length || 0
      const activeMembers = membersData?.filter((m: any) => m.is_active).length || 0
      const totalPermissions = permissionsData?.length || 0
      const totalJobPositions = jobPositionsData?.length || 0

      setStats({
        totalRoles,
        totalMembers,
        customRoles,
        systemRoles,
        totalPermissions,
        activeMembers,
        totalJobPositions,
        rolesDistribution,
        jobPositionsDistribution,
        topGrantedPermissions,
        topDeniedPermissions,
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

  const handleApplyFilters = () => {
    loadStats()
  }

  const handleClearFilters = () => {
    setDateFrom('')
    setDateTo('')
    loadStats()
  }

  const exportToCSV = () => {
    try {
      const csvData = [
        ['Métrica', 'Valor'],
        ['Total de Roles', stats.totalRoles],
        ['Roles del Sistema', stats.systemRoles],
        ['Roles Personalizados', stats.customRoles],
        ['Total de Miembros', stats.totalMembers],
        ['Miembros Activos', stats.activeMembers],
        ['Total de Permisos', stats.totalPermissions],
        ['Total de Cargos', stats.totalJobPositions],
        [''],
        ['Distribución de Roles', ''],
        ...stats.rolesDistribution.map(r => [r.name, r.count]),
        [''],
        ['Distribución de Cargos', ''],
        ...stats.jobPositionsDistribution.map(j => [j.name, j.count]),
        [''],
        ['Permisos Más Otorgados', 'Cantidad', 'Módulo'],
        ...stats.topGrantedPermissions.map(p => [p.name, p.count, p.module]),
        [''],
        ['Cambios Recientes', 'Acción', 'Entidad', 'Usuario', 'Fecha'],
        ...stats.recentChanges.map(c => [
          c.action,
          c.entity,
          c.user_email,
          new Date(c.logged_at).toLocaleString('es-ES')
        ])
      ]

      const csv = csvData.map(row => row.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      
      link.setAttribute('href', url)
      link.setAttribute('download', `analiticas-roles-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast({
        title: 'Éxito',
        description: 'Métricas exportadas correctamente'
      })
    } catch (error) {
      console.error('Error exporting CSV:', error)
      toast({
        title: 'Error',
        description: 'No se pudo exportar el archivo',
        variant: 'destructive'
      })
    }
  }

  if (loading) {
    return <AnalyticsSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Título y Acciones */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Analíticas de Roles</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Estadísticas y métricas sobre roles, permisos y cargos en tu organización
          </p>
        </div>
        <Button
          onClick={exportToCSV}
          className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filtros de Fecha */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
            Filtros de Fecha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="dateFrom" className="text-gray-900 dark:text-white">Desde</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div>
              <Label htmlFor="dateTo" className="text-gray-900 dark:text-white">Hasta</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={handleApplyFilters}
                className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                Aplicar
              </Button>
              <Button
                onClick={handleClearFilters}
                variant="outline"
                className="flex-1"
              >
                Limpiar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tarjetas de estadísticas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
                  <Briefcase className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
              <div className="ml-4 flex-1">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Total de Cargos
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalJobPositions}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  En la organización
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid de Distribuciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

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

      {/* Distribución de Cargos */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center">
            <Briefcase className="h-5 w-5 mr-2 text-orange-600 dark:text-orange-400" />
            Cargos Más Usados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.jobPositionsDistribution.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No hay datos de cargos disponibles
            </p>
          ) : (
            <div className="space-y-4">
              {stats.jobPositionsDistribution.map((position, index) => {
                const percentage = stats.totalMembers > 0 
                  ? (position.count / stats.totalMembers * 100).toFixed(1) 
                  : 0
                
                return (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {position.name}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {position.count} empleados ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-orange-600 dark:bg-orange-500 h-2 rounded-full transition-all"
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
      </div>

      {/* Grid de Permisos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Permisos Más Otorgados */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center">
            <CheckCircle2 className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
            Permisos Más Otorgados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.topGrantedPermissions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No hay permisos otorgados
            </p>
          ) : (
            <div className="space-y-3">
              {stats.topGrantedPermissions.map((perm, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {perm.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {perm.module}
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-green-600 text-white">
                    {perm.count}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permisos Más Negados */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center">
            <XCircle className="h-5 w-5 mr-2 text-red-600 dark:text-red-400" />
            Permisos Más Negados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.topDeniedPermissions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No hay permisos negados explícitamente
            </p>
          ) : (
            <div className="space-y-3">
              {stats.topDeniedPermissions.map((perm, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {perm.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {perm.module}
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-red-600 text-white">
                    {perm.count}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

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
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                No hay actividad reciente
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Los cambios se registrarán cuando se creen, editen o eliminen roles y permisos
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentChanges.map((change) => (
                <div
                  key={change.id}
                  className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                      <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                      {change.action} - {change.entity}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Por {change.user_email}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(change.logged_at).toLocaleString('es-ES')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedChange(change)}
                    className="flex-shrink-0"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver detalle
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de Detalle de Cambio */}
      {selectedChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-gray-900 dark:text-white capitalize">
                  Detalle del Cambio: {selectedChange.action}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedChange(null)}
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-900 dark:text-white">Entidad</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">{selectedChange.entity}</p>
                </div>
                <div>
                  <Label className="text-gray-900 dark:text-white">Acción</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">{selectedChange.action}</p>
                </div>
                <div>
                  <Label className="text-gray-900 dark:text-white">Usuario</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{selectedChange.user_email}</p>
                </div>
                <div>
                  <Label className="text-gray-900 dark:text-white">Fecha</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {new Date(selectedChange.logged_at).toLocaleString('es-ES')}
                  </p>
                </div>
              </div>
              
              {selectedChange.diff && (
                <div>
                  <Label className="text-gray-900 dark:text-white">Detalles del Cambio</Label>
                  <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg overflow-auto max-h-96">
                    <pre className="text-xs text-gray-700 dark:text-gray-300">
                      {JSON.stringify(selectedChange.diff, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
