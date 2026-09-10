# ADR-003 — GO Assistant, Fase 1: núcleo del agente

- **Fecha:** 2026-09-10
- **Estado:** Implementado (pendiente de prueba de humo con sesión real)
- **Alcance:** el asistente del header. Fase anterior: `ADR-002`.
- **Plan:** `docs/PROMPT-CLAUDE-CODE-ASISTENTE-AGENTE.md`, §5 y §14 (Fase 1)

---

## Contexto

La Fase 0 dejó el asistente seguro y escribiendo contra el esquema real, pero
con tres deudas que impedían construir nada encima:

1. **Las acciones viajaban en un bloque de texto** ```` ```action ```` parseado
   con `/```action\s*([\s\S]*?)```/`. Si el modelo escribía una coma de más, o
   dos bloques, la acción se perdía **en silencio** (C5).
2. **Sin streaming.** `NextResponse.json(...)` devolvía todo cuando el modelo
   terminaba: entre 5 y 20 segundos de tres puntitos (C7).
3. **Sin persistencia.** El hilo vivía en `useState`: se cerraba el panel y se
   perdía todo (C6).

---

## Decisiones

### 1. Tool calling nativo, y el catálogo NO se duplica

El modelo ya no serializa JSON dentro de un bloque de texto: las herramientas se
declaran al proveedor y la salida estructurada la garantiza él.

La decisión no obvia es de dónde salen esas herramientas. `ACTION_CATALOG` ya
declara nombre, riesgo, permisos, módulo, disponibilidad y esquema de campos para
16 acciones. Escribirlas otra vez como `ToolDefinition` habría creado dos fuentes
de verdad que divergen en semanas — que es exactamente lo que pasó en F0 con lo
que el tester llamó "el filtro gemelo".

Así que **se derivan**: `catalogTools.ts` convierte cada acción del catálogo en
una herramienta cuyo `preview()` construye la tarjeta y cuyo `execute()` llama a
`aiActionsService`. El JSON Schema se genera del esquema de campos, incluidos los
`enum` de los `select` con opciones fijas.

Solo se registran las acciones `available: true`. Las seis que aún no están
implementadas no se le ofrecen al modelo: ofrecérselas sería prometer lo que no
se puede cumplir.

### 2. El turno se pausa, no se aborta

`runAgent` distingue por riesgo (§5.4):

| Riesgo | Qué pasa |
|---|---|
| `low` | `execute()` directo, el resultado vuelve al modelo, la conversación sigue |
| `medium` / `high` | `preview()`, fila `ai_agent_actions` en `pending`, tarjeta al cliente, **se pausa** |

Al pausar, el turno devuelve `pendingActionId` y el bucle sale. Cuando el usuario
confirma, `/execute-action` —el camino endurecido en F0— hace el trabajo.

**Una sola propuesta de escritura por turno.** Si el modelo pide dos, la segunda
espera. §6.2 prohíbe que un único "sí" dispare varias acciones `medium`/`high`, y
la forma más simple de garantizarlo es no permitir que se propongan juntas.

### 3. Las herramientas se filtran antes, no después

`resolveTools(caps, channel)` aplica `nivel × permisos × módulos × canal`, y el
resultado es literalmente lo que se le manda al proveedor. Una herramienta que el
usuario no puede ejecutar **no existe** para el modelo.

`toolRegistry` y `actionGuard` (F0) evalúan lo mismo por caminos distintos: el
primero gobierna qué se ofrece, el segundo qué se ejecuta. Es defensa en
profundidad, no duplicación — y `/execute-action` sigue reevaluando permisos en
el momento de ejecutar, porque entre la propuesta y la confirmación pueden
cambiar.

La lista negra (§9.4) se comprueba **al registrar**, no al ejecutar: si alguien
añade `delete_organization` al catálogo, el registro lanza al construirse.

### 4. Streaming SSE en una ruta nueva, no en la de siempre

`/api/ai-assistant/stream` es nueva; **`/chat` se queda intacta y funcionando**.

No es indecisión: es el §3.1 del contrato de no regresión ("si el motor nuevo
falla, cae al camino de hoy antes que devolver error"). El cliente intenta el
stream y, si no llega a ninguna parte —un proxy que bufferiza, un navegador sin
soporte, un fallo del motor nuevo—, reintenta por `/chat`. Una organización cuyo
asistente hoy responde no puede quedarse muda por esta fase.

Se usa `fetch` con lector de stream en vez de `EventSource` porque este solo hace
GET y no manda cabeceras.

`X-Accel-Buffering: no` en la respuesta: sin eso, nginx bufferiza el SSE y anula
todo el propósito.

**Los pasos de herramienta son la mitad del valor.** `tool_start`/`tool_end` no
son adorno: convierten 12 segundos de espera en 12 segundos de trabajo visible
("Buscando en el catálogo… → 6 coincidencias"), y son la principal palanca de
confianza cuando la IA va a tocar el catálogo.

### 5. El historial sale de la base, no del cliente

`ai_assistant_conversations` + `ai_assistant_messages`, con RLS de autor (y
lectura para administradores de la organización, para auditar).

Consecuencia de seguridad no buscada pero bienvenida: **el cliente ya no manda el
historial**. En F0 llegaba en el body y hubo que sanearlo para que no colara un
mensaje `system`; ahora se lee de la base y ese vector desaparece.

El título del hilo se genera **recortando el primer mensaje**, no llamando al
modelo. El plan sugería el modelo barato; son créditos del cliente por algo que
un `slice` resuelve. Si los títulos resultan malos, se cambia — pero no se paga
por adelantado.

### 6. `pg_cron` para caducar propuestas (deuda de F0)

`fn_expire_ai_agent_actions()` cada 10 minutos. La ventana es de 30, así que el
retraso máximo es de 10. `/execute-action` comprueba `expires_at` igualmente: el
cron es higiene, no la garantía.

### 7. Ningún modelo cableado

`modelRouter.ts` resuelve por tarea: `ai_assistant_settings.model_overrides` →
`ai_settings.model` → variable de entorno → default declarado en un solo sitio.
Cada respuesta registra de dónde salió el modelo (`model_source`), para poder
depurar por qué respondió quien respondió.

Se mantiene el mínimo de 1500 tokens sobre `ai_settings.max_tokens` (default 500,
pensado para WhatsApp), por la misma razón que en F0.

---

## Lo que NO se hizo

| Deuda | Fase |
|---|---|
| El costo en USD sigue sin persistirse (`unitSku`) | F7 |
| La tarjeta sigue siendo un formulario editable | F3 la sustituye por confirmación conversacional |
| `undo_payload` se guarda y nadie lo aplica | F3 |
| Sin herramientas de venta, compra ni ajuste documentado | F2 |
| Sin adjuntos ni visión | F4 |
| Sin voz | F5 |
| El panel no relee el hilo al reabrirse | La conversación ya persiste; falta la interfaz de historial, que es F7 |

---

## Verificación

- **120 tests del asistente en verde** (44 guardarraíles + 35 F0 + 8 contrato +
  33 F1). Suite completa: 1605 verdes, 2 rojos preexistentes y ajenos
  (`sectionContract.test.ts`, plan del editor web).
- `tsc --noEmit`: sin errores. `next lint`: limpio en los archivos de la fase.
- Se prueba explícitamente que **`preview()` no puede escribir**: se le pasa un
  cliente de base de datos que lanza al primer acceso. Es la forma más directa de
  demostrar el invariante 1 — no puede escribir porque ni siquiera puede hablar
  con la base.
- Se prueba que el prompt ya no menciona ```` ```action ````, que sin herramientas
  de escritura se le prohíbe prometer cambios, y que un nombre con saltos de línea
  no inventa secciones.

### Lo que sigue sin evidencia

**No hay prueba de humo HTTP con sesión real.** Todo se ha verificado con tests y
contra la base llamando a las funciones directamente. Falta un recorrido completo
—abrir el panel, pedir algo, ver el stream, confirmar una tarjeta— que deje una
fila en `ai_agent_actions` y otra en `ai_assistant_messages`. Es la última
evidencia que falta de las fases 0 y 1, y no debería cerrarse ninguna de las dos
sin ella.
