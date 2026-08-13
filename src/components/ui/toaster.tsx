"use client"

import * as React from "react"

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/components/ui/use-toast"
import { CheckCircle2, XCircle, AlertCircle, Info, Loader2 } from "lucide-react"

const iconMap: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />,
  destructive: <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />,
  warning: <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />,
  info: <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />,
  loading: <Loader2 className="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0 animate-spin" />,
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider swipeDirection="right" duration={5000}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const icon = variant ? iconMap[variant as string] : null
        return (
          <Toast key={id} variant={variant} duration={variant === 'loading' ? Infinity : 5000} {...props}>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {icon && <div className="flex-shrink-0 mt-0.5">{icon}</div>}
              <div className="grid gap-1 flex-1 min-w-0">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
