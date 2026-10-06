'use client';

/**
 * /app/sitio-web/analitica — «Analítica» del módulo Sitio web (Figma B/09-01…09-05,
 * E-analitica). Antes /app/inicio/analitica-web, que redirige aquí
 * (next.config.js). La pantalla de siempre (`components/analiticaWeb`) dentro
 * del marco del módulo, con «Píxeles y medición». El acceso lo decide el
 * servidor (`GET /api/analitica-web`, misma regla que el menú).
 */
import { AnaliticaSitioWeb } from '@/components/sitio-web/seoanalitica/AnaliticaSitioWeb';

export default function PaginaAnaliticaWeb() {
  return <AnaliticaSitioWeb />;
}
