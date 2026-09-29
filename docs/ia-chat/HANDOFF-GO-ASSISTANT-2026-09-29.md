# HANDOFF — GO Assistant (asistente del header) · 2026-09-29

Relevo de la sesión «GO Assistant header implementation» para que otro agente continúe sin releer
toda la conversación. Complementa, no reemplaza: `CLAUDE.md`, `PROGRESS.md` (historial por rondas),
`docs/PROMPT-CLAUDE-CODE-ASISTENTE-AGENTE.md` (el plan), los ADR de `docs/ia-chat/` y
`docs/HANDOFF-2026-09-29.md` (reglas generales del árbol compartido).

**Qué es esto.** El asistente del header para las organizaciones clientes: un agente con tool
calling que consulta el ERP y ejecuta acciones reales con confirmación humana. No es el chat de
atención al cliente final (`ai-auto-response`): comparten cobro de créditos y resolución de
organización, nada más.

---

## 1. Estado en una línea

Fases F0–F5 del plan implementadas y verificadas contra la base real. Lo que falta es
infraestructura (voz en vivo), depende de otra sesión (el shell del panel) o es prueba en
navegador. **Hay trabajo sin commitear** (§6) y el `next build` del árbol lleva días rojo por zonas
ajenas (§7).

---

## 2. Dónde vive el código

| Pieza | Ruta |
|---|---|
| Rutas HTTP | `src/app/api/ai-assistant/**` (chat, stream, execute-action, reject-action, undo-action, suggestions, attachments, conversations, transcribe, tts, credits, settings) |
| Bucle del agente | `src/lib/ai/agent/runAgent.ts`, `toolRegistry.ts`, `openaiAdapter.ts`, `modelRouter.ts`, `systemPrompt.ts`, `conversationStore.ts`, `catalogTools.ts` |
| Herramientas | `src/lib/ai/agent/tools/{consulta,ventas,compras,cargaMasiva,facturas,documentos,moneda,navegacion,pregunta}.ts` |
| Capacidades, catálogo, deshacer | `src/lib/ai/assistant/{capabilities,actionCatalog,actionGuard,undoService,orgCurrency,credits,tts,attachments,correction,clientTypes,streamClient}.ts` |
| Ejecutor del catálogo viejo | `src/lib/services/aiActionsService.ts` |
| Traducción de clientes (compartida con el módulo) | `src/lib/services/customers/customerPayload.ts` |
| Panel | `src/components/app-layout/Header/AIAssistantPanel.tsx`, `ActionConfirmationForm.tsx`, `assistant/{Composer,ConversationHistory,QuestionCard,CustomerFormDialog,BulkPreviewTable}.tsx` |
| Tests | `src/__tests__/services/goAssistant*.test.ts`, `assistant*.test.ts`, `src/__tests__/guardrails.test.ts` (casos 11–14) |

---

## 3. Las 17 herramientas registradas

**Lectura** (`risk: low`, se ejecutan sin confirmación): `buscar_productos`, `consultar_stock`,
`buscar_proveedores`, `buscar_clientes`, `listar_sucursales`, `convertir_moneda`,
`listar_modulos_activos`, `estado_configuracion`, `explicar_configuracion`, `leer_documento`
(visión: facturas, PDF, CSV/Excel; solo lee).

**Escritura** (`risk: high`, `write_full`, bloqueadas en voz, RPC transaccional):
`registrar_venta`, `crear_ajuste_inventario`, `crear_orden_compra` (borrador),
`crear_traslado` (pendiente), `cargar_productos_masivo`, `registrar_factura_compra`,
`registrar_factura_venta`.

**Interacción**: `preguntar_opciones` — la pregunta A/B/C/Otro. No escribe nada: `runAgent`
intercepta la llamada, emite el evento SSE `question` y **pausa el turno**; la respuesta del usuario
llega como su siguiente mensaje. **Es la decisión de producto del dueño**: «prefiero que no uses
formulario y mejor haga preguntas, estilo Claude, un modal para confirmar datos con respuesta A, B,
C u Otro». No añadir formularios nuevos al chat.

---

## 4. Invariantes que no se pueden romper

1. **La organización sale de la sesión**, nunca del body: `getServerOrgContext(request)` +
   `readOrgBody` en toda ruta de `ai-assistant/`. Lo vigila `guardrails.test.ts` caso 11.
2. **`preview()` jamás escribe**; `execute()` jamás corre sin una fila `ai_agent_actions` confirmada
   (salvo `risk: low`).
3. **Toda escritura multi-tabla va en una RPC** `SECURITY INVOKER` (la RLS del usuario sigue
   aplicando), con `revoke ... from public` y `grant` a `authenticated, service_role`. Las FK de este
   esquema no llevan organización: cada referencia se comprueba dentro de la función.
4. **Un `route.ts` del App Router solo exporta handlers y `runtime`/`dynamic`/`config`.** Un export
   de más rompe `.next/types` y tumba el despliegue (Vercel ya no ignora errores de tipos). Pasó con
   `LOW_CREDITS`; lo vigila ahora `goAssistantF5.test.ts`, que recorre **todas** las rutas.
   **Corolario de método**: no filtrar la salida de `tsc` por tus rutas — esos errores salen en
   `.next/types`.
5. **Deshacer compensa, no borra**: cancelar (OC/traslado), anular con asientos espejo (facturas),
   ajuste contrario (carga masiva), borrar solo lo que no tiene movimientos.
6. **El precio y el costo los pone el catálogo**, no el modelo.
7. **Créditos**: `checkAICredits` antes de llamar al proveedor, `chargeAiCredits` después de que la
   respuesta llegue. Nunca se cobra una generación fallida.

---

## 5. Base de datos

RPC aplicadas (todas por MCP, con `.sql` + rollback en `supabase/{migrations,rollbacks}/`):

`assistant_create_product`, `assistant_set_product_price`, `assistant_register_sale`,
`assistant_create_adjustment`, `assistant_create_purchase_order`, `assistant_create_transfer`,
`assistant_bulk_load_products`, `assistant_register_purchase_invoice`,
`assistant_void_purchase_invoice`, `assistant_register_sales_invoice`,
`assistant_void_sales_invoice`, `fn_expire_ai_agent_actions` (pg_cron `*/10`),
`fn_seed_ai_assistant_settings` (toda organización nueva nace con `write_full`).

Tablas: `ai_agent_actions`, `ai_assistant_settings`, `ai_assistant_conversations`,
`ai_assistant_messages`, `ai_attachments` (+ bucket privado `ai-attachments`).

**Migración preparada y NO aplicada**: `20260919020000_go_assistant_actions_server_only.sql` —
revoca a `anon`/`authenticated` la escritura en `ai_agent_actions`. Aplicarla **solo** cuando todos
los escritores server-store estén desplegados en producción; guía en
`docs/ia-chat/GO-ASSISTANT-ACTIONS-SERVER-ONLY.md`.

**Trampas de esquema ya pagadas** (no volver a tropezar): `purchase_order_items.subtotal` es
GENERATED; `customers.full_name/doc_type/doc_number` son GENERATED (se escriben `first_name`,
`last_name`, `identification_*`); `suppliers.dv` es `character(1)`; `journal_entries` tiene
UNIQUE(source, source_id) — el asiento espejo usa `source = '<origen>_void'`; el módulo de
inventario se llama `inventory`, no `inventario`.

---

## 6. Lo que está SIN COMMITEAR (2026-09-29)

Todo esto es la revisión de escritorio del panel (diseño Figma §5 de
`docs/design/GO-ASISTENTE-ESCRITORIO.md`), verificada pero pendiente de commit:

```
 M PROGRESS.md                                            (solo anexos)
 M src/app/api/ai-assistant/attachments/route.ts          (quitar export de tipo ilegal)
 M src/app/api/ai-assistant/suggestions/route.ts          (acepta currentPath validado)
 M src/components/app-layout/Header/AIAssistantPanel.tsx  (créditos, outcome, copiar, sin avatares)
 M src/components/app-layout/Header/ActionConfirmationForm.tsx (estados de la tarjeta)
 M src/components/app-layout/Header/assistant/Composer.tsx (pie con el saldo)
 M src/lib/ai/assistant/clientTypes.ts                    (ActionOutcome, PendingQuestion)
 M src/lib/services/aiAssistantService.ts                 (suggestionsForPath)
?? src/app/api/ai-assistant/credits/route.ts              (GET saldo)
?? src/lib/ai/assistant/credits.ts                        (LOW_CREDITS=50, creditLevel)
 M src/components/crm/pipeline/drawer/StageSelect.tsx     (AJENO: ver abajo)
```

Qué cambia, en corto: saldo de créditos visible al pie (ámbar <50, rojo en 0 con enlace a
`/app/plan`); el desenlace de una acción se queda **en la tarjeta** (completada con «Ver» y
«Deshacer», o error con «Corregir y reintentar») en vez de un mensaje suelto con ✅/❌; mensajes sin
avatares ni degradado morado, asistente a todo el ancho, botón «Copiar»; sugerencias según la
pantalla (`suggestionsForPath`); la papelera pasa a «Nueva conversación»; los pasos se pliegan al
llegar el primer token.

**`StageSelect.tsx` no es de esta zona.** Es un arreglo de 1 línea de tipo (sin lógica) que se hizo
para desbloquear `next build`: `StageChangeResult` tenía una variante con dos literales en el
discriminante (`reason: 'needs_won' | 'needs_lost'`), y por eso el `switch` de
`opportunitiesService.markAsWon` no podía descartarla en su `default` y `tsc` fallaba al leer
`.message`. Se partió en dos miembros. Está avisado a la sesión del CRM; que lo commitee ella o se
incluya donde convenga.

**Verificación hecha** sobre este estado: `tsc --noEmit` completo **sin filtrar** en 0;
`jest` de la zona (32 suites, 597 tests) en `TZ=UTC` y `TZ=America/Bogota`; `guardrails` verde.
Falta el `next build`, que no depende de esta zona (§7).

---

## 7. Por qué no se ha commiteado: el `next build` del árbol

El último build falló con `Type error: Type 'EmploymentListItem[]' is not assignable to type
'EmployeeRow[]'` — zona de HRM/empleados, ajena. Antes de eso falló dos veces más por otras zonas
(`api/domains/setup-intent` creado a mitad de build, `api/domains/purchase` con error de sintaxis) y
una vez por culpa propia (el export de `LOW_CREDITS`, ya corregido). Además el CRM dejó 5 TS2783 en
`src/__tests__/services/crmOportunidadesRonda.test.ts` (spread que pisa `data`/`error`), que no
rompen el build pero sí la compuerta común.

**Criterio**: no commitear sobre un árbol que no compila, para que el rojo no quede a nombre de
quien no lo rompió. Cuando el árbol compile: `git status -sb` debe decir `## main`, staged selectivo
por ruta (nunca `git add -A`), y **el push lo autoriza el dueño**.

---

## 8. Pendientes reales

| Qué | Estado | Depende de |
|---|---|---|
| Commit + push de §6 | listo para commitear | que el árbol compile; push, del dueño |
| Panel 400 px / ampliado 720 px, Ctrl+Cmd+J, sidebar en rail, header compacto | sin empezar | la sesión del shell debe exponer `asistenteAbierto` y el modo (`AppLayout`, `SidebarShell`, `AppHeader` son suyos) |
| Título «GO Asistente» en es/en/fr/pt | sin hacer | `messages/*.json` es compartido: avisar antes |
| Voz en vivo (`/assistant-voice` en `ws-server.ts`) | cortado a propósito (§5.5.2 del plan) | 4 variables en Railway (`WS_SESSION_SECRET`, `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `WS_SERVER_URL`) + redespliegue autorizado |
| Offline en Desktop: `/execute-action` y `/undo-action` usan `getServiceClient()` y sin `SUPABASE_SERVICE_ROLE_KEY` devuelven 500 | propuesto 503 `OFFLINE_UNAVAILABLE` | respuesta de la sesión de Desktop |
| Smoke test en navegador de todo lo nuevo | nunca hecho | sesión del dueño (hace falta iniciar sesión) |
| Carga masiva: modo ancho de la tabla (§10 del diseño) | sin empezar | — |

---

## 9. Dos hallazgos del ERP, ajenos al asistente

1. **Doble asiento en compras.** Registrar una factura de compra genera un asiento por
   `invoice_purchase` (`fn_auto_journal_purchase`) y otro por `accounts_payable`
   (`fn_auto_journal_ap`), ambos con la regla `purchase/created`. Pasa igual por el flujo del módulo.
   Revisar con el contador.
2. **La factura de venta no descuenta inventario.** Ni por el formulario del módulo ni por la
   herramienta (que lo replica a propósito). Si debe moverlo, es una decisión de negocio.
3. Corregido en el camino: `audit_ops_changes()` leía `NEW.branch_id`, que `inventory_transfers` no
   tiene, y abortaba **todo** insert de traslados desde cualquier parte del ERP
   (`20260914100000_fix_audit_ops_changes_branch_id_inexistente.sql`).

---

## 10. Decisiones de producto del dueño (no revertir sin él)

- Preguntas A/B/C/Otro en vez de formularios en el chat.
- Si hace falta un formulario, es **el del módulo**: «Formulario completo» abre `ClientForm` de
  `/app/clientes/new` prellenado, y al guardar se cierra la propuesta con `external` en
  `/execute-action`. Misma idea para cualquier otro módulo.
- Una sola traducción formulario → fila (`customerPayload.ts`): cambiar cómo se guarda un cliente se
  hace ahí y cambia en todas partes.
- Moneda: la de la organización (`organization_currencies.is_base`). Conversión con la **tasa del
  día** de openexchangerates (`currency_rates`, base USD); nunca tasa fija.
- Todas las organizaciones con el asistente en `write_full`, incluidas las nuevas.
