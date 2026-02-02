"use client"

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/config'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tag, X, Loader2, Plus, Search } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface EtiquetasProps {
  formData: any
  updateFormData: (field: string, value: any) => void
}

interface Tag {
  id: number
  name: string
  color: string
}

export default function Etiquetas({ formData, updateFormData }: EtiquetasProps) {
  const { organization } = useOrganization()
  const { toast } = useToast()
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [filteredTags, setFilteredTags] = useState<Tag[]>([])
  const [isLoadingTags, setIsLoadingTags] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6366f1')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const predefinedColors = [
    '#6366f1', // Indigo
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#f59e0b', // Amber
    '#10b981', // Emerald
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#84cc16', // Lime
    '#f97316', // Orange
  ]

  useEffect(() => {
    if (organization?.id) {
      loadTags()
    }
  }, [organization?.id])

  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = availableTags.filter(tag =>
        tag.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredTags(filtered)
    } else {
      setFilteredTags(availableTags)
    }
  }, [searchTerm, availableTags])

  const loadTags = async () => {
    if (!organization?.id) return

    setIsLoadingTags(true)
    try {
      const { data, error } = await supabase
        .from('product_tags')
        .select('id, name, color')
        .eq('organization_id', organization.id)
        .order('name')

      if (error) throw error
      if (data) {
        setAvailableTags(data)
        setFilteredTags(data)
      }
    } catch (error) {
      console.error('Error cargando etiquetas:', error)
    } finally {
      setIsLoadingTags(false)
    }
  }

  const toggleTag = (tagId: number) => {
    const currentTags = formData.tags || []
    if (currentTags.includes(tagId)) {
      updateFormData('tags', currentTags.filter((id: number) => id !== tagId))
    } else {
      updateFormData('tags', [...currentTags, tagId])
    }
  }

  const isTagSelected = (tagId: number) => {
    return (formData.tags || []).includes(tagId)
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast({
        title: "Error",
        description: "El nombre de la etiqueta es requerido",
        variant: "destructive"
      })
      return
    }

    if (!organization?.id) return

    setIsCreatingTag(true)
    try {
      const { data, error } = await supabase
        .from('product_tags')
        .insert({
          organization_id: organization.id,
          name: newTagName.trim(),
          color: newTagColor
        })
        .select()
        .single()

      if (error) throw error

      toast({
        title: "✅ Etiqueta creada",
        description: `La etiqueta "${newTagName}" se ha creado exitosamente`
      })

      // Agregar a la lista y seleccionar automáticamente
      setAvailableTags([...availableTags, data])
      updateFormData('tags', [...(formData.tags || []), data.id])

      // Resetear formulario
      setNewTagName('')
      setNewTagColor('#6366f1')
      setShowCreateDialog(false)
    } catch (error: any) {
      console.error('Error creando etiqueta:', error)
      toast({
        title: "Error al crear etiqueta",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive"
      })
    } finally {
      setIsCreatingTag(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 dark:bg-teal-900/20 rounded-lg">
            <Tag className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Etiquetas
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Clasifica el producto con etiquetas
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          variant="outline"
          size="sm"
          className="border-teal-300 dark:border-teal-700 text-teal-600 dark:text-teal-400"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Etiqueta
        </Button>
      </div>

      {isLoadingTags ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Búsqueda de etiquetas */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Buscar Etiquetas
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre..."
                className="pl-10 border-gray-300 dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
          </div>

          {filteredTags.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <Tag className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {searchTerm ? 'No se encontraron etiquetas' : 'No hay etiquetas disponibles'}
              </p>
              <Button
                type="button"
                onClick={() => setShowCreateDialog(true)}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Crear Primera Etiqueta
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Etiquetas Disponibles ({filteredTags.length})
                </Label>
                <div className="flex flex-wrap gap-2">
                  {filteredTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      style={{
                        backgroundColor: isTagSelected(tag.id) ? tag.color : 'transparent',
                        borderColor: tag.color,
                        color: isTagSelected(tag.id) ? '#fff' : tag.color
                      }}
                      className="cursor-pointer border-2 hover:opacity-80 transition-opacity px-3 py-1.5 text-sm"
                    >
                      {tag.name}
                      {isTagSelected(tag.id) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>

              {formData.tags && formData.tags.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    Etiquetas Seleccionadas ({formData.tags.length})
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tagId: number) => {
                      const tag = availableTags.find(t => t.id === tagId)
                      if (!tag) return null
                      return (
                        <Badge
                          key={tag.id}
                          style={{
                            backgroundColor: tag.color,
                            color: '#fff'
                          }}
                          className="px-3 py-1.5 text-sm"
                        >
                          {tag.name}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Dialog para crear nueva etiqueta */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear Nueva Etiqueta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tagName">
                Nombre de la Etiqueta <span className="text-red-500">*</span>
              </Label>
              <Input
                id="tagName"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Ej: Nuevo, Oferta, Destacado"
                className="border-gray-300 dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
            <div className="space-y-2">
              <Label>Color de la Etiqueta</Label>
              <div className="flex flex-wrap gap-2">
                {predefinedColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewTagColor(color)}
                    className={`w-10 h-10 rounded-full border-2 transition-all ${
                      newTagColor === color
                        ? 'border-gray-900 dark:border-white scale-110'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Label htmlFor="customColor" className="text-sm">
                  O elige un color personalizado:
                </Label>
                <input
                  id="customColor"
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-12 h-8 rounded border border-gray-300 dark:border-gray-700 cursor-pointer"
                />
              </div>
            </div>
            {/* Vista previa */}
            <div className="space-y-2">
              <Label>Vista Previa</Label>
              <Badge
                style={{
                  backgroundColor: newTagColor,
                  color: '#fff'
                }}
                className="px-3 py-1.5"
              >
                {newTagName || 'Nombre de etiqueta'}
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false)
                setNewTagName('')
                setNewTagColor('#6366f1')
              }}
              disabled={isCreatingTag}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateTag}
              disabled={isCreatingTag || !newTagName.trim()}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {isCreatingTag ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Etiqueta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Información adicional */}
      <div className="mt-4 p-4 bg-teal-50 dark:bg-teal-900/10 border border-teal-200 dark:border-teal-800 rounded-lg">
        <p className="text-sm text-teal-800 dark:text-teal-300">
          <strong>Nota:</strong> Las etiquetas te ayudan a organizar y filtrar productos. 
          Puedes crear nuevas etiquetas y seleccionar múltiples para un mismo producto.
        </p>
      </div>
    </div>
  )
}
