"use client"

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search } from 'lucide-react'
import * as LucideIcons from 'lucide-react'

interface IconSelectorProps {
  value?: string
  onChange: (iconName: string) => void
  label?: string
  className?: string
}

const COMMON_ICONS = [
  'Package', 'ShoppingCart', 'Laptop', 'Shirt', 'Utensils', 'Home', 'Wrench', 'Book',
  'Heart', 'Car', 'Smartphone', 'Watch', 'Headphones', 'Camera', 'Gamepad', 'Music',
  'Truck', 'Factory', 'Store', 'Building', 'Globe', 'Boxes', 'Warehouse', 'Layers',
  'Tag', 'Tags', 'Barcode', 'QrCode', 'Percent', 'DollarSign', 'CreditCard', 'Wallet',
  'Users', 'User', 'UserPlus', 'UserCheck', 'Shield', 'Lock', 'Key', 'Settings',
  'Star', 'Award', 'Trophy', 'Target', 'TrendingUp', 'Activity', 'BarChart', 'PieChart',
  'Calendar', 'Clock', 'Bell', 'Mail', 'Phone', 'MapPin', 'Navigation', 'Compass',
  'File', 'Folder', 'FileText', 'Image', 'Video', 'Download', 'Upload', 'Share'
]

export default function IconSelector({ value, onChange, label = 'Icono', className = '' }: IconSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredIcons = COMMON_ICONS.filter(icon =>
    icon.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelectIcon = (iconName: string) => {
    onChange(iconName)
    setIsOpen(false)
  }

  const renderIcon = (iconName: string, size: number = 20) => {
    const IconComponent = (LucideIcons as any)[iconName]
    if (!IconComponent) return null
    return <IconComponent size={size} />
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="text-gray-700 dark:text-gray-300">
        {label}
      </Label>
      
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="w-full justify-start border-gray-300 dark:border-gray-700 dark:bg-gray-800"
      >
        {value ? (
          <div className="flex items-center gap-2">
            {renderIcon(value)}
            <span>{value}</span>
          </div>
        ) : (
          <span className="text-gray-500">Seleccionar icono</span>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Seleccionar Icono</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar icono..."
                className="pl-10"
              />
            </div>

            {/* Grid de iconos */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-6 gap-2">
                {filteredIcons.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => handleSelectIcon(iconName)}
                    className={`
                      flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all
                      hover:bg-gray-100 dark:hover:bg-gray-800
                      ${value === iconName
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                      }
                    `}
                  >
                    {renderIcon(iconName, 24)}
                    <span className="text-xs mt-1 text-center truncate w-full">
                      {iconName}
                    </span>
                  </button>
                ))}
              </div>

              {filteredIcons.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No se encontraron iconos
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
