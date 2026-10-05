"use client";

import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonProps } from "@/components/ui/button";
import { clasesBoton, type VarianteBoton } from "@/components/kit/botonClases";

/** Adaptador de los formularios de Red a la escala Button del kit. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function RedButton(
    {
      variant = "default",
      size = "default",
      asChild = false,
      className,
      ...props
    },
    ref,
  ) {
    const variantes: Record<
      NonNullable<ButtonProps["variant"]>,
      VarianteBoton
    > = {
      default: "primario",
      outline: "secundario",
      secondary: "tinte",
      ghost: "fantasma",
      destructive: "destructivo",
      link: "fantasma",
    };
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        className={clasesBoton({
          patron: "button",
          variante: variantes[variant ?? "default"],
          tamano: size === "sm" ? "sm" : size === "lg" ? "lg" : "md",
          className: `${size === "icon" ? "size-10 p-0" : ""} ${variant === "link" ? "text-brand-deep hover:underline" : ""} ${className ?? ""}`,
        })}
        {...props}
      />
    );
  },
);
