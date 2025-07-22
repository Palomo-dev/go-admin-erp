"use client";

// En lugar de duplicar todo el código, importamos directamente el componente ClientesPage
import ClientesPage from "../../clientes/page";

// Reutilizamos el componente original sin duplicar código
export default function ClientesCRMPage() {
  return (
    // Renderizamos el componente original para reutilizar todo su código
    <ClientesPage />
  );
}