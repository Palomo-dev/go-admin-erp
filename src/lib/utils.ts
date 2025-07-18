import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combina clases de CSS utilizando clsx y tailwind-merge
 * Esta función es útil para combinar clases de Tailwind de manera condicional
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
