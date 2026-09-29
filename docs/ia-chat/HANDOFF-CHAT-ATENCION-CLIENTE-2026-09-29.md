# HANDOFF — Chat de atención al cliente final (`ai-auto-response`) · 2026-09-29

Relevo de la sesión que trabajó el motor conversacional del chat del widget / WhatsApp, para que
otro agente lo continúe sin releer la conversación. Complementa, no reemplaza: `CLAUDE.md`,
`PROGRESS.md` (historial por rondas, entradas «Motor IA Chat» en las líneas 1340, 1506, 1992 y
2391), `docs/ia-chat/ADR-001-fase0-correcciones-criticas.md` (+ addenda 1–5) y
`docs/POLITICA-MIGRACIONES.md`.

**Qué es esto.** El bot que responde a los clientes finales de las organizaciones en el widget de
su tienda, WhatsApp, Instagram y Facebook. **No es GO Assistant** (el asistente del header, para el
personal de la organización): ver `HANDOFF-GO-ASSISTANT-2026-09-29.md`. Comparten cobro de créditos
y resolución de organización; no comparten prompt, catálogo de acciones ni política de confirmación.

> Aviso de ámbito: este documento describe lo que está en producción y lo que falta. **No autoriza
> por sí mismo ningún cambio.** Hay clientes usando esto ahora mismo; la regla del dueño sigue
> siendo «no puedes romper nada de lo que funciona hoy».

---

## 1. Estado en una línea

Desplegado y estable: función `ai-auto-response` **v90 (2026-09-15, 23:55 UTC)**, idéntica al árbol
(commit `56f020fb`). Rondas 0 a 4 cerradas. Lo que falta está en §7, y lo más doloroso para los
clientes es el **escalado a un humano**, que sigue sin existir.

---

## 2. Quién responde de verdad (y qué es código muerto)

```
cliente escribe  →  chat-widget (Edge, pública, verify_jwt:false)
                 →  insert en public.messages (role='customer')
                 →  trigger trg_ai_auto_response → trigger_ai_auto_response()
                 →  net.http_post a ai-auto-response con cabecera x-internal-secret
                                        (secreto en Vault, vía get_ai_internal_secret(), service_role)
                 →  ai-auto-response genera, cobra créditos e inserta la respuesta (role='ai')
```

- **`src/app/api/chat/ai/**` es código muerto** para este flujo: existen rutas Next que parecen
  hacer esto y no las llama nadie en producción (salvo el laboratorio y el catálogo de modelos).
  Si editas ahí, no cambias el comportamiento del bot. Ya pasó.
- La organización **siempre** sale de la fila de `conversations`, nunca del body: si no coincide,
  403.
- Sin la cabecera correcta: 401. Verificado en vivo (ADR-001 §Verificación).

---

## 3. Dónde vive el código

| Pieza | Ruta |
|---|---|
| El bot (todo el flujo) | `supabase/functions/ai-auto-response/index.ts` (~1.820 líneas) |
| Lógica pura compartida (Deno + Jest) | `supabase/functions/_shared/ai-chat/` |
| — ¿responder o callar? | `politicaRespuesta.ts` (`secretosCoinciden`, `dentroDeHorarioLaboral`, `decidirSilencio`) |
| — ¿buscar en el catálogo? | `intencionConsulta.ts` (`decidirBusquedaCatalogo`, `pareceSoporte`, `pareceCortesia`, `pareceSeguimientoDeVariante`) |
| — pedidos del cliente | `pedidosCliente.ts` (`extraerNumeroDePedido`, `correoParaBuscar`, `escaparLike`, `describirEstadoPedido`, `formatearPedidosWeb`, `fechaEnZona`) |
| — tallas, variantes y medidas | `variantesCatalogo.ts` (`resumirVariantes`, `esAtributoDeTalla`, `extraerMedidas`, `GUIA_TALLAS`) |
| Entrada pública del widget | `supabase/functions/chat-widget/index.ts` (v76) |
| Tests | `src/__tests__/services/{politicaRespuesta,intencionConsulta,pedidosCliente,variantesCatalogo}IA.test.ts` + `src/__tests__/guardrails.test.ts` |
| Configuración por organización (UI) | `src/components/chat/ia/configuracion/**`, `laboratorio/LabSettingsPanel.tsx` |
| Catálogo de modelos y coste | `src/app/api/chat/ai/modelos/route.ts`, `src/lib/services/aiSettingsService.ts`, `src/lib/services/openaiService.ts` |

**Los módulos de `_shared/ai-chat/` se importan con `.ts` desde Deno y sin extensión desde Jest.**
Esa es la razón de que la lógica pura viva ahí: es la única parte del bot que se puede probar sin
desplegar.

---

## 4. Objetos de base de datos que usa

| Objeto | Para qué |
|---|---|
| `normalizar_busqueda(text)`, `f_unaccent(text)` | quitan tildes y apóstrofos; se aplican **igual** al catálogo y a lo que escribe el cliente |
| `products.busqueda_nombre / _marca / _descripcion` | columnas generadas + índices GIN trgm |
| `org_vocabulario` (MV) | palabras que existen en el catálogo de cada organización; refresco por pg_cron job 20 (04:17) |
| `palabras_de_catalogo(org, text[])` | decide si lo que dijo el cliente nombra algo de ESA tienda; corrige erratas por similitud |
| `buscar_productos(org, tokens, limite, umbral)` | **v3**: una consulta, multi-campo, variantes agrupadas bajo el padre, LIMIT antes de precio/imagen/stock |
| `variantes_de_productos(org, ids[], max)` | tallas/colores/presentaciones con stock y precio, en orden natural de talla |
| `web_orders`, `invoice_sales`, `customers` | pedidos del cliente (ver §5.3) |
| `ai_settings`, `ai_vertical_efectivo`, `ai_jobs`, `ai_usage_logs` | configuración, vertical, trazabilidad y coste |
| `decrement_ai_credits`, `calcular_costo_llm` | cobro atómico y coste real por modelo |

Migraciones propias de este motor: `20260909140000`, `20260909150000`, `20260909170000` (buscador)
y **`20260915140000_buscador_variantes_y_rendimiento`** (v3 + variantes), todas con su `.sql` y su
`_rollback.sql`.

---

## 5. Las cinco cosas que el bot sabe hacer (y por qué están así)

### 5.1 Decidir si busca en el catálogo

Antes se buscaba con casi cualquier palabra: el 45 % de las búsquedas no encontraba nada y las
palabras que más fallaban eran «pago», «entrega», «estafadores», un correo y un teléfono. En 342
respuestas se mostraron tarjetas de producto sobre mensajes de reclamo.

Ahora: `decidirBusquedaCatalogo` descarta cortesía y soporte, y **quien decide si una palabra nombra
algo es el catálogo de la organización** (`palabras_de_catalogo`), no una lista cableada. Las listas
de marcas de electrodomésticos que había (`samsung|lg|mabe|haceb…`) no servían para la perfumería,
la droguería, la licorera ni la tienda de calzado.

Trampa histórica: `pareceCortesia` exige que **todas** las palabras sean de cortesía. Con la versión
anterior («empieza por un saludo»), «Hola, tienen armarios?» se clasificaba como cortesía y el bot
respondía que no había armarios teniendo decenas. Hay un test que lo fija.

### 5.2 Tallas, variantes y medidas (ronda 4)

- El modelo recibe la **lista real** bajo cada producto:
  `Tamaño disponibles: 40 (150), 40.5 (150), 41 (AGOTADA)…`
- `GUIA_TALLAS` (conversión US → Colombia/EU, hombre/mujer/niños) entra al contexto **solo si lo
  mostrado tiene tallas de ropa o calzado**; «Tamaño: 100 ml» no la activa (`esAtributoDeTalla`).
- Reglas que se le dan al modelo: la lista es la única verdad, convertir y ofrecer la equivalente
  **y las vecinas**, decir que la equivalencia es aproximada, preguntar cm del pie si duda, nunca
  inventar. Si la organización escribe su propia tabla en `ai_settings.system_rules`, **esa manda**.
- `extraerMedidas` saca de la descripción los fragmentos con número + unidad (cm, ml, litros, kg,
  oz, pulgadas). En la tienda de hogar (org 135/145) el 84 % de las descripciones traen medidas y el
  bot no veía ninguna.
- Seguimiento: «Que tienes talla 40?», «en rojo?», «el de 100 ml» no nombran nada del catálogo. La
  búsqueda nueva **siempre corre**; solo si vuelve vacía **y** el mensaje parece seguimiento se
  heredan las tarjetas del mensaje anterior con sus variantes. Ese orden importa: la primera versión
  heredaba siempre y respondió sobre pantalonetas a una pregunta por calzado.

### 5.3 Pedidos (ronda 3)

Orden de búsqueda: **número de pedido escrito** (`WO-<org>-XXXX`) → **correo escrito en el chat**
sobre `web_orders` → facturas por `metadata.linked_customer_id` o por el correo real.

- El correo del widget (`visitor_*@widget.local`) **nunca** identifica a nadie. Ese era el bug: se
  usaba `email || emailFromChat` y el ficticio siempre ganaba.
- Se consulta `web_orders`, no solo `invoice_sales`: el 88 % de los pedidos vive ahí y los
  pendientes, cancelados y expirados nunca llegan a factura.
- **`escaparLike` no es opcional.** Sin escapar, `ana_perez@x.com` casa con `ana.perez@x.com` (otra
  persona) y `%@gmail.com` devolvía pedidos de cualquier cliente de Gmail de la tienda. Verificado
  contra PostgREST: sin escapar 5 resultados, escapado 0.
- Tope de sondeo: más de 2 correos distintos en una conversación desactiva la búsqueda por correo y
  el bot pide el número de pedido.
- Estados en palabras del cliente: `EXPIRADO (el pago no se completó…)`, `CONFIRMADO, EN
  PREPARACIÓN`, `PENDIENTE DE PAGO`, etc. Fechas en la zona de la organización.

### 5.4 Prompt, vertical y caché

- Prefijo **estable** por organización en `instructions` (cacheable) + `CONTEXTO ACTUAL` del mensaje
  como turno aparte. Los bloques de retail (tarjetas, checkout, `[PEDIDO_LISTO]`, métodos de pago)
  están condicionados a `esRetail`; los demás verticales reciben su propio encargo
  (`ai_vertical_efectivo`).
- Medición: aciertos de caché ~70 %, entrada cacheada 58 % → 69 % tras reordenar, −12 % de coste.
- **No metas nada variable en el prefijo estable.** Dos ramas de «REGLAS CRÍTICAS» que dependían del
  resultado de la búsqueda rompían la caché en cada mensaje.

### 5.5 Créditos, topes y silencio

- Saldo se comprueba **antes** de llamar al proveedor y se cobra **después** de que la respuesta
  llegue: nunca se cobra una generación fallida. `decrement_ai_credits` es atómico y
  `ai_settings.credits_remaining` es la verdad.
- Topes dimensionados con 120 días de tráfico real: **100 por sesión/hora** (máximo real observado
  56 → 0 cortes) y **60 por conversación/día** (máximo real 44 → 0 cortes). El límite inicial de 30
  habría cortado 19 sesiones legítimas de 8.172; lo corrigió el dueño.
- `decidirSilencio` apaga el bot por canal manual, IA desactivada, horario y modo borrador.

---

## 6. Estado en producción (14 días, medido el 2026-09-29)

| Métrica | Valor |
|---|---|
| Mensajes de cliente | 6.197 |
| Preguntas por un pedido | 664, de las cuales **284 con datos reales** (43 %) |
| Dieron el número `WO-…` | 116 → **96 con datos (83 %)** |
| Dieron el correo | 10 → **7 con datos (70 %)** · antes del arreglo: **0 de 88** |
| Preguntas por talla / medida | 239 → **147 con productos (61 %)**, 20 respuestas negativas (8 %) |
| Pidieron un humano | 7 mensajes en 4 conversaciones (§7.1) |

Rendimiento del buscador en la organización más grande (16.551 productos activos):
**19.096 ms → 386 ms**. Era la causa de «no encuentro las zapatillas X» teniendo seis modelos:
PostgREST cancelaba a los 8 s (`statement_timeout` del rol `authenticator`) y el bot se quedaba sin
catálogo, sin error visible.

**Cambio del terreno que hay que tener en cuenta:** la tienda de calzado (org 137) recatalogó sus
tallas a numeración europea/colombiana (39, 39.5, 40 … 44); ya **no tiene ningún valor en «US»**.
Las que siguen con números cortos (orgs 139, 132, 114) son ambiguas: un «8» puede ser US 8 (≈ CO 40)
o una talla de ropa. La guía de conversión no puede distinguirlo sola.

---

## 7. Pendientes, por prioridad

### 7.1 Escalado a un humano (Fase 4) — **el más urgente**

No existe. Hay un caso real documentado: una clienta con un pedido confirmado y pagado sin entregar
pidió «asesor humano» tres veces y el bot solo supo remitirla a la web. En los últimos 14 días,
4 conversaciones pidieron un humano. Hace falta: detección de la intención, marcar la conversación,
silenciar al bot y avisar al agente (la bandeja ya existe).

### 7.2 Ranking cuando la palabra es de categoría

Con «calzado» los ~1.137 zapatos empatan a 2,5 puntos y salen los 6 primeros por `id` (pueden ser de
mujer y niño ante una pregunta de hombre). Falta desempatar por la talla pedida, por género, por
novedad o por ventas. Las preguntas concretas («tenis diesel hombre talla 40») ya salen bien.

### 7.3 `chat-widget`: sin validación de `Origin` ni límite por IP

Endpoint público (`verify_jwt:false`) cuya `public_key` va embebida en el JavaScript del sitio del
cliente. **No comparte el fallo de cruce de tenants** (deriva la organización de
`channels.public_key` y solo inserta `role='customer'`), pero cualquiera puede enviarle mensajes en
bucle y cada uno gasta créditos. El tope por sesión/hora mitiga, no cierra: el `sessionId` es
rotatorio. Falta validar `Origin` contra los dominios de la organización y limitar por IP.

### 7.4 Sinónimos genéricos

`sinonimos_base` / `org_sinonimos` están poco poblados y `consultas_sin_resultado` acumulaba 1.731
sugerencias para una sola organización. Es la fuente natural para proponerle sinónimos al comerciante
desde la UI.

### 7.5 Decisiones de producto abiertas

- **Nivel de detalle de los pedidos por correo.** Hoy, con solo el correo se muestra número,
  importe, estado, entrega y fecha. El QA propuso un modo enmascarado (estado y fecha con el correo;
  detalle completo solo con el número `WO-…`, que funciona como secreto compartido). Se implementa
  con un flag en `formatearPedidosWeb`, sin tocar consultas. Decisión del dueño, no técnica.
- **Tabla de tallas por organización.** Hoy cada tienda puede sobreescribir la guía en «Reglas del
  sistema». No hay UI dedicada ni validación.

### 7.6 Higiene

- Renombrar las migraciones del buscador a las versiones que asignó la BD (cumplimiento de
  `docs/POLITICA-MIGRACIONES.md`, cosmético).
- Prueba de orquestación de `getCustomerOrders` (hoy solo se prueban sus piezas puras; la evidencia
  del conjunto es la verificación en producción).

---

## 8. Trampas que cuestan horas si no las sabes

1. **La familia gpt-5.6 (Luna/Terra) exige la Responses API.** `/v1/responses` con `instructions` +
   `input`, `reasoning:{effort:'none'}`, `store:false`. Con `chat.completions` responde 400
   («'max_tokens' is not supported»). El fallback de emergencia es `gpt-4o-mini`, **no** el mismo
   modelo: si falla Luna y reintentas con Luna en chat.completions, vuelve a fallar.
2. **`openai.responses` descarta los mensajes de sistema extra.** El primero va a `instructions` y
   los siguientes hay que mapearlos a rol `user`, o el contexto (con los productos) se pierde entero.
3. **Las materialized views no tienen RLS.** `org_vocabulario` quedó legible por `anon` hasta que se
   revocó explícitamente. Supabase concede privilegios por defecto a `anon` en objetos nuevos: al
   crear una función o vista, **revoca**.
4. **Desplegar exige Docker Desktop** y se cae a menudo:
   `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`.
5. **Nunca edites `index.ts` con scripts de reemplazo sobre `\n` escapados.** Un intento dejó un
   bloque de reglas duplicado y otro produjo «Unterminated string constant» en el despliegue. Usa
   Edit con cadenas exactas, o Python leyendo y escribiendo el archivo con `newline=''`.
6. **Fechas:** `toISOString().split('T')[0]` y `.split('T')[0]` sobre un valor de la BD están
   prohibidos. En el bot se usa `fechaEnZona(valor, organizations.timezone)`.
7. **PROGRESS.md se anexa, nunca se reescribe**, y jamás desde una cadena entre comillas dobles de
   PowerShell (el backtick se come el carácter siguiente; ya corrompió el archivo una vez).
8. **El repositorio es público:** ni un nombre de organización cliente en código, comentarios, `comment
   on`, docs o fixtures. Ids («org 137») o descripciones («una tienda de calzado»).

---

## 9. Cómo verificar sin molestar a los clientes

```bash
npx jest src/__tests__/services/pedidosClienteIA.test.ts src/__tests__/services/variantesCatalogoIA.test.ts src/__tests__/services/intencionConsultaIA.test.ts src/__tests__/services/politicaRespuestaIA.test.ts src/__tests__/guardrails.test.ts
```

Las RPC se prueban directas con el MCP de Supabase, sin gastar créditos ni aparecer en la bandeja:

```sql
select * from palabras_de_catalogo(137, array['zapatillas','diesel']);
select * from buscar_productos(137, array['diesel'], 6);
select * from variantes_de_productos(137, array[46984::bigint], 40);
```

Qué recibió el modelo en una respuesta real (`context_used` dice si hubo productos y pedidos):

```sql
select m.created_at, m.metadata->'context_used' as ctx, left(m.content, 200)
from messages m
where m.organization_id = 137 and m.role = 'ai'
order by m.created_at desc limit 10;
```

Salud del motor (fallos de generación):

```sql
select status, error_code, count(*) from ai_jobs
where created_at > now() - interval '24 hours' group by 1, 2;
```

Desplegar (requiere Docker):

```bash
npx supabase functions deploy ai-auto-response --project-ref jgmgphmzusbluqhuqihj
```

---

## 10. Historial por rondas

| Ronda | Fecha | Qué resolvió |
|---|---|---|
| Fase 0 | 09-09 | Secreto interno (401/403), idempotencia, `ai_jobs` de los fallos, cobro correcto |
| Ronda 1 | 09-10 | Buscador multivertical (normalización, MV de vocabulario, agrupación de variantes), protección del widget, coste |
| Ronda 2 | 09-10 | Prompt por vertical, caché de prefijo, topes dimensionados con datos reales |
| Ronda 3 | 09-14 | Consulta de pedidos (0/88 → funciona); QA 7/10 → 9/10 tras escapar LIKE y limitar el sondeo |
| Ronda 4 | 09-15 | Rendimiento del buscador (19 s → 0,4 s), tallas y variantes reales, medidas de la descripción, seguimiento de variante |

Detalle y evidencia en `PROGRESS.md` (líneas 1340, 1506, 1992, 2391) y en los addenda 4 y 5 del
ADR-001.
