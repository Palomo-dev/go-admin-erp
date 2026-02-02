"use client"

import { Star } from 'lucide-react'
import { Label } from '@/components/ui/label'

interface RatingSelectorProps {
  value?: number
  onChange: (rating: number) => void
  label?: string
  maxRating?: number
  className?: string
  readonly?: boolean
  showValue?: boolean
}

export default function RatingSelector({
  value = 0,
  onChange,
  label = 'Calificación',
  maxRating = 5,
  className = '',
  readonly = false,
  showValue = true
}: RatingSelectorProps) {
  const handleClick = (rating: number) => {
    if (!readonly) {
      onChange(rating)
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <Label className="text-gray-700 dark:text-gray-300">
          {label}
        </Label>
      )}

      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {Array.from({ length: maxRating }, (_, i) => i + 1).map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => handleClick(rating)}
              disabled={readonly}
              className={`transition-all ${
                readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
              }`}
            >
              <Star
                className={`h-6 w-6 ${
                  rating <= value
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'fill-none text-gray-300 dark:text-gray-600'
                }`}
              />
            </button>
          ))}
        </div>

        {showValue && (
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {value > 0 ? `${value.toFixed(1)} / ${maxRating}` : 'Sin calificar'}
          </span>
        )}
      </div>

      {!readonly && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Haz clic en las estrellas para calificar
        </p>
      )}
    </div>
  )
}
