'use client';

/**
 * Editor visual del sitio (Figma A/05, D/05, «figma-estilo»). La URL pública es
 * /app/sitio-web/editor/[pageId]: next.config.js la reescribe hacia esta ruta física para
 * pintarlo a pantalla completa, fuera del AppLayout. Toda la pantalla vive en el módulo
 * (`@/components/sitio-web/editor/EditorSitio`); este archivo solo la monta hasta que el
 * integrador mueva la ruta física y retire el rewrite.
 */
import EditorSitio from '@/components/sitio-web/editor/EditorSitio';

export default function PageEditorPage() {
  return <EditorSitio />;
}
