'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase/config'
import ListaEntradas from './ListaEntradas'
import FormularioEntrada from './FormularioEntrada'
import EscaneoMasivo from './EscaneoMasivo'
import { useToast } from '@/components/ui/use-toast'

interface EntradasInventarioProps {
  tipo: 'todas' | 'pendientes' | 'nueva'
  organizationId?: number
}

export default function EntradasInventario({ tipo, organizationId }: EntradasInventarioProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'formulario' | 'escaneo'>('formulario')
  const { toast } = useToast()

  if (!organizationId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-10">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              No se ha seleccionado una organización
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Por favor, selecciona una organización para continuar.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (tipo === 'todas' || tipo === 'pendientes') {
    const filtro = tipo === 'pendientes' ? 'pendientes' : 'todas'
    
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl font-bold">
            {filtro === 'pendientes' ? 'Entradas Pendientes' : 'Todas las Entradas'}
          </CardTitle>
          <div className="w-full max-w-sm ml-auto">
            <Input
              type="search"
              placeholder="Buscar por referencia, proveedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          <ListaEntradas 
            filtro={filtro} 
            organizationId={organizationId} 
            searchTerm={searchTerm}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold">Nueva Entrada de Inventario</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'formulario' | 'escaneo')}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="formulario">Formulario de Entrada</TabsTrigger>
            <TabsTrigger value="escaneo">Escaneo Masivo</TabsTrigger>
          </TabsList>
          
          <TabsContent value="formulario" className="space-y-4">
            <FormularioEntrada organizationId={organizationId} />
          </TabsContent>
          
          <TabsContent value="escaneo" className="space-y-4">
            <EscaneoMasivo organizationId={organizationId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
