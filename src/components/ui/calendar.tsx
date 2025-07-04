"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns"
import { es } from "date-fns/locale"

import { cn } from "@/utils/Utils"
import { Button } from "@/components/ui/button"

export interface CalendarProps {
  className?: string
  date?: Date
  onSelect?: (date: Date) => void
  disabled?: (date: Date) => boolean
  locale?: typeof es
  mode?: "single" | "multiple" | "range"
  selected?: Date | Date[] | { from: Date; to: Date }
  initialFocus?: boolean
}

function Calendar({
  className,
  date = new Date(),
  onSelect,
  disabled,
  locale = es,
  mode = "single",
  selected,
  initialFocus = false,
  ...props
}: CalendarProps) {
  // Usar selected si está disponible, sino usar date
  const initialDate = selected instanceof Date ? selected : date
  const [currentMonth, setCurrentMonth] = React.useState(new Date(initialDate))
  const [selectedDate, setSelectedDate] = React.useState(initialDate)

  const handleDateClick = (day: Date) => {
    if (disabled?.(day)) return
    setSelectedDate(day)
    onSelect?.(day)
  }

  const renderDays = () => {
    const days = []
    let startDate = startOfWeek(startOfMonth(currentMonth), { locale })
    
    for (let i = 0; i < 42; i++) {
      const day = addDays(startDate, i)
      const isCurrentMonth = isSameMonth(day, currentMonth)
      const isSelected = isSameDay(day, selectedDate)
      const isDisabled = disabled?.(day) || false
      
      days.push(
        <div 
          key={i} 
          className="h-9 w-9 text-center text-sm p-0 relative"
        >
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 w-9 p-0 font-normal",
              !isCurrentMonth && "text-muted-foreground opacity-50",
              isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              isSameDay(day, new Date()) && !isSelected && "bg-accent text-accent-foreground",
              isDisabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !isDisabled && handleDateClick(day)}
            disabled={isDisabled}
          >
            {format(day, "d")}
          </Button>
        </div>
      )
    }
    
    return days
  }

  return (
    <div className={cn("p-3 w-64", className)} {...props}>
      <div className="flex justify-center pt-1 relative items-center mb-4">
        <Button
          variant="outline"
          className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium">
          {format(currentMonth, "MMMM yyyy", { locale })}
        </div>
        <Button
          variant="outline"
          className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day, i) => (
          <div key={i} className="text-center text-xs text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {renderDays()}
      </div>
    </div>
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
