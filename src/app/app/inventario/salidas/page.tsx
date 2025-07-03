'use client'

import { useEffect, useState } from 'react'
import { useOrganization } from '@/lib/hooks/useOrganization'
import SalidasInventario from '@/components/inventario/salidas/SalidasInventario'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SalidasPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Salidas de Inventario</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Gestiona todas las salidas de productos del inventario: ventas, devoluciones de clientes y ajustes negativos.
        </p>
      </div>
      
      <Tabs defaultValue="todas" className="space-y-6">
        <TabsList>
          <TabsTrigger value="todas">Todas las Salidas</TabsTrigger>
          <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
          <TabsTrigger value="nueva">Nueva Salida</TabsTrigger>
        </TabsList>
        
        <TabsContent value="todas">
          <SalidasInventario tipo="todas" organizationId={organization?.id} />
        </TabsContent>
        
        <TabsContent value="pendientes">
          <SalidasInventario tipo="pendientes" organizationId={organization?.id} />
        </TabsContent>
        
        <TabsContent value="nueva">
          <SalidasInventario tipo="nueva" organizationId={organization?.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
