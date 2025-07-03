'use client'

import { useEffect, useState } from 'react'
import { useOrganization } from '@/lib/hooks/useOrganization'
import EntradasInventario from '@/components/inventario/entradas/EntradasInventario'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function EntradasPage() {
  const { organization, isLoading } = useOrganization()
  
  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-600"></div>
          <h2 className="text-lg font-medium">Cargando...</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Entradas de Inventario</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Gestiona todas las entradas de productos al inventario: compras, devoluciones y ajustes positivos.
        </p>
      </div>

      <Tabs defaultValue="todas" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="todas">Todas las Entradas</TabsTrigger>
          <TabsTrigger value="pendientes">Entradas Pendientes</TabsTrigger>
          <TabsTrigger value="nueva">Nueva Entrada</TabsTrigger>
        </TabsList>
        
        <TabsContent value="todas" className="space-y-4">
          <EntradasInventario tipo="todas" organizationId={organization?.id} />
        </TabsContent>
        
        <TabsContent value="pendientes" className="space-y-4">
          <EntradasInventario tipo="pendientes" organizationId={organization?.id} />
        </TabsContent>
        
        <TabsContent value="nueva" className="space-y-4">
          <EntradasInventario tipo="nueva" organizationId={organization?.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
