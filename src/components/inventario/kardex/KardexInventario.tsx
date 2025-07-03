'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase/config'
import FiltrosInventario from '../FiltrosInventario'
import TablaMovimientos from './TablaMovimientos'
import TablaExistencias from './TablaExistencias'
import TablaValoracion from './TablaValoracion'
import { useToast } from '@/components/ui/use-toast'

interface KardexInventarioProps {
  tipo: 'movimientos' | 'existencias' | 'valoracion'
  organizationId?: number
}

export default function KardexInventario({ tipo, organizationId }: KardexInventarioProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filtros, setFiltros] = useState({
    sucursal_id: '',
    categoria_id: '',
    fecha_inicio: '',
    fecha_fin: '',
    tipo_movimiento: '',
    ordenar_por: 'fecha_desc'
  })
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
  }

  const handleFiltroChange = (key: string, value: string) => {
    setFiltros(prev => ({ ...prev, [key]: value }))
  }

  const aplicarFiltros = () => {
    // La lógica de aplicar filtros se implementa dentro de cada componente de tabla
    console.log("Aplicando filtros:", filtros)
    toast({
      title: "Filtros aplicados",
      description: "Los resultados han sido actualizados según los filtros seleccionados."
    })
  }

  const limpiarFiltros = () => {
    setFiltros({
      sucursal_id: '',
      categoria_id: '',
      fecha_inicio: '',
      fecha_fin: '',
      tipo_movimiento: '',
      ordenar_por: 'fecha_desc'
    })
    setSearchTerm('')
    toast({
      title: "Filtros limpiados",
      description: "Se han restablecido todos los filtros a sus valores predeterminados."
    })
  }

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl font-bold">
          {tipo === 'movimientos' && "Movimientos de Inventario"}
          {tipo === 'existencias' && "Existencias Actuales"}
          {tipo === 'valoracion' && "Valoración de Inventario"}
        </CardTitle>
        <div className="w-full max-w-sm ml-auto">
          <Input
            type="search"
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="max-w-xs"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <FiltrosInventario 
            filtros={filtros}
            onChange={handleFiltroChange}
            onAplicar={aplicarFiltros}
            onLimpiar={limpiarFiltros}
            organizationId={organizationId}
            mostrarTipoMovimiento={tipo === 'movimientos'}
          />
        </div>

        {tipo === 'movimientos' && (
          <TablaMovimientos 
            organizationId={organizationId}
            searchTerm={searchTerm}
            filtros={filtros}
          />
        )}
        
        {tipo === 'existencias' && (
          <TablaExistencias
            organizationId={organizationId}
            searchTerm={searchTerm}
            filtros={filtros}
          />
        )}
        
        {tipo === 'valoracion' && (
          <TablaValoracion
            organizationId={organizationId}
            searchTerm={searchTerm}
            filtros={filtros}
          />
        )}
      </CardContent>
    </Card>
  )
}
