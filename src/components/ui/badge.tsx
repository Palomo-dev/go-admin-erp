import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/Utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-red-100 text-red-800 dark:bg-red-700/30 dark:text-red-100 hover:bg-red-200 dark:hover:bg-red-700/40",
        outline: "text-foreground",
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

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
