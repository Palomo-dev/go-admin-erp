"use client"

import * as React from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/utils/Utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  date: Date | undefined
  onSelect: (date: Date | undefined) => void
  className?: string
}

export function DatePicker({ date, onSelect, className }: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full sm:w-auto justify-start text-left font-normal text-xs sm:text-sm",
            "bg-white dark:bg-gray-900",
            "border-gray-300 dark:border-gray-600",
            "text-gray-900 dark:text-gray-100",
            "hover:bg-gray-50 dark:hover:bg-gray-800",
            "h-9 sm:h-10",
            !date && "text-gray-500 dark:text-gray-400",
            className
          )}
        >
          <CalendarIcon className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0 text-gray-600 dark:text-gray-400" />
          <span className="truncate">
            {date ? (
              <>
                <span className="hidden sm:inline">{format(date, "PPP", { locale: es })}</span>
                <span className="sm:hidden">{format(date, "dd/MM/yyyy", { locale: es })}</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Seleccionar fecha</span>
                <span className="sm:hidden">Fecha</span>
              </>
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          locale={es}
          initialFocus
          className="bg-white dark:bg-gray-800"
        />
      </PopoverContent>
    </Popover>
  )
}
