# Brief de UX — páginas del CRM (Agentes IA, Automatizaciones, Secuencias)

> Encargo del dueño (2026-09-14): «las páginas nuevas tienen demasiada mala UX,
> demasiada. No son bonitas ni amigables, son complejas. Me gustan muy muy
> funcionales pero bonitas.» Referencia explícita: la biblioteca de voces de
> ElevenLabs. Este brief es la única fuente de verdad de diseño para las tres
> páginas; lo siguen constructores y testers.

## 1. Principio rector

**Funcional primero, bonito siempre, complejo nunca.** Cada pantalla tiene UNA
acción principal evidente en menos de un segundo. Lo secundario se pliega, no se
apila. Si un formulario necesita más de cinco campos visibles a la vez, está mal
diseñado: se divide en pasos o se agrupa en secciones plegables con resumen.

## 2. Sistema: lo que YA existe, se reutiliza

- **Componentes**: shadcn/ui en `src/components/ui/` (card, dialog, sheet, tabs,
  badge, avatar, skeleton, tooltip, command, select…). No se crea un sistema
  paralelo ni se instalan librerías de componentes nuevas.
- **Color de marca**: `blue-600` (`bg-blue-600 text-white`) para la acción
  principal. Un solo acento por pantalla. Estados: verde/ámbar/rojo **siempre
  con icono o texto**, nunca solo color (daltonismo).
- **Tema**: todo funciona en claro y oscuro (`dark:`), se verifica en ambos.
- **Animación**: `motion` v13 (`motion/react`), ya instalado. Primitivas
  existentes en `src/components/shared/motion/primitives.tsx` (`FadeIn`,
  `SlideIn`, `ScaleIn`, `AnimatePresence`): úsalas antes de escribir variantes
  nuevas. Regla: la animación **explica** (aparece, se reordena, se expande),
  nunca decora. Duración 150–300 ms. Respeta `prefers-reduced-motion`
  (`useReducedMotion`) — sin excepción.
- **Tipografía y espaciado**: los de la app. Nada de tamaños ad hoc.

## 3. Patrones obligatorios

- **Estado vacío con propósito**: ilustración ligera + una frase + la acción
  principal. Nunca «No hay datos».
- **Carga**: `Skeleton` con la forma real del contenido, no un spinner central.
- **Errores**: junto al campo, con `aria-describedby`, y foco al primer error.
  Los del servidor, en un `Alert` con qué pasó y qué hacer.
- **Acciones destructivas**: `confirm-dialog` existente, con el nombre de lo que
  se borra en el texto.
- **Tarjetas antes que tablas** para catálogos (voces, agentes, reglas,
  secuencias). Tablas solo para datos tabulares reales (historial, ejecuciones).
- **Búsqueda y filtros arriba, chips de filtro activos visibles**, como la
  referencia de ElevenLabs.
- **Sin páginas duplicadas**: se rediseña la existente en su ruta actual.

## 4. Accesibilidad (no negociable, ver skill `accessibility-a11y`)

- Todo operable solo con teclado; `Escape` cierra; el foco vuelve al disparador.
- Botones de solo icono con `aria-label`.
- Contraste AA en ambos temas, verificado.
- Un `<label>` por campo, `htmlFor`/`id`.
- Se navega el flujo completo sin ratón antes de darlo por terminado.

## 5. Límites duros del proyecto

- Máximo **300 líneas** por componente. Se extrae, no se apila.
- La organización sale de la sesión, nunca del body.
- Nada de lógica de negocio en el componente: los servicios existentes se
  llaman, no se reimplementan.
- Migraciones solo por MCP, versionadas con `.sql` + rollback.
- Cero nombres de organizaciones cliente en código, fixtures o docs.

## 6. Página por página

### 6.1 Agentes IA → Voces (referencia: ElevenLabs «Voces › Explorar»)

- **Biblioteca**: cuadrícula de tarjetas. Cada voz: avatar **generado**
  (orbe/gradiente determinista a partir del `voice_id`, porque la API de
  ElevenLabs no trae fotos; es lo que hace la propia ElevenLabs), nombre,
  etiquetas (idioma, género, acento, caso de uso), y un botón de
  **previsualizar** que reproduce `preview_url` con estado visible (onda o
  pulso animado mientras suena; solo una a la vez).
- **Fuente**: la biblioteca pública de ElevenLabs (`/v1/shared-voices`), no
  solo las del workspace. Filtros: idioma (español primero), género, caso de
  uso, búsqueda por nombre. Paginación o scroll incremental.
- **Mis voces**: pestaña aparte con las guardadas en la organización y las
  clonadas; marcar la predeterminada con un solo clic.
- **Clonar mi voz**: flujo guiado en pasos: (1) explicar qué se va a hacer y
  pedir consentimiento explícito (es la voz de una persona: casilla + texto de
  Habeas Data, se guarda como evidencia en `consent_evidence`); (2) **mostrar
  el guion exacto que hay que leer** —un texto en español neutro de 60–90 s que
  cubra fonemas variados—, con grabador en pantalla, medidor de nivel y
  contador; (3) escuchar la muestra y regrabar si hace falta; (4) nombrar la voz
  y crearla. Errores de la API en lenguaje humano.
- Todo lo que hoy exista en `VoicesPanel`, `VoiceAddForms` y
  `VoiceRecorderPanel` se reorganiza bajo este flujo; no se pierde función.

### 6.2 Automatizaciones

- **Lista**: tarjetas con nombre, disparador en lenguaje humano («Cuando una
  oportunidad entra en *Propuesta enviada*»), interruptor activo/inactivo,
  última ejecución y contador de ejecuciones. Estado vacío que invita a crear
  la primera con un ejemplo.
- **Editor**: en vez de un formulario largo, una **frase construible**:
  «Cuando [disparador] · si [condiciones] · entonces [acciones]». Cada bloque
  se edita en su sitio; las condiciones y acciones se añaden como fichas.
  Vista previa en texto de lo que hará la regla antes de guardar.
- **Probar en seco** visible y explicado: qué haría con una oportunidad
  elegida, sin ejecutar.

### 6.3 Secuencias

- **Lista**: tarjetas con nombre, número de pasos como mini-línea de tiempo
  (iconos de canal en fila), inscritos activos, tasa de respuesta.
- **Editor**: **línea de tiempo vertical**: cada paso es una tarjeta con su
  canal (icono), su espera («2 días después») y su contenido resumido; se
  añade un paso entre dos con un `+` en la línea; se reordena arrastrando (si
  se implementa, con alternativa de teclado). Las condiciones de corte se ven
  como bifurcación, no como campo escondido.
- **Inscribir**: diálogo corto: a quién, desde qué paso, y una advertencia
  clara de que se van a enviar mensajes reales.

## 7. Definición de terminado (para el tester)

1. Navegación completa por teclado, ambos temas, sin ratón.
2. Ningún componente > 300 líneas.
3. `prefers-reduced-motion` respetado (se comprueba con la preferencia activa).
4. Contraste AA verificado con herramienta.
5. Cero regresión funcional: todo lo que hacía la página anterior se puede
   seguir haciendo.
6. Pruebas de los componentes puros (transformaciones, filtros, avatar
   determinista) escritas antes y vistas en rojo.
7. Voces: la biblioteca carga contra la API real, la previsualización suena, y
   la clonación se prueba con una muestra real **con una voz de prueba con
   nombre inconfundible que se borra al terminar**.
