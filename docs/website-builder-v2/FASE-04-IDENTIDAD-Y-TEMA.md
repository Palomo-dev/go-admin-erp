# Fase 04 — Identidad propia, fondos y sistema de tema

Estado: pendiente; **etapa 2**. Depende de F03. Herencia confirmada en [ADR-002 D6](ADR-002-DECISIONES-Y-SECUENCIA.md); identidad del outlet reutiliza `BranchForm`/`webIdentityValidation.ts` (D7). Resultado: organización y outlets pueden verse completamente distintos sin cambiar su pertenencia administrativa.

## UX y componentes

Evolucionar `GlobalSettingsPanel.tsx`, `BrandingThemeTab.tsx`, paneles de identidad y campos `ColorField`, `SpacingField`, `ResponsiveField`, `RichTextField`. Mostrar cuatro ámbitos: sitio, página, sección y bloque, junto al origen del valor efectivo.

Controles de sitio: nombre público, logo claro/oscuro, favicon, portada, contacto, horarios y redes. La razón social fiscal no se cambia desde el tema. Acciones «Usar del sitio principal», «Personalizar aquí» y «Restablecer» explican el alcance sin clonar todos los valores silenciosamente.

## Modelo visual

| Grupo | Controles |
|---|---|
| Superficies | Fondo general, superficies alternas, header, footer, tarjetas; color, imagen o video donde esté soportado |
| Texto | Título/cuerpo/acento, pesos disponibles, tamaño fluido, interlineado, ancho de lectura y énfasis |
| Espacio | Ancho de contenido, margen lateral, separación de secciones, padding y gaps |
| Forma | Radio, borde, sombra, estilo de separador y máscaras permitidas |
| Acciones | Botón primario/secundario/textual, tamaño, contraste, estados hover/foco/deshabilitado |
| Movimiento | Ninguno, discreto o expresivo; duración acotada y alternativa con movimiento reducido |

Los valores por dispositivo admiten herencia desktop → tablet → móvil y un restablecimiento claro. No multiplicar campos por cada ancho; escalas fluidas y presets cubren el caso común. Un fondo de video requiere poster, contraste y alternativa estática.

## Backend y websites

- F04-01. Resolver `effectivePublicIdentity` y `effectiveTheme` en funciones comunes; extender `lib/outlet/resolver.ts`, `lib/get-org-context.ts`, `lib/outlet/theme-merge.ts` y `OrganizationLayout.tsx` para recibir DTO de presentación.
- F04-02. Convertir colores/tipografía/espacios a variables semánticas consumidas por componentes. Corregir clases fijas que impiden aplicar fondo/texto; no reemplazar estilos de sitios legacy antes de adoptar V2.
- F04-03. Cargar realmente las familias y pesos elegidos. Mantener catálogo de fuentes soportadas y fallbacks; fuentes subidas se añaden cuando exista validación y registro de licencia en F06.
- F04-04. Separar tema de operaciones: copiar la paleta no copia pagos, inventario, impuestos ni credenciales. En vista pública usar la identidad comercial; facturación continúa con datos legales existentes.
- F04-05. Eliminar el clonado total de settings al crear un override V2. Guardar solo cambios explícitos en borrador y materializar valores efectivos al publicar. Un cambio en el hotel puede marcar borradores hijos como desactualizados, sin publicar restaurantes automáticamente.
- F04-06. Versionar presets de tema. Aplicar uno sobre contenido existente permite elegir solo apariencia; no reemplaza páginas/fotos/textos sin una operación de importación revisable.

## Base de datos

Reutilizar campos de identidad de `branches` que confirme MCP. Guardar diseño V2 dentro del documento/revisión, con esquema validado. Si falta metadata de fuentes/recursos, se incorpora en F06. Evitar una columna nueva por cada variante de color o espaciado.

No migrar todos los settings a diferencias relativas mediante una comparación superficial: un valor igual al del padre puede haber sido elegido intencionalmente. Mantener la apariencia existente como valores explícitos en la revisión inicial y ofrecer herencia como decisión posterior.

## Aceptación y reversión

- [ ] Hotel crema/serif, restaurante negro/serif y cafetería verde/sans conviven en una organización.
- [ ] Cambiar fondo/header/footer de uno no modifica otro; logo y contacto son propios en todas las rutas.
- [ ] La fuente seleccionada se descarga y aplica; todos los controles declarados cambian el renderer.
- [ ] «Vaciar» una red/logo opcional no vuelve a mostrar el valor heredado; «heredar» sí lo recupera en borrador.
- [ ] Móvil admite diferencias de espaciado/recorte manteniendo accesibilidad y lectura.

Recuperación: restaurar la revisión de tema completa del sitio. No revertir información legal ni datos operativos porque no pertenecen a este snapshot.
