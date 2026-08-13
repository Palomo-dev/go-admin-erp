import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X, CheckCircle2, XCircle, AlertCircle, Info, Loader2 } from "lucide-react"

import { cn } from "@/utils/Utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[200] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[440px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "data-[swipe=move]:transition-none group relative pointer-events-auto flex w-full items-center justify-between gap-3 overflow-hidden rounded-lg border p-4 pr-8 shadow-xl transition-all data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full data-[state=closed]:slide-out-to-right-full",
  {
    variants: {
      variant: {
        default: "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 border-l-4 border-l-gray-400 dark:border-l-gray-500",
        success:
          "group success border-green-500 border-l-4 border-l-green-500 bg-green-50 dark:border-green-700 dark:border-l-green-500 dark:bg-green-950 text-green-800 dark:text-green-200",
        destructive:
          "group destructive border-red-500 border-l-4 border-l-red-500 bg-red-50 dark:border-red-800 dark:border-l-red-500 dark:bg-red-950 text-red-800 dark:text-red-200",
        warning:
          "group warning border-amber-500 border-l-4 border-l-amber-500 bg-amber-50 dark:border-amber-700 dark:border-l-amber-500 dark:bg-amber-950 text-amber-800 dark:text-amber-200",
        info:
          "group info border-blue-500 border-l-4 border-l-blue-500 bg-blue-50 dark:border-blue-700 dark:border-l-blue-500 dark:bg-blue-950 text-blue-800 dark:text-blue-200",
        loading:
          "group loading border-gray-300 border-l-4 border-l-gray-400 bg-gray-50 dark:border-gray-600 dark:border-l-gray-500 dark:bg-gray-900 text-gray-700 dark:text-gray-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-white transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-red-300/30 group-[.destructive]:hover:border-red-400/30 group-[.destructive]:hover:bg-red-400/10 group-[.destructive]:hover:text-red-600 group-[.destructive]:focus:ring-red-500 dark:border-gray-700 dark:ring-offset-gray-950 dark:hover:bg-gray-800 dark:focus:ring-gray-800 dark:group-[.destructive]:border-red-800/40 dark:group-[.destructive]:hover:border-red-900/30 dark:group-[.destructive]:hover:bg-red-900/15 dark:group-[.destructive]:hover:text-red-400 dark:group-[.destructive]:focus:ring-red-900",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-gray-400 opacity-40 transition-opacity hover:text-gray-700 focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 dark:text-gray-500 dark:hover:text-gray-300 group-[.success]:text-green-500 group-[.destructive]:text-red-500 group-[.warning]:text-amber-500 group-[.info]:text-blue-500 group-[.loading]:text-gray-400",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
