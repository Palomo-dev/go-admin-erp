"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/Utils";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

/**
 * Componente que permite alternar entre tema claro y oscuro con color azul como principal
 * Usa localStorage para persistir la preferencia del usuario
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Estado inicial basado en localStorage o preferencia del sistema
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  // Inicializar el tema cuando el componente se monta
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      // Detectar preferencia del sistema
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }
  }, []);

  // Aplicar el tema al HTML y guardar en localStorage
  useEffect(() => {
    const root = window.document.documentElement;

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      
      root.classList.toggle("dark", systemTheme === "dark");
      return;
    }

    // Aplicar tema y color azul principal
    root.classList.toggle("dark", theme === "dark");
    root.style.setProperty("--primary", theme === "dark" ? "210 100% 50%" : "210 100% 50%"); // Color azul en HSL
    localStorage.setItem("theme", theme);
    
    // Disparar evento para que otros componentes actualicen su tema
    window.dispatchEvent(new CustomEvent("theme-changed", { detail: { theme } }));
  }, [theme]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className={cn(
            "h-9 w-9 rounded-md border-blue-200 dark:border-blue-800 bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-blue-950 hover:bg-blue-50 hover:text-blue-600 dark:hover:text-blue-400", 
            className
          )}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all text-blue-600 dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all text-blue-400 dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Cambiar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 border-blue-200 dark:border-blue-800">
        <DropdownMenuLabel className="text-xs text-blue-500 dark:text-blue-400">Apariencia</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-blue-100 dark:bg-blue-800" />
        <DropdownMenuItem 
          onClick={() => setTheme("light")} 
          className="hover:bg-blue-50 dark:hover:bg-blue-900"
        >
          <Sun className="mr-2 h-4 w-4 text-blue-600" />
          <span>Claro</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme("dark")} 
          className="hover:bg-blue-50 dark:hover:bg-blue-900"
        >
          <Moon className="mr-2 h-4 w-4 text-blue-400" />
          <span>Oscuro</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
