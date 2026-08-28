# FASE 12 — Editor profesional

> Vuelve al [PLAN.md](./PLAN.md) · Depende de [FASE 0](./FASE-0-FUNDACIONES.md)

Esta fase no agrega opciones de personalización: hace que usar el editor sea seguro y agradable. Puede ejecutarse por partes, en paralelo a las fases de secciones.

---

## 12.1 Preview vivo por `postMessage` (P11)

**Hoy:** `EditorPreview.tsx:103-117` monta un `<iframe src={previewUrl}>` con `key={refreshKey}`. Cambiar un campo no hace nada hasta guardar, y al guardar se recarga el sitio entero (pierdes scroll, estado y unos segundos).

**Propuesta:**

1. El sitio acepta `?preview=1` y monta un `PreviewBridge` (cliente) que escucha:
```ts
window.addEventListener('message', (e) => {
  if (e.origin !== ALLOWED_EDITOR_ORIGIN) return;           // seguridad
  if (e.data?.type === 'goadmin:preview') setSections(e.data.sections);
});
```
2. El editor emite en cada cambio con debounce 150 ms, enviando solo las secciones (no recarga).
3. **Sentido inverso:** cada sección renderizada en modo preview lleva `data-section-id`; al hacer clic, el sitio emite `{ type:'goadmin:select', sectionId }` y el sidebar abre esa sección. Esto es lo que hace que se sienta sincronizado.
4. Overlay de selección en el iframe (borde + etiqueta con el nombre de la sección) y botones flotantes de subir/bajar/ocultar/duplicar.
5. Scroll automático: al seleccionar una sección en el sidebar, el iframe hace scroll hasta ella.

**Seguridad:** validar `origin` en ambos lados; el modo preview solo se activa con `?preview=1` y, para páginas no publicadas, con un token firmado de corta duración.

**Fallback:** si el `postMessage` no responde (versión vieja del sitio desplegada), conservar la recarga por `refreshKey`.

## 12.2 Borrador, publicación y versionado (P12)

**Hoy:** cada guardado impacta al sitio en producción. No hay marcha atrás.

**Cambios en BD:**
- `website_pages`: `draft_content jsonb`, `has_unpublished_changes boolean`, `published_at timestamptz`.
- Tabla nueva `website_page_versions (id, page_id, organization_id, snapshot jsonb, created_by, created_at, label)`.

**Flujo:** el editor guarda siempre en borrador → botón **Publicar** copia el borrador a las secciones vivas y crea una versión → historial con "Restaurar esta versión" y comparación simple (qué secciones se agregaron, quitaron o cambiaron).

**Indicador** en el `EditorHeader`: "Borrador con cambios sin publicar" / "Publicado hace 3 min".

Retención: últimas 20 versiones por página, o 90 días.

## 12.3 Productividad

| Función | Implementación |
|---|---|
| **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z) | Pila de estados sobre el `pendingSectionUpdates` que ya existe en `editor/[pageId]/page.tsx:65`. Límite 50 pasos. |
| **Duplicar sección** | Copia con `sort_order + 1` y nuevo `id`. |
| **Copiar / pegar estilo** | Copia solo las claves de `STYLE_FIELDS` y `CARD_FIELDS` al portapapeles interno; "Pegar estilo" en cualquier otra sección. Resuelve el "quiero que todas mis cards se vean igual". |
| **Guardar sección como plantilla** | Tabla `website_section_presets (organization_id, name, section_type, section_variant, content)`. Aparecen en "Agregar sección" bajo *Mis plantillas*. |
| **Aplicar estilo a todas las secciones** | Acción masiva desde la configuración global. |
| **Buscar sección** | Filtro en la lista del sidebar (páginas con 15 secciones son incómodas). |
| **Atajos** | `Ctrl+S` guardar, `Ctrl+D` duplicar, `Del` eliminar, `Esc` deseleccionar. |

## 12.4 Autosave y concurrencia

- Autosave del borrador cada 20 s si hay cambios, más `beforeunload` de aviso.
- **Bloqueo optimista:** enviar el `updated_at` conocido; si el servidor tiene uno más nuevo, avisar "otra persona modificó esta página" y ofrecer recargar o forzar. Hoy dos usuarios se pisan sin enterarse.

## 12.5 Accesibilidad y contraste

- Al elegir un color de fondo, calcular el ratio WCAG contra el color de texto y mostrar el resultado (AA / AAA / insuficiente) con sugerencia automática del texto adecuado (blanco o negro).
- Utilidad `getReadableTextColor(bg)` compartida, y usarla en el sitio donde hoy `primaryColor` se aplica indistintamente como fondo y como texto (causa del header amarillo ilegible de la captura 1).
- Validar tamaños mínimos de fuente y áreas táctiles de 44px en móvil.

## 12.6 Presets y plantillas por industria

`lib/templates/presets.ts` está **espejado a mano** en los dos repos (`websiteSettingsService.ts:177-241` en el ERP tiene el comentario "mirror de goadmin-websites/lib/templates/presets.ts"). Incluirlo en el manifiesto de contrato de la F0.6 para que una divergencia se detecte en CI.

Añadir: aplicar un preset a **una sección** (no solo al sitio entero), y previsualizar el preset antes de aplicarlo.

## 12.7 Panel de contrato

Aviso visible en el editor cuando:
- Una sección de la página tiene un `type:variant` sin componente en el sitio (se renderizaría vacío en producción).
- Existen tipos disponibles en el sitio que el catálogo no declara (los huérfanos de P2, mientras se completan).
- Una clave guardada no la lee ningún componente (el caso `items` vs `images` de la galería).

## 12.8 SEO y rendimiento del sitio

- `next/image` en todas las secciones con imagen; `priority` **solo** en el hero.
- JSON-LD por tipo de página (ver [FASE 9](./FASE-9-10-PAGINAS-Y-REVIEWS.md)).
- `sitemap.xml` y `robots.txt` por organización, con productos y categorías publicados.
- Presupuesto de rendimiento en CI (Lighthouse sobre 3 sitios de muestra): LCP < 2.5 s, CLS < 0.1.
- `loading="lazy"` y `decoding="async"` por defecto fuera del hero.

### Criterios de aceptación F12
- [ ] Cambiar un campo actualiza el preview en menos de 300 ms sin recargar.
- [ ] Hacer clic en una sección del preview la selecciona en el sidebar.
- [ ] Publicar es un acto explícito; se puede restaurar una versión anterior.
- [ ] Undo/redo, duplicar y copiar estilo funcionando.
- [ ] Dos usuarios editando la misma página reciben aviso en vez de pisarse.
- [ ] El editor advierte de secciones desincronizadas.
