import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/utils/Utils"
import type { AparienciaBadge, TonoBadge } from "@/components/kit/estadoTono"

/**
 * Badge. Dos formas de usarlo:
 *
 * - **Escala del manual v2.0** (Figma `02 Componentes` › `Badge` 7:70,
 *   docs/design/SISTEMA-BADGES.md): `tono` + `apariencia` + `tamano`. Es la que
 *   usa todo el código nuevo; para estados, mejor `StatusBadge` del kit, que
 *   resuelve el tono desde la tabla única.
 * - **Variantes shadcn heredadas** (`variant`): se conservan para las ~700
 *   pantallas que ya lo usan. No las uses en código nuevo.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80 dark:bg-red-600 dark:text-white dark:hover:bg-red-700",
        outline: "text-foreground dark:text-gray-200 dark:border-gray-600",
        warning: "border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-700/30 dark:text-yellow-100",
        info: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-700/30 dark:text-blue-100",
        success: "border-transparent bg-green-100 text-green-800 dark:bg-green-700/30 dark:text-green-100"
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/** Receta del manual: fondo tinte, texto profundo, borde 1 px, píldora, Inter 600. */
const COLORES: Record<TonoBadge, Record<AparienciaBadge, string>> = {
  marca: {
    suave: "bg-brand-tint text-brand-deep border-line-brand",
    solido: "bg-solid-brand text-on-solid border-brand-action",
    contorno: "bg-transparent text-brand-deep border-line-brand",
  },
  exito: {
    suave: "bg-success-subtle text-success-text border-line-success",
    solido: "bg-solid-success text-on-solid border-transparent",
    contorno: "bg-transparent text-success-text border-line-success",
  },
  advertencia: {
    suave: "bg-warning-subtle text-warning-text border-line-warning",
    // El ámbar sólido con texto blanco no pasa AA: tinta oscura (8,31:1).
    solido: "bg-solid-warning text-on-solid-warning border-transparent",
    contorno: "bg-transparent text-warning-text border-line-warning",
  },
  peligro: {
    suave: "bg-danger-subtle text-danger-text border-line-danger",
    solido: "bg-solid-danger text-on-solid border-transparent",
    contorno: "bg-transparent text-danger-text border-line-danger",
  },
  informacion: {
    suave: "bg-info-subtle text-info-text border-line-info",
    solido: "bg-solid-info text-on-solid border-transparent",
    contorno: "bg-transparent text-info-text border-line-info",
  },
  neutro: {
    suave: "bg-subtle text-fg-secondary border-line",
    solido: "bg-solid-neutral text-on-solid border-transparent",
    contorno: "bg-transparent text-fg-secondary border-line-strong",
  },
}

const PUNTO: Record<TonoBadge, string> = {
  marca: "bg-brand",
  exito: "bg-success",
  advertencia: "bg-warning",
  peligro: "bg-danger",
  informacion: "bg-info",
  neutro: "bg-fg-muted",
}

const TAMANOS = {
  /** 20 px: listas densas. */
  sm: "h-5 gap-1 px-1.5 text-[11px] leading-4",
  /** 24 px: cabeceras y tarjetas. */
  md: "h-6 gap-1 px-2 text-xs leading-4",
} as const

export type TamanoBadge = keyof typeof TAMANOS

/** Clases de la escala, para quien necesite pintar algo con la misma receta. */
export function clasesBadgeTono(tono: TonoBadge, apariencia: AparienciaBadge = "suave", tamano: TamanoBadge = "md"): string {
  return cn(
    "inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full border font-semibold",
    TAMANOS[tamano],
    COLORES[tono][apariencia],
  )
}

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Escala del manual. Si se indica, `variant` se ignora. */
  tono?: TonoBadge
  apariencia?: AparienciaBadge
  tamano?: TamanoBadge
  /** Punto de color de 6 px. */
  punto?: boolean
  /** Icono lucide de 11–12 px a la izquierda. Nunca un emoji. */
  icono?: LucideIcon
}

function Badge({ className, variant, tono, apariencia = "suave", tamano = "md", punto, icono: Icono, children, ...props }: BadgeProps) {
  if (!tono) {
    return (
      <div className={cn(badgeVariants({ variant }), className)} {...props}>
        {children}
      </div>
    )
  }
  const solido = apariencia === "solido"
  return (
    <div className={cn(clasesBadgeTono(tono, apariencia, tamano), className)} {...props}>
      {punto && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", solido ? "bg-current" : PUNTO[tono])}
        />
      )}
      {Icono && <Icono aria-hidden="true" strokeWidth={2} className={tamano === "sm" ? "size-[11px] shrink-0" : "size-3 shrink-0"} />}
      <span className="truncate">{children}</span>
    </div>
  )
}

export { Badge, badgeVariants }
