'use client'

import { useState } from 'react'
import { useOrganization } from '@/lib/hooks/useOrganization'
import RolesManagement from '@/components/admin/RolesManagement'
import RoleAssignment from '@/components/admin/RoleAssignment'
import PermissionsManagement from '@/components/admin/PermissionsManagement'
import RoleAnalytics from '@/components/admin/RoleAnalytics'
import JobPositionsManagement from '@/components/admin/JobPositionsManagement'
import { Shield, Users, Key, BarChart3, Loader2, Briefcase } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function RolesAdminPage() {
  const { organization, isLoading } = useOrganization()
  const [activeTab, setActiveTab] = useState('roles')

  if (isLoading || !organization) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 dark:text-blue-400 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Administración de Roles
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Gestión de roles y permisos
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido con Tabs */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <TabsTrigger 
              value="roles"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-500"
            >
              <Shield className="h-4 w-4 mr-2" />
              Roles
            </TabsTrigger>
            <TabsTrigger 
              value="assignments"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-500"
            >
              <Users className="h-4 w-4 mr-2" />
              Asignación
            </TabsTrigger>
            <TabsTrigger 
              value="permissions"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-500"
            >
              <Key className="h-4 w-4 mr-2" />
              Permisos
            </TabsTrigger>
            <TabsTrigger 
              value="positions"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-500"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Cargos
            </TabsTrigger>
            <TabsTrigger 
              value="analytics"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-500"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Analíticas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="space-y-4">
            <RolesManagement organizationId={organization.id} />
          </TabsContent>

          <TabsContent value="assignments" className="space-y-4">
            <RoleAssignment organizationId={organization.id} />
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4">
            <PermissionsManagement organizationId={organization.id} />
          </TabsContent>

          <TabsContent value="positions" className="space-y-4">
            <JobPositionsManagement organizationId={organization.id} />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <RoleAnalytics organizationId={organization.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
