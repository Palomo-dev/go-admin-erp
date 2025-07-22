<<<<<<< HEAD
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases CSS utilizando clsx y tailwind-merge
 * @param inputs - Clases CSS a combinar
 * @returns String con las clases combinadas
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
=======
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combina clases de CSS utilizando clsx y tailwind-merge
 * Esta función es útil para combinar clases de Tailwind de manera condicional
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
>>>>>>> master
}
