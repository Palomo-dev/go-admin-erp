"use client"

import { Plus } from 'lucide-react'
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { VariantType } from './types'

interface SelectorTipoVarianteProps {
  isLoading: boolean
  variantTypes: VariantType[]
  selectedVariantTypes: VariantType[]
  onSelectType: (tipoId: string) => void
  onNewType: () => void
}

export const SelectorTipoVariante = ({
  isLoading,
  variantTypes,
  selectedVariantTypes,
  onSelectType,
  onNewType
}: SelectorTipoVarianteProps) => {
  return (
    <div className="flex items-center gap-3 mb-4">
      <Select 
        disabled={isLoading}
        onValueChange={onSelectType}
      >
        <SelectTrigger className="w-[240px]">
          <SelectValue placeholder="Seleccionar tipo de variante" />
        </SelectTrigger>
        <SelectContent>
          {isLoading ? (
            <SelectItem value="loading" disabled>Cargando tipos...</SelectItem>
          ) : variantTypes.length === 0 ? (
            <SelectItem value="empty" disabled>No hay tipos disponibles</SelectItem>
          ) : (
            variantTypes
              .filter(tipo => 
                !selectedVariantTypes.some(selected => selected.id === tipo.id)
              )
              .map((tipo) => (
                <SelectItem key={tipo.id} value={tipo.id.toString()}>
                  {tipo.name + (tipo.organization_id === 0 ? ' (estándar)' : '')}
                </SelectItem>
              ))
          )}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="whitespace-nowrap"
        onClick={onNewType}
        disabled={false} // Aseguramos que este botón nunca esté deshabilitado
      >
        <Plus className="mr-2 h-4 w-4" /> Nuevo tipo
      </Button>
    </div>
  )
}
