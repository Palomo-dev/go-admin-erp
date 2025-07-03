'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase/config'
import ListaSalidas from './ListaSalidas'
import FormularioSalida from './FormularioSalida'
import { useToast } from '@/components/ui/use-toast'

interface SalidasInventarioProps {
  tipo: 'todas' | 'pendientes' | 'nueva'
  organizationId?: number
}

export default function SalidasInventario({ tipo, organizationId }: SalidasInventarioProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'formulario' | 'masivo'>('formulario')
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
            {filtro === 'pendientes' ? 'Salidas Pendientes' : 'Todas las Salidas'}
          </CardTitle>
          <div className="w-full max-w-sm ml-auto">
            <Input
              type="search"
              placeholder="Buscar por referencia, cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          <ListaSalidas 
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
        <CardTitle className="text-xl font-bold">Nueva Salida de Inventario</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'formulario' | 'masivo')}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="formulario">Formulario de Salida</TabsTrigger>
            <TabsTrigger value="masivo">Salida Masiva</TabsTrigger>
          </TabsList>
          
          <TabsContent value="formulario" className="space-y-4">
            <FormularioSalida organizationId={organizationId} />
          </TabsContent>
          
          <TabsContent value="masivo" className="space-y-4">
            <div className="bg-muted/50 p-6 rounded-lg text-center">
              <h3 className="text-lg font-medium mb-2">Módulo de Salida Masiva</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Este módulo permitirá procesar salidas masivas para ventas o ajustes.
              </p>
              <Button disabled>Próximamente</Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
