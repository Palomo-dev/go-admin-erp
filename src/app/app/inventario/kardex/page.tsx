'use client'

import { useEffect, useState } from 'react'
import { useOrganization } from '@/lib/hooks/useOrganization'
import KardexInventario from '@/components/inventario/kardex/KardexInventario'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function KardexPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Kardex de Inventario</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Consulta todos los movimientos de inventario, existencias y valoración de productos.
        </p>
      </div>
      
      <Tabs defaultValue="movimientos" className="space-y-6">
        <TabsList>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="existencias">Existencias</TabsTrigger>
          <TabsTrigger value="valoracion">Valoración</TabsTrigger>
        </TabsList>
        
        <TabsContent value="movimientos">
          <KardexInventario tipo="movimientos" organizationId={organization?.id} />
        </TabsContent>
        
        <TabsContent value="existencias">
          <KardexInventario tipo="existencias" organizationId={organization?.id} />
        </TabsContent>
        
        <TabsContent value="valoracion">
          <KardexInventario tipo="valoracion" organizationId={organization?.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
