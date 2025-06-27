"use client"

import { useState } from 'react'
import { Edit } from 'lucide-react'
import { VariantCombination, VariantType, StockPorSucursal } from './types'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface TablaVariantesProps {
  variantCombinations: VariantCombination[]
  selectedVariantTypes: VariantType[]
  onUpdateCombinations: (combinations: VariantCombination[]) => void
}

type EditingState = {
  index: number;
  field: 'sku' | 'price' | 'cost' | 'stock';
  branchId?: number; // Para stock por sucursal
  value: string;
}

export const TablaVariantes = ({
  variantCombinations,
  selectedVariantTypes,
  onUpdateCombinations
}: TablaVariantesProps) => {
  // Estado para edición más complejo para manejar stock por sucursal
  const [editing, setEditing] = useState<EditingState | null>(null)

  const startEditing = (index: number, field: 'sku' | 'price' | 'cost' | 'stock', value: string, branchId?: number) => {
    setEditing({
      index,
      field,
      branchId,
      value: value.toString()
    })
  }

  const saveEdit = () => {
    if (!editing) return

    const updatedCombinations = [...variantCombinations]
    const combination = updatedCombinations[editing.index]

    if (!combination) return

    switch (editing.field) {
      case 'sku':
        combination.sku = editing.value
        break
      case 'price':
        combination.price = parseFloat(editing.value) || 0
        break
      case 'cost':
        combination.cost = parseFloat(editing.value) || 0
        break
      case 'stock':
        // Si tiene branchId, estamos editando stock por sucursal
        if (editing.branchId !== undefined && combination.stock_por_sucursal) {
          const stockIndex = combination.stock_por_sucursal.findIndex((s: StockPorSucursal) => s.branch_id === editing.branchId)
          if (stockIndex >= 0) {
            combination.stock_por_sucursal[stockIndex].qty_on_hand = parseInt(editing.value) || 0
          }
        } else {
          // Stock general (obsoleto pero mantenido por compatibilidad)
          combination.stock_quantity = parseInt(editing.value) || 0
        }
        break
    }

    onUpdateCombinations(updatedCombinations)
    setEditing(null)
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      saveEdit()
    } else if (e.key === 'Escape') {
      setEditing(null)
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
            <TableHead className="dark:text-gray-300 light:text-gray-700">Stock por Sucursal</TableHead>
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
                {editing?.index === index && editing.field === 'sku' ? (
                  <div className="flex items-center space-x-1">
                    <Input
                      value={editing.value}
                      onChange={(e) => setEditing({...editing, value: e.target.value})}
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
                {editing?.index === index && editing.field === 'price' ? (
                  <div className="flex items-center space-x-1">
                    <Input
                      type="number"
                      value={editing.value}
                      onChange={(e) => setEditing({...editing, value: e.target.value})}
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
                {editing?.index === index && editing.field === 'cost' ? (
                  <div className="flex items-center space-x-1">
                    <Input
                      type="number"
                      value={editing.value}
                      onChange={(e) => setEditing({...editing, value: e.target.value})}
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
                <div className="space-y-2">
                  {combination.stock_por_sucursal && combination.stock_por_sucursal.length > 0 ? (
                    combination.stock_por_sucursal.map((stockItem: StockPorSucursal, stockIndex: number) => (
                      <div key={stockIndex} className="flex items-center justify-between text-sm border-b dark:border-gray-700 pb-1">
                        <span className="dark:text-gray-400 light:text-gray-600 mr-2">
                          Sucursal {stockItem.branch_id}:
                        </span>
                        
                        {editing?.index === index && 
                         editing.field === 'stock' && 
                         editing.branchId === stockItem.branch_id ? (
                          <div className="flex items-center">
                            <Input
                              type="number"
                              value={editing.value}
                              onChange={(e) => setEditing({...editing, value: e.target.value})}
                              onBlur={saveEdit}
                              onKeyDown={handleKeyPress}
                              autoFocus
                              className="h-7 w-20 text-xs dark:bg-gray-700 dark:border-gray-600 light:bg-white"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <span className="dark:text-gray-300 light:text-gray-700 mr-1">
                              {stockItem.qty_on_hand}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(index, 'stock', stockItem.qty_on_hand.toString(), stockItem.branch_id || undefined)}
                              className="h-5 w-5 p-0 dark:text-gray-400 dark:hover:text-white light:text-gray-600 light:hover:text-gray-900"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <span className="dark:text-gray-500 light:text-gray-400 text-sm italic">
                      No hay stock por sucursal
                    </span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
