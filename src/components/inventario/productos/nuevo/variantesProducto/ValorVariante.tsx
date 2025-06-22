"use client"

import { Edit, Trash2, Check } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { VariantValue } from './types'

interface ValorVarianteProps {
  valor: VariantValue
  isSelected?: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

export const ValorVariante = ({
  valor,
  isSelected = false,
  onToggle,
  onEdit,
  onDelete
}: ValorVarianteProps) => {
  return (
    <div className="flex items-center justify-between p-2 rounded-md dark:bg-gray-700/50 light:bg-white/90 dark:border-gray-600 light:border-gray-200 border">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={isSelected ? "default" : "outline"}
          size="sm"
          onClick={onToggle}
          className={isSelected ? 
            "dark:bg-purple-600 dark:hover:bg-purple-700 light:bg-purple-500 light:hover:bg-purple-600 h-7 w-7 p-0" : 
            "dark:bg-gray-800 dark:hover:bg-gray-700 light:bg-white light:hover:bg-gray-100 h-7 w-7 p-0"
          }
        >
          {isSelected && <Check className="h-4 w-4" />}
        </Button>
        <span className="text-sm dark:text-gray-200 light:text-gray-700">{valor.value}</span>
      </div>
      
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-7 w-7 p-0 dark:text-gray-300 dark:hover:text-white light:text-gray-600 light:hover:text-gray-900"
        >
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-7 w-7 p-0 dark:text-gray-300 dark:hover:text-white light:text-gray-600 light:hover:text-gray-900"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
