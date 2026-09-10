# ADR-001 — Fase 0: correcciones críticas del motor de IA conversacional

- **Fecha:** 2026-09-09
- **Estado:** Implementado y desplegado en producción (`jgmgphmzusbluqhuqihj`)
- **Alcance:** Edge Function `ai-auto-response` (v69 → v71), trigger `trg_ai_auto_response`, créditos de IA, respuestas rápidas.

---

## Contexto

Quien responde a los clientes no es Next.js sino la Edge Function `ai-auto-response`, disparada por un trigger sobre `messages`. Esa función tenía cuatro problemas que hacían inviable construir nada encima:

1. **Cruce de tenants.** `verify_jwt: false`, `organizationId` tomado del *body* y la conversación consultada **sin filtrar por organización**. Cualquiera que conociera la URL podía inyectar mensajes y quemar créditos ajenos.
2. **Cobro doble latente.** El trigger `trg_consume_ai_credits_on_message` descontaba 1 crédito por cada `messages.role='ai'`, y las rutas Next llamaban además a `consumeAICredits()`. Hoy no se nota porque esas rutas están muertas; en cuanto se conecten, se cobra dos veces.
3. **Guardia muerta en `ai_mode`.** El código comparaba con `'disabled'`, un valor que no existe (los valores reales son `ai_only | hybrid | manual`). `hybrid` no tenía ninguna lógica propia.
4. **Fallos invisibles.** `ai_jobs` solo se escribía cuando todo salía bien, y el trigger dispara en cada mensaje entrante sin debounce ni idempotencia: tres mensajes seguidos producían tres respuestas pisándose.

## Decisiones

### 1. La organización sale de la fila, nunca del body

`organization_id` se deriva siempre de la fila `conversations`. Si el body trae uno distinto → **403**. Todas las consultas posteriores filtran por el valor derivado.

### 2. La función solo acepta llamadas del trigger

Se exige la cabecera `x-internal-secret`. Sin ella o con valor incorrecto → **401**, con comparación en tiempo constante.

**El secreto vive en `vault`, no en variables de entorno.** Alternativa considerada: `Deno.env.get('AI_INTERNAL_SECRET')`, como sugería la especificación. Se descartó como mecanismo *principal* porque no hay forma de fijar variables de entorno de Edge Functions desde el MCP: la función habría respondido 401 a todo el tráfico hasta que alguien entrara al panel a configurarlas — una caída de producción por un paso manual. Con vault, el secreto se genera en la migración y ambos extremos lo leen solos.

Se conserva la variable de entorno como fuente preferente si algún día se configura; vault es el respaldo automático.

### 3. Cobrar en el punto de generación

Se elimina el trigger `trg_consume_ai_credits_on_message`. Cobra quien genera, vía `decrement_ai_credits` (atómico, `SELECT … FOR UPDATE`), registrando `ai_usage_logs` con modelo, tokens y `credits_before/after`.

Se comprueba el saldo **antes** de llamar al modelo y se cobra **después** de que la respuesta llegue, para no cobrar por generaciones fallidas. Si los créditos se agotan en medio, el job queda `skipped/no_credits` y no se envía el mensaje.

`deduct_ai_credits()` se **elimina**: insertaba en `ai_usage_logs.credits_used` (columna inexistente), omitía `action_type` (NOT NULL) y su `EXCEPTION WHEN OTHERS` revertía el descuento al savepoint del bloque **pero devolvía TRUE igualmente**. No la llamaba nadie.

> Corrección al diagnóstico previo: `fn_consume_ai_credits_on_message` **no** estaba rota — usaba las columnas correctas. La rota era solo `deduct_ai_credits`.

### 4. `hybrid` conserva el comportamiento actual (decisión deliberada)

La especificación pedía que en `hybrid` la IA respondiera solo *fuera* del horario laboral. **No se implementó así por defecto**, y esta es la desviación más importante de este ADR:

Los 7 canales productivos son `hybrid` **con `business_hours = {}`**. Aplicar esa regla habría dejado el horario laboral indefinido para todos y, según cómo se resolviera el caso vacío, habría silenciado al bot en producción sin que nadie lo pidiera.

Semántica implementada:

| `ai_mode` | Comportamiento |
|---|---|
| `manual` | Nunca responde. |
| `ai_only` | Responde siempre. |
| `hybrid` | Responde **salvo** que un agente humano haya escrito en los últimos `hybrid_agent_pause_minutes` (default 30). |

La regla de horario laboral existe pero es **opt-in**: `ai_settings.hybrid_respect_business_hours` (default `false`). Con el flag activo y horario configurado, la IA calla dentro del horario. Si el horario está vacío, `dentroDeHorarioLaboral()` devuelve `null` y la IA responde: "no sé" nunca significa "cállate".

### 5. Idempotencia por índice, debounce por ventana

Un índice único parcial sobre `ai_jobs (conversation_id, trigger_message_id) where job_type='auto_response'` actúa de candado: la función inserta el job *antes* de generar, y la invocación que pierde la carrera recibe `23505` y se retira.

El debounce usa `auto_response_delay_seconds` (ya existía, nunca se usaba): se espera la ventana y, si llegó un mensaje posterior del cliente, este job termina en `skipped/superseded` y responde la invocación del último mensaje.

Todo job se cierra siempre: `completed`, `failed` (con `error_code` y `error_message`), `skipped` o `draft`. Se añadieron `skipped` y `draft` al CHECK de `status`. Reintento con backoff exponencial (máx. 3 intentos) ante 5xx/429/timeout.

### 6. El modo borrador no puede pasar por `messages`

El usuario pidió modo borrador opcional por canal (`channels.ai_draft_mode`, default `false`). **Un borrador nunca se inserta en `messages`**: el trigger `trg_channel_dispatch` despacha a WhatsApp/Facebook/Instagram cualquier `outbound` con `role='ai'`, así que insertarlo lo enviaría al cliente — justo lo contrario de un borrador. Se guarda en `ai_jobs` con `status='draft'`.

**Limitación explícita:** la Fase 0 deja la infraestructura, pero **no hay UI para aprobar borradores** hasta la Fase 4. Activar el flag hoy significa que ese canal deja de responder. Por eso nace en `false` en todos los canales.

### 7. Lógica pura compartida desde ya

`supabase/functions/_shared/ai-chat/politicaRespuesta.ts` contiene la decisión de responder o callar, sin dependencias de Deno ni de Next. La Edge Function la importa con extensión `.ts` (como exige Deno) y Jest la importa sin extensión (como resuelve TypeScript). **Un solo archivo, dos runtimes, sin duplicar lógica** — y es el primer ladrillo del núcleo compartido de la Fase 1.

## Consecuencias

**A favor**

- Cierra el cruce de tenants y el acceso anónimo.
- Los créditos se cobran exactamente una vez, con costo y modelo trazables.
- Los fallos dejan de ser invisibles: `ai_jobs` registra `failed` y `skipped` con motivo.
- Tres mensajes seguidos producen una sola respuesta.
- El comportamiento observable del bot **no cambia**: todos los flags nuevos nacen conservadores.

**En contra / deuda asumida**

- La Edge Function sigue siendo un archivo de 1.400 líneas con el prompt cableado a retail. La Fase 1 lo parte; la Fase 5.4 lo hace multi-vertical.
- El modo borrador está a medias por diseño (falta la UI de la Fase 4).
- El secreto en vault se lee por RPC en el arranque en frío de cada instancia (cacheado en memoria): un viaje extra a la base, despreciable.
- Revertir exige revertir **SQL y Edge Function a la vez**; el rollback SQL solo dejaría la función devolviendo 401 a todo. Documentado en el propio archivo de rollback.

## Addendum — Fragmentos de búsqueda del catálogo (mismo día)

**Síntoma reportado:** un cliente escribió «Hila» (un «Hola» mal tecleado) y el bot respondió con tarjetas de pocillos y mugs.

**Causa raíz:** `normalizeSpanish()` borra todas las `h` (normalización fonética del español, pensada para que «ornos» encuentre «hornos»). Con `hila` produce `ila`, y la búsqueda usaba `ILIKE '%ila%'`, que casa con «Poc**illo** Ap-**ila**-ble» y «Mug Ap-**ila**-ble». En el catálogo real de la organización 135, `%ila%` devuelve **107 productos**.

El problema de fondo no era esa palabra: **cualquier fragmento corto generado por la máquina se usaba como subcadena libre contra el catálogo**, y una subcadena de 3 letras casa con cualquier cosa (`%tal%` → «cristal», «metal», «Total»).

**Reglas implementadas** (`supabase/functions/_shared/ai-chat/busquedaProductos.ts`):

1. Lo que el cliente **tecleó** siempre se busca: es la señal más fiable.
2. Lo que **deriva la máquina** (plural, singular, normalización fonética) solo se busca con 5+ caracteres.
3. Un fragmento de menos de 4 caracteres solo casa a **inicio de palabra** (`mug%` / `% mug%`), no en cualquier posición. Así «mug» encuentra «Mug Apilable» pero «ola» no encuentra «cacerola».

Se usan patrones sueltos con `.ilike()` en vez de una expresión `or=()` de PostgREST: `.ilike()` ya se usaba aquí y su comportamiento es conocido, mientras que un patrón con espacios dentro de `or=()` obliga a entrecomillar y es una fuente de fallos silenciosos justo en la ruta principal del catálogo.

También se eliminó un *fallback* que repetía la búsqueda con `%kw%`: era redundante (el bucle principal ya busca la palabra tal cual) y reintroducía la subcadena libre.

**Verificado contra el catálogo real (org 135):**

| Consulta | Antes | Ahora |
|---|---|---|
| Fragmento `ila` | 107 productos | no se genera |
| Todos los fragmentos de «hila» | — | 0 |
| `mug` | 116 | 116 |
| `pocillo` | 86 | 86 |
| `ola` → cacerolas | casaba | 0 |

**Deliberadamente NO se hizo:** un detector difuso de saludos (distancia de edición ≤1 contra «hola»). A distancia 1 de «hola» están «bola», «cola» y «sola», que pueden ser productos reales; habría cambiado un falso positivo por otro. Con las reglas de fragmentos, «hila» ya no encuentra nada y el prompt entra por la rama «sin resultados», que instruye explícitamente a saludar sin mencionar productos.

**Defecto preexistente detectado, no corregido:** `extractKeywords()` quita los acentos, pero los nombres del catálogo los conservan, así que `ILIKE '%cafe%'` no encuentra «Café». Es anterior a este cambio y conviene resolverlo con `unaccent` en la Fase 2, junto con la búsqueda léxica.

## Addendum 2 — Reescritura del buscador de catálogo (multivertical)

Tras la auditoría sobre 15.016 respuestas reales y los catálogos de 19 organizaciones, se rehízo el buscador. El detonante: **el 45% de las búsquedas no encontraba nada** y las listas cableadas de electrodomésticos no servían para la perfumería, la droguería, la licorera ni la tienda de tenis que ya están en producción.

### Qué se cambió

| # | Cambio | Dónde |
|---|---|---|
| 1 | Normalización idéntica en catálogo y consulta (tildes, apóstrofos) | `normalizar_busqueda()` + columnas generadas |
| 2 | Variantes agrupadas bajo su producto padre antes de recortar | `buscar_productos()` |
| 3 | No se busca cuando el mensaje no habla de productos | `intencionConsulta.ts` |
| 4 | Vocabulario por organización, desde su propio catálogo | `org_vocabulario` + `palabras_de_catalogo()` |
| 5 | Ranking multi-campo con umbral, en una sola consulta | `buscar_productos()` |

### Decisiones que conviene conocer

**`f_unaccent` miente sobre su volatilidad.** `unaccent(regdictionary, text)` es `STABLE`, y Postgres no admite funciones estables en índices ni en columnas generadas. El envoltorio declarado `IMMUTABLE` es el procedimiento documentado y habitual, pero tiene una consecuencia real: **si algún día se modifica el diccionario `unaccent`, hay que reconstruir las columnas generadas y sus índices**. Queda anotado en la propia migración.

**Los apóstrofos se borran, no se convierten en espacio.** Si "Men's" pasara a "men s", el cliente que escribe "mens" seguiría sin encontrarlo. Borrarlo da "mens", que es como se escribe en un chat. El resto de signos sí pasan a espacio, para no pegar palabras que estaban separadas por un guion.

**El teléfono se detecta contando dígitos, no por la forma.** Una regla basada solo en el aspecto se comía consultas legítimas como «talla 42 43 44».

**El vocabulario decide, no el vertical.** No hay plantillas por tipo de negocio: `organization_types` no es fiable (una de ellas está registrado como `restaurant` y vende jeans). El vocabulario sale del catálogo de cada organización y se refresca con `pg_cron` (job 20, 04:17 diario) mediante `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

**La corrección de erratas ya no es un mapa fijo.** `labadora → lavadora` funcionaba solo para línea blanca. Ahora la similitud trigram contra el catálogo real resuelve `pocilo → pocillo` y `acetaminofeno → acetaminofen` sin mantener ninguna lista.

**Se eliminó `busquedaProductos.ts`** (creado horas antes para el caso «Hila»): la función SQL lo dejó obsoleto y mantener las dos reglas en paralelo garantizaba que divergieran.

### Verificado en producción

| Caso | Antes | Ahora |
|---|---|---|
| Org 139 · `mens` | 0 | **2.470** productos alcanzables, 6 tarjetas = 45 agrupados |
| Org 135 · `cafe` | 51 | **153** |
| Droguería · `unguento` | 0 | **2** |
| Org 139 · `calzado` (categoría) | 0 | **6** |
| `pocillo apilable` | mismo producto 2 veces | **1 tarjeta**, `presentaciones: 2` |
| `hila` (errata de «hola») | 107 productos | **0** |
| `estafadores`, `pago` | buscaba y fallaba | **no se busca** |

### Limitación conocida, no resuelta

**No hay capa de sinónimos.** El vocabulario solo conoce las palabras que están en el catálogo. Un cliente que escriba «zapatillas» en la Org 139 no encuentra nada, porque ese catálogo está en inglés (en inglés). Buscar por categoría (`calzado`) sí funciona y cubre parte del hueco.

No es una regresión — comprobado que el código anterior tampoco lo encontraba, pese a tener `zapatillas → tenis` cableado, porque el nombre del producto no contiene «tenis». La solución correcta es una tabla de sinónimos por organización, editable por el tenant. Queda como trabajo pendiente.

## Addendum 3 — Catálogo de modelos, costo real y multiproveedor (Fase 5.2/5.3)

### Qué se cambió

| # | Cambio | Dónde |
|---|---|---|
| 1 | Catálogo de modelos servido desde la base, no cableado | `ai_model_catalog` + `ai_modelos_disponibles` + `/api/chat/ai/modelos` |
| 2 | Selector con Luna / Terra / Gemini Flash y gpt-4o marcados *legacy* | `ModelSettings.tsx`, `LabSettingsPanel.tsx` |
| 3 | `ai_jobs.total_cost` y `ai_usage_logs.cost_amount` calculados de verdad | `calcular_costo_llm()` + Edge Function |
| 4 | `ai_settings.provider` deja de ser decorativo: Google implementado | `generarConGoogle()` en la Edge Function |

Decisión mantenida: los *legacy* se muestran pero **no se migró ninguna organización**. Las 38 siguen en gpt-4o / gpt-4o-mini.

### Decisiones que conviene conocer

**El costo devuelve `NULL`, no cero, cuando no hay tarifa.** gpt-4o y gpt-4o-mini no tienen fila en `provider_pricing`, así que su gasto no es calculable. Un cero diría "esto no costó nada", que es falso.

**Se borraron dos tablas de precios cableadas** (`openaiService.calculateCost` y la privada de `aiLabService`). Ambas caían a gpt-4o-mini para cualquier modelo desconocido: habrían cobrado `gpt-5.6-terra`, que cuesta 10×, a precio de gama baja.

**No se inventó ninguna capacidad de modelo.** Contexto y tarifas salen del ANEXO-B y de `provider_pricing`. Lo no verificado queda `NULL` y la interfaz muestra "—". Por eso `soporta_vision` está en `NULL` para la familia 5.6 y para Gemini: no hay dato confirmado.

**La visión sigue yendo siempre por gpt-4o**, sea cual sea el proveedor elegido: es el único modelo del catálogo con soporte de imagen confirmado.

**Anthropic no se ofrece.** No tiene credencial en `providerRegistry.buildEnvFallbacks()` ni tarifa en `provider_pricing`. Ofrecerlo sería repetir el problema que este cambio arregla.

**Si una organización elige Google sin credencial, se responde con OpenAI y se registra el error.** Dejar al cliente sin respuesta por un fallo de configuración del tenant sería peor.

### Fuga entre organizaciones detectada y cerrada

Al revisar permisos tras aplicar las migraciones del buscador apareció un fallo **introducido por esas mismas migraciones**:

- **`org_vocabulario` es una MATERIALIZED VIEW, y las MV no admiten RLS.** Quedó legible por `anon`, y la clave anónima va embebida en el widget público: cualquiera podía leer nombres de producto, marcas y categorías **de todas las organizaciones**.
- **`refrescar_org_vocabulario()` es `SECURITY DEFINER` y era ejecutable por `anon`**: se podía forzar en bucle un `REFRESH MATERIALIZED VIEW` sobre 28.348 productos sin autenticarse.

Causa: Supabase aplica `DEFAULT PRIVILEGES` que conceden a `anon` y `authenticated` todo objeto nuevo del esquema `public`. **Conceder a `authenticated` no quita nada; hay que revocar explícitamente.** Ver [[supabase-rpc-anon-exposure]].

Corregido en `20260909170000_buscador_catalogo_permisos.sql` y `..._guarda_pertenencia.sql`:
- `org_vocabulario` solo para `service_role`.
- `refrescar_org_vocabulario()` solo para `service_role`.
- `buscar_productos`, `palabras_de_catalogo`, `calcular_costo_llm`, `normalizar_busqueda`, `f_unaccent` revocadas a `anon`.
- `ai_modelos_disponibles` pasa a `security_invoker = true`: antes se ejecutaba con los permisos de su dueño y saltaba la RLS de la tabla de abajo.
- `palabras_de_catalogo` pasa a `SECURITY DEFINER` **con guarda de pertenencia**: un usuario autenticado solo puede consultar su propia organización; sin ella podría sondear qué palabras existen en el catálogo ajeno.

### Costo por 1.000 respuestas, con el consumo real medido

Promedio real de las respuestas ya enviadas: 2.197 tokens de entrada y 56 de salida.

| Modelo | Por 1.000 respuestas |
|---|---|
| gpt-5.6-luna | **$0,51** |
| gemini-3.8-flash | $1,86 |
| gpt-5.6-terra | $5,07 |
| gpt-4o / gpt-4o-mini | sin tarifa cargada |

**El 87% del costo es el prompt, no la respuesta.** Recortar el prompt de ~4.000 tokens cableado a retail ahorra más que cambiar de modelo, y el ANEXO-B documenta *prompt caching* de hasta 90% en la familia 5.6 (prefijo ≥1024 tokens, cached = 0,1×). Es la palanca real de costo y sigue pendiente (Fase 5.4).

## Hallazgo pendiente: `chat-widget`

Se revisó `chat-widget` (v75, `verify_jwt:false`), como pedía el encargo. **No comparte el fallo de cruce de tenants**: deriva la organización de `channels.public_key` y solo inserta mensajes con `role='customer'`, nunca `'ai'` (por eso quitar el trigger de cobro es seguro).

Sí tiene un problema distinto, **no resuelto en la Fase 0**: es un endpoint público sin límite de tasa ni validación de origen. La `public_key` va embebida en el JavaScript del sitio del cliente, o sea que es pública por definición. Cualquiera puede enviarle mensajes en bucle y **cada uno dispara una respuesta de IA que consume créditos**. Añadir el secreto interno a `ai-auto-response` no cierra este vector, porque aquí el trigger se dispara legítimamente.

Mitigación sugerida (fuera de alcance, conviene priorizarla): límite de tasa por `sessionId`/IP en `chat-widget`, validación de `Origin` contra los dominios de la organización, y un tope diario de respuestas de IA por conversación.

## Verificación realizada

| Criterio | Resultado |
|---|---|
| Llamada sin secreto | **401** (`curl` en vivo) |
| Llamada con secreto incorrecto | **401** |
| `organizationId` que no corresponde a la conversación | **403** (llamada firmada desde la propia BD vía `pg_net`) |
| El trigger no rompe el `insert` de mensajes | `INSERT` real ejecutado y revertido: los 9 triggers corrieron sin error |
| Candado de idempotencia | Duplicado rechazado con `23505` |
| Esquema | Trigger de cobro eliminado, `deduct_ai_credits` eliminada, candado y RPCs presentes |
| Tipos | `tsc --noEmit`: 0 errores en los archivos tocados |
| Lint | Limpio en los archivos nuevos |
| Tests | 23 nuevos, todos en verde; suite completa 1.439 en verde |

Sin verificar en producción por falta de tráfico real en la ventana de trabajo: el debounce de tres mensajes seguidos y el registro de un `failed` por caída del proveedor. Ambos están cubiertos por la lógica y el candado, pero conviene mirar `ai_jobs` tras el primer día de tráfico.
