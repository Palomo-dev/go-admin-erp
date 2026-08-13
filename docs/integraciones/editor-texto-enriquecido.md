# Editor de Texto Enriquecido y Renderer de HTML - Implementación Global

## Fecha: 2026-08-13

## Resumen

Se implementó un editor de texto enriquecido (negrilla, cursiva, subrayado, listas, alineación) reutilizable en todos los formularios del ERP que tienen campos descriptivos (descripción, notas, observaciones, instrucciones, términos y condiciones, contenido). Adicionalmente, se creó un renderer para visualizar correctamente el formato en las páginas de detalle.

## Componentes creados

### 1. Editor: `src/components/shared/RichTextEditor.tsx`

Editor ligero basado en `contentEditable` + `document.execCommand`. **Sin dependencias externas** (no usa TipTap, Quill, ni librerías de editor). Genera HTML como salida.

**Importación:**
```tsx
import { RichTextEditor } from '@/components/shared/RichTextEditor';
```

**Props:**
| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `value` | `string` | - | Contenido HTML actual |
| `onChange` | `(html: string) => void` | - | Callback cuando cambia el contenido |
| `placeholder` | `string?` | - | Texto placeholder |
| `className` | `string?` | - | Clases adicionales |
| `minHeight` | `number?` | `80` | Altura mínima del área editable (px) |

**Formatos soportados:**
- Negrita (`Ctrl+B`)
- Cursiva (`Ctrl+I`)
- Subrayado (`Ctrl+U`)
- Listas con viñetas
- Listas numeradas
- Alineación izquierda/centro/derecha

**Uso típico:**
```tsx
<RichTextEditor
  value={form.description}
  onChange={(html) => setForm(f => ({ ...f, description: html }))}
  placeholder="Descripción detallada..."
/>
```

### 2. Renderer: `src/components/shared/HtmlContentRenderer.tsx`

Renderiza HTML generado por `RichTextEditor` respetando el formato. Tolerante con texto plano (lo escapa y preserva saltos de línea). Incluye sanitización básica anti-XSS (filtra `<script>`, `<iframe>`, handlers `on*`, URLs `javascript:`).

**Importación:**
```tsx
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
```

**Props:**
| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `html` | `string \| null \| undefined` | - | Contenido HTML o texto plano |
| `className` | `string?` | - | Clases adicionales |
| `singleLine` | `boolean?` | `false` | Si true, muestra texto plano recortado (para vistas de lista) |

**Uso en página de detalle:**
```tsx
<HtmlContentRenderer html={producto.description} />
```

**Uso en vista de lista (texto compacto):**
```tsx
<HtmlContentRenderer html={task.description} singleLine className="text-xs text-gray-500" />
```

### 3. Compatibilidad: `src/components/pm/RichTextEditor.tsx`

Re-exporta el editor desde `shared/` para mantener compatibilidad con los drawers de PM existentes (`ProjectCreationPanel`, `GoalCreationPanel`, `TaskCreationPanel`). No requiere cambios en esos archivos.

## Criterios de aplicación

### SÍ se aplica el editor (campos descriptivos largos):
- `description` / `descripcion`
- `notes` / `notas` / `observaciones`
- `content` / `contenido`
- `termsConditions` / términos y condiciones
- `delivery_instructions` / instrucciones de entrega
- `maintenance_notes` / notas de mantenimiento
- `welcomeMessage`, `expiredMessage`, etc. (mensajes descriptivos)
- `reason` cuando es descriptivo largo (ej: motivo de préstamo, motivo de devolución)
- `materials` / lista de materiales
- `customer_feedback` / comentarios de cliente

### NO se aplica el editor (campos cortos operativos):
- `rejectReason` / `cancelReason` / `freezeReason` / `auditReason` (motivos cortos de 1-2 líneas)
- `motivo` de anulación/nota crédito (corto)
- `address` / direcciones
- `custom_config` / configuración JSON
- `holdReason` / `holdWithDebtReason` (motivos cortos del carrito)
- Campos `description` que son inputs de una línea (ej: descripción de movimiento bancario, descripción de ítem de envío)

## Módulos afectados

| Módulo | Formularios | Páginas detalle |
|--------|-------------|-----------------|
| Inventario | 11 | 3 |
| PMS | 12 | 3 |
| CRM | 13 | 4 |
| HRM | 10 | - |
| Finanzas | 8 | 2 |
| Transporte | 12 | - |
| POS | 9 | 1 |
| Calendario | 2 | - |
| Gym | 5 | - |
| Parking | 4 | - |
| Chat | 1 | - |
| Integraciones | 1 | - |
| PM (vistas) | - | 3 |

## Seguridad

El `HtmlContentRenderer` sanitiza el HTML antes de inyectarlo:
- Elimina etiquetas peligrosas: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<style>`, `<meta>`, `<base>`, `<form>`, `<input>`, `<button>`, `<textarea>`, `<select>`, `<option>`
- Elimina atributos `on*` (event handlers)
- Reemplaza URLs `javascript:` en `href`/`src`

El contenido es producido por usuarios autenticados a través del `RichTextEditor` (que solo genera etiquetas de formato benignas via `execCommand`), por lo que el riesgo es mínimo.

## Notas de implementación

- Los botones "Mejorar con IA" / "Generar con IA" existentes en algunos formularios siguen funcionando porque el `RichTextEditor` se sincroniza via la prop `value` (setear el estado React actualiza el editor).
- En vistas de lista se usa `singleLine={true}` para mantener texto compacto sin formato.
- En vistas de detalle se usa sin `singleLine` para mostrar todo el formato (negrillas, listas, etc.).
- El texto plano existente (datos previos a la implementación) se renderiza correctamente: el renderer detecta si no hay etiquetas HTML y lo muestra como texto con saltos de línea.
