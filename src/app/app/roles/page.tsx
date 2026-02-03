'use client'

import { useState } from 'react'
import { useOrganization } from '@/lib/hooks/useOrganization'
import RolesManagement from '@/components/admin/RolesManagement'
import RoleAssignment from '@/components/admin/RoleAssignment'
import PermissionsManagement from '@/components/admin/PermissionsManagement'
import RoleAnalytics from '@/components/admin/RoleAnalytics'
import { Shield, Users, Key, BarChart3, Loader2 } from 'lucide-react'
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
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Administración de Roles
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Gestión de roles y permisos
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido con Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <TabsTrigger 
              value="roles"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-500"
            >
              <Shield className="h-4 w-4 mr-2" />
              Gestión de Roles
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

          <TabsContent value="analytics" className="space-y-4">
            <RoleAnalytics organizationId={organization.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
