import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class names into a single string using clsx and tailwind-merge.
 * This utility helps with conditional class names and prevents duplicate tailwind classes.
 * 
 * @param inputs - Class name inputs that can be strings, objects, arrays, etc.
 * @returns A merged string of class names optimized for Tailwind CSS.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number as a currency string using the specified locale and currency
 * 
 * @param value - The number to format as currency
 * @param locale - The locale to use for formatting (defaults to "es-CO")
 * @param currency - The currency code to use (defaults to "COP")
 * @returns A formatted currency string
 */
export function formatCurrency(value: number, locale = "es-CO", currency = "COP"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}
