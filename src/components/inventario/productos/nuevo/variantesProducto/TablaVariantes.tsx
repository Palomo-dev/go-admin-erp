"use client"

import { useState } from 'react'
import { Edit } from 'lucide-react'
import { VariantCombination, VariantType } from './types'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface TablaVariantesProps {
  variantCombinations: VariantCombination[]
  selectedVariantTypes: VariantType[]
  onUpdateCombinations: (combinations: VariantCombination[]) => void
}

export const TablaVariantes = ({
  variantCombinations,
  selectedVariantTypes,
  onUpdateCombinations
}: TablaVariantesProps) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<'sku' | 'price' | 'cost' | 'stock' | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  const startEditing = (index: number, field: 'sku' | 'price' | 'cost' | 'stock', value: string) => {
    setEditingIndex(index)
    setEditingField(field)
    setEditValue(value)
  }

  const saveEdit = () => {
    if (editingIndex === null || editingField === null) return

    const updatedCombinations = [...variantCombinations]
    const combination = updatedCombinations[editingIndex]

    if (!combination) return

    switch (editingField) {
      case 'sku':
        combination.sku = editValue
        break
      case 'price':
        combination.price = parseFloat(editValue) || 0
        break
      case 'cost':
        combination.cost = parseFloat(editValue) || 0
        break
      case 'stock':
        combination.stock_quantity = parseInt(editValue) || 0
        break
    }

    onUpdateCombinations(updatedCombinations)
    setEditingIndex(null)
    setEditingField(null)
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      saveEdit()
    } else if (e.key === 'Escape') {
      setEditingIndex(null)
      setEditingField(null)
    }
  }

  if (variantCombinations.length === 0) {
    return (
      <div className="text-center py-8 dark:text-gray-400 light:text-gray-600">
        No hay combinaciones de variantes generadas
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            {selectedVariantTypes.map((tipo, index) => (
              <TableHead key={index} className="dark:text-gray-300 light:text-gray-700">
                {tipo.name}
              </TableHead>
            ))}
            <TableHead className="dark:text-gray-300 light:text-gray-700">SKU</TableHead>
            <TableHead className="dark:text-gray-300 light:text-gray-700">Precio</TableHead>
            <TableHead className="dark:text-gray-300 light:text-gray-700">Costo</TableHead>
            <TableHead className="dark:text-gray-300 light:text-gray-700">Stock</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variantCombinations.map((combination, index) => (
            <TableRow key={index} className="dark:border-gray-700 light:border-gray-200">
              {combination.attributes.map((attr, attrIndex) => (
                <TableCell key={attrIndex} className="dark:text-gray-300 light:text-gray-700">
                  {attr.value}
                </TableCell>
              ))}
              
              <TableCell>
                {editingIndex === index && editingField === 'sku' ? (
                  <div className="flex items-center space-x-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyPress}
                      autoFocus
                      className="h-8 text-sm dark:bg-gray-700 dark:border-gray-600 light:bg-white"
                    />
                  </div>
                ) : (
                  <div className="flex items-center space-x-1">
                    <span className="dark:text-gray-300 light:text-gray-700">{combination.sku}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditing(index, 'sku', combination.sku)}
                      className="h-6 w-6 p-0 dark:text-gray-400 dark:hover:text-white light:text-gray-600 light:hover:text-gray-900"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </TableCell>
              
              <TableCell>
                {editingIndex === index && editingField === 'price' ? (
                  <div className="flex items-center space-x-1">
                    <Input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyPress}
                      autoFocus
                      className="h-8 text-sm dark:bg-gray-700 dark:border-gray-600 light:bg-white"
                    />
                  </div>
                ) : (
                  <div className="flex items-center space-x-1">
                    <span className="dark:text-gray-300 light:text-gray-700">
                      {combination.price.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditing(index, 'price', combination.price.toString())}
                      className="h-6 w-6 p-0 dark:text-gray-400 dark:hover:text-white light:text-gray-600 light:hover:text-gray-900"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </TableCell>
              
              <TableCell>
                {editingIndex === index && editingField === 'cost' ? (
                  <div className="flex items-center space-x-1">
                    <Input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyPress}
                      autoFocus
                      className="h-8 text-sm dark:bg-gray-700 dark:border-gray-600 light:bg-white"
                    />
                  </div>
                ) : (
                  <div className="flex items-center space-x-1">
                    <span className="dark:text-gray-300 light:text-gray-700">
                      {combination.cost.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditing(index, 'cost', combination.cost.toString())}
                      className="h-6 w-6 p-0 dark:text-gray-400 dark:hover:text-white light:text-gray-600 light:hover:text-gray-900"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </TableCell>
              
              <TableCell>
                {editingIndex === index && editingField === 'stock' ? (
                  <div className="flex items-center space-x-1">
                    <Input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyPress}
                      autoFocus
                      className="h-8 text-sm dark:bg-gray-700 dark:border-gray-600 light:bg-white"
                    />
                  </div>
                ) : (
                  <div className="flex items-center space-x-1">
                    <span className="dark:text-gray-300 light:text-gray-700">
                      {combination.stock_quantity}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditing(index, 'stock', combination.stock_quantity.toString())}
                      className="h-6 w-6 p-0 dark:text-gray-400 dark:hover:text-white light:text-gray-600 light:hover:text-gray-900"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
