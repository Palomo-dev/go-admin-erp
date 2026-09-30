'use client';

/**
 * /app/inicio/analitica-web — «Analítica web» (Figma 03 › 464:237482).
 * Página delgada: todo vive en `components/analiticaWeb` y el acceso lo decide
 * `GET /api/analitica-web` en el servidor.
 */
import { AnaliticaWeb } from '@/components/analiticaWeb/AnaliticaWeb';

export default function PaginaAnaliticaWeb() {
  return <AnaliticaWeb />;
}
