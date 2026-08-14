"use client"

import { Label } from '@/components/ui/label'
import { FileText } from 'lucide-react'
import { RichTextEditor } from '@/components/shared/RichTextEditor'

interface NotasProps {
  formData: any
  updateFormData: (field: string, value: any) => void
}

export default function Notas({ formData, updateFormData }: NotasProps) {
  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
          <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Notas Adicionales
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Información complementaria del producto
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="text-gray-700 dark:text-gray-300">
          Notas
        </Label>
        <RichTextEditor
          value={formData.notes}
          onChange={(html) => updateFormData('notes', html)}
          placeholder="Instrucciones especiales, características adicionales, advertencias, etc."
          className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Estas notas serán visibles en el detalle del producto
        </p>
      </div>
    </div>
  )
}
