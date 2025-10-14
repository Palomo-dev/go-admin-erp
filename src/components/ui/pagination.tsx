import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/utils/Utils";
import { ButtonProps, buttonVariants } from "@/components/ui/button";

const Pagination = ({
  className,
  ...props
}: React.ComponentProps<"nav"> & {
  className?: string;
}) => (
  <nav
    role="navigation"
    aria-label="Navegación de paginación"
    className={cn("mx-auto flex w-full justify-center", className)}
    {...props}
  />
);

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul"> & {
    className?: string;
  }
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li"> & {
    className?: string;
  }
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = {
  isActive?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
} & Pick<ButtonProps, "size"> &
  React.ComponentProps<"button">;

const PaginationLink = ({
  className,
  isActive,
  size = "icon",
  disabled = false,
  children,
  onClick,
  ...props
}: PaginationLinkProps) => (
  <button
    onClick={onClick}
    aria-current={isActive ? "page" : undefined}
    disabled={disabled}
    className={cn(
      buttonVariants({
        variant: isActive ? "outline" : "ghost",
        size,
      }),
      "dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white",
      isActive && "dark:border-gray-600 dark:bg-gray-700 dark:text-white",
      className,
      disabled && "pointer-events-none opacity-50 dark:opacity-40"
    )}
    {...props}
  >
    {children}
  </button>
);
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = ({
  className,
  disabled,
  onClick,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { onClick?: () => void }) => (
  <PaginationLink
    aria-label="Ir a la página anterior"
    size="default"
    className={cn("gap-1 pl-2 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3", className)}
    disabled={disabled}
    onClick={onClick}
    {...props}
  >
    <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
    <span className="hidden sm:inline">Anterior</span>
  </PaginationLink>
);
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({
  className,
  disabled,
  onClick,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { onClick?: () => void }) => (
  <PaginationLink
    aria-label="Ir a la página siguiente"
    size="default"
    className={cn("gap-1 pr-2 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3", className)}
    disabled={disabled}
    onClick={onClick}
    {...props}
  >
    <span className="hidden sm:inline">Siguiente</span>
    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
  </PaginationLink>
);
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span"> & {
  className?: string;
}) => (
  <span
    aria-hidden
    className={cn("flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center dark:text-gray-400", className)}
    {...props}
  >
    <MoreHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
    <span className="sr-only">Más páginas</span>
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
