"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { format, addDays, startOfWeek, startOfMonth, isSameMonth, isSameDay, addMonths, subMonths, isAfter, isBefore, isWithinInterval } from "date-fns"
import { es } from "date-fns/locale"

import { cn } from "@/utils/Utils"
import { Button } from "@/components/ui/button"

export type DateRange = { from?: Date; to?: Date }

export interface CalendarProps {
  className?: string
  date?: Date
  onSelect?: ((date: Date) => void) | ((range: DateRange | undefined) => void)
  disabled?: (date: Date) => boolean
  locale?: typeof es
  mode?: "single" | "range"
  selected?: Date | DateRange
  initialFocus?: boolean
  numberOfMonths?: number
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
  numberOfMonths = 1,
  ...props
}: CalendarProps) {
  const getInitialDate = () => {
    if (selected instanceof Date) return selected
    if (selected && 'from' in selected && selected.from) return selected.from
    return date
  }

  const [currentMonth, setCurrentMonth] = React.useState(new Date(getInitialDate()))
  const [rangeStart, setRangeStart] = React.useState<Date | undefined>(
    mode === 'range' && selected && 'from' in selected ? selected.from : undefined
  )
  const [rangeEnd, setRangeEnd] = React.useState<Date | undefined>(
    mode === 'range' && selected && 'to' in selected ? selected.to : undefined
  )
  const [hoverDate, setHoverDate] = React.useState<Date | undefined>()

  React.useEffect(() => {
    if (mode === 'range' && selected && 'from' in selected) {
      setRangeStart(selected.from)
      setRangeEnd(selected.to)
    }
  }, [selected, mode])

  const handleDateClick = (day: Date) => {
    if (disabled?.(day)) return

    if (mode === 'single') {
      (onSelect as (date: Date) => void)?.(day)
    } else if (mode === 'range') {
      if (!rangeStart || (rangeStart && rangeEnd)) {
        setRangeStart(day)
        setRangeEnd(undefined)
        ;(onSelect as (range: DateRange | undefined) => void)?.({ from: day, to: undefined })
      } else {
        const newEnd = isAfter(day, rangeStart) ? day : rangeStart
        const newStart = isBefore(day, rangeStart) ? day : rangeStart
        setRangeStart(newStart)
        setRangeEnd(newEnd)
        ;(onSelect as (range: DateRange | undefined) => void)?.({ from: newStart, to: newEnd })
      }
    }
  }

  const isInRange = (day: Date) => {
    if (mode !== 'range') return false
    const start = rangeStart
    const end = rangeEnd || hoverDate
    if (!start || !end) return false
    
    try {
      const intervalStart = isBefore(start, end) ? start : end
      const intervalEnd = isAfter(end, start) ? end : start
      return isWithinInterval(day, { start: intervalStart, end: intervalEnd })
    } catch {
      return false
    }
  }

  const isRangeStart = (day: Date) => rangeStart && isSameDay(day, rangeStart)
  const isRangeEnd = (day: Date) => rangeEnd && isSameDay(day, rangeEnd)

  const renderMonth = (monthOffset: number) => {
    const month = addMonths(currentMonth, monthOffset)
    const days = []
    const startDate = startOfWeek(startOfMonth(month), { locale })
    
    for (let i = 0; i < 42; i++) {
      const day = addDays(startDate, i)
      const isCurrentMonth = isSameMonth(day, month)
      const isDisabled = disabled?.(day) || false
      const inRange = isInRange(day)
      const isStart = isRangeStart(day)
      const isEnd = isRangeEnd(day)
      const isSelected = mode === 'single' && selected instanceof Date && isSameDay(day, selected)
      
      days.push(
        <div 
          key={i} 
          className={cn(
            "h-9 w-9 text-center text-sm p-0 relative",
            inRange && !isStart && !isEnd && "bg-blue-100 dark:bg-blue-900/30"
          )}
          onMouseEnter={() => mode === 'range' && rangeStart && !rangeEnd && setHoverDate(day)}
        >
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 w-9 p-0 font-normal rounded-md",
              !isCurrentMonth && "text-muted-foreground opacity-50",
              (isSelected || isStart || isEnd) && "bg-blue-600 text-white hover:bg-blue-700 hover:text-white",
              inRange && !isStart && !isEnd && "bg-blue-100 dark:bg-blue-900/30 rounded-none",
              isStart && "rounded-l-md rounded-r-none",
              isEnd && "rounded-r-md rounded-l-none",
              isStart && isEnd && "rounded-md",
              isSameDay(day, new Date()) && !isSelected && !isStart && !isEnd && "bg-accent text-accent-foreground",
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
    
    return (
      <div key={monthOffset} className="p-3">
        <div className="flex justify-center pt-1 relative items-center mb-4">
          {monthOffset === 0 && (
            <Button
              variant="outline"
              className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="text-sm font-medium">
            {format(month, "MMMM yyyy", { locale })}
          </div>
          {monthOffset === numberOfMonths - 1 && (
            <Button
              variant="outline"
              className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-0 mb-2">
          {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"].map((day, i) => (
            <div key={i} className="h-9 w-9 text-center text-xs text-muted-foreground flex items-center justify-center">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0">
          {days}
        </div>
      </div>
    )
  }

  return (
    <div 
      className={cn("flex", className)} 
      onMouseLeave={() => setHoverDate(undefined)}
      {...props}
    >
      {Array.from({ length: numberOfMonths }, (_, i) => renderMonth(i))}
    </div>
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
