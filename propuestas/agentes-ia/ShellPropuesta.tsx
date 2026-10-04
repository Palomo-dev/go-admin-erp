import React, { useState, type ReactNode } from "react";
import { SidebarShell } from "@/components/shell/sidebar/SidebarShell";
import { AppHeader } from "@/components/shell/header/AppHeader";
import { filtrarNavegacion, rutaActiva } from "@/lib/navigation/filtrar";
import type { CapacidadNav } from "@/lib/navigation/catalog";

const ruta = "/app/crm/agentes-ia";
const secciones = filtrarNavegacion({
  modulosActivos: [
    "crm",
    "clientes",
    "pm",
    "inventory",
    "finance",
    "reports",
    "organizations",
    "configuracion",
  ],
  paginasOcultas: {},
  modulosCargo: null,
  paginasCargo: null,
  capacidades: new Set<CapacidadNav>(["gestionarNotificaciones"]),
});
const usuario = {
  name: "Persona de prueba",
  email: "persona@example.test",
  role: "Administración",
  avatar: undefined,
};

export function ShellPropuesta({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [tema, setTema] = useState<"light" | "dark">("light");
  const relacion = (destino: string) =>
    window.dispatchEvent(
      new CustomEvent("propuesta-relacion", { detail: { ruta: destino } }),
    );
  const alternarTema = () =>
    setTema((actual) => {
      const siguiente = actual === "light" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", siguiente === "dark");
      return siguiente;
    });

  return (
    <div className="propuesta-shell flex h-dynamic-screen min-w-0 overflow-hidden">
      <SidebarShell
        pathname={ruta}
        secciones={secciones}
        cargando={false}
        activa={rutaActiva(ruta)}
        drawerAbierto={drawer}
        onCerrarDrawer={() => setDrawer(false)}
        usuario={usuario}
        organizacion="Empresa de ejemplo"
        tema={tema}
        onAlternarTema={alternarTema}
        onCerrarSesion={() => relacion("/app/perfil")}
        cerrandoSesion={false}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader
          organizacionId="120"
          organizacionNombre="Empresa de ejemplo"
          correo={null}
          pathname={ruta}
          secciones={secciones}
          paginasBuscables={[]}
          asistenteAbierto={false}
          onAlternarAsistente={() => relacion("/app/go-asistente")}
          onAbrirMenu={() => setDrawer(true)}
        />
        <main
          id="contenido-propuesta"
          className="propuesta-main min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
