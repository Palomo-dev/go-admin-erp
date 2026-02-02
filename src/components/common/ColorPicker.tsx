"use client"

import { Label } from '@/components/ui/label'

interface ColorPickerProps {
  value?: string
  onChange: (color: string) => void
  label?: string
  className?: string
  predefinedColors?: string[]
}

const DEFAULT_COLORS = [
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
  '#a855f7', // Purple
  '#14b8a6', // Teal
  '#f43f5e', // Rose
  '#eab308', // Yellow
  '#22c55e', // Green
  '#64748b', // Slate
]

export default function ColorPicker({
  value = '#6366f1',
  onChange,
  label = 'Color',
  className = '',
  predefinedColors = DEFAULT_COLORS
}: ColorPickerProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="text-gray-700 dark:text-gray-300">
        {label}
      </Label>

      <div className="space-y-3">
        {/* Colores predefinidos */}
        <div className="flex flex-wrap gap-2">
          {predefinedColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={`w-10 h-10 rounded-full border-2 transition-all hover:scale-110 ${
                value === color
                  ? 'border-gray-900 dark:border-white scale-110 ring-2 ring-offset-2 ring-gray-400'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>

        {/* Color personalizado */}
        <div className="flex items-center gap-3">
          <Label htmlFor="customColor" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
            Color personalizado:
          </Label>
          <div className="flex items-center gap-2 flex-1">
            <input
              id="customColor"
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-16 h-10 rounded border border-gray-300 dark:border-gray-700 cursor-pointer"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="#000000"
              className="flex-1 h-10 px-3 rounded-md border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm"
            />
          </div>
        </div>

        {/* Vista previa */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div
            className="w-12 h-12 rounded-lg border-2 border-gray-300 dark:border-gray-600"
            style={{ backgroundColor: value }}
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Vista Previa
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {value}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
