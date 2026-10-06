'use client';

/**
 * /app/sitio-web/analitica — «Analítica» del módulo Sitio web (Figma 01b; diseño
 * de la pantalla: Figma 03 › 464:237482). Antes /app/inicio/analitica-web, que
 * redirige aquí (next.config.js).
 * Página delgada: todo vive en `components/analiticaWeb` y el acceso lo decide
 * `GET /api/analitica-web` en el servidor.
 */
import { AnaliticaWeb } from '@/components/analiticaWeb/AnaliticaWeb';

export default function PaginaAnaliticaWeb() {
  return <AnaliticaWeb />;
}
