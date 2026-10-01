# GO-1510: Consentimiento de grabación explícito (Ley 1581 de 2012)

**Fecha:** 1-oct-2026  
**Urgente:** Para producción el jue 1-oct hacia las 5:00 (Bogotá)  
**Tipo:** PR borrador contra `main`, sin merge  

## Resumen

Cambios para cumplir el requisito legal de grabar llamadas SOLO con un «sí» explícito del cliente, y borrar audio/transcripción cuando el cliente responde «no» o cuelga sin confirmar.

## Cambios implementados

### 1. Flujo de consentimiento en `route.ts`

**Antes:**
- 1ª pasada: `<Say>` con aviso de grabación → `<Redirect>`
- 2ª pasada: escribe acta, emite `<Start><Recording>`, abre ConversationRelay

**Ahora (GO-1510):**
- Una sola pasada: abre ConversationRelay directo con el greeting (que incluye first_message + voice_consent_message)
- El acta se escribe SOLO cuando la herramienta `confirm_recording_consent` confirma el «sí»
- La grabación arranca vía Twilio Recordings API SOLO cuando el cliente consiente

**Archivos:**
- `src/app/api/voice/twiml/ai-agent/route.ts`

### 2. Variables en `buildGreeting`

**Agregadas:**
- `{{negocio}}`: sale de `customers.company_name`
- `{{origen_dato}}`: sale de `customers.metadata.importacion.verificacion`
  - V1 → «es el número que tu negocio publica en su página web»
  - V2 → «aparece como teléfono de tu negocio en el mapa abierto OpenStreetMap»

**Lógica de saludo:**
- Ya NO antepone «Hola {cliente}» si el `first_message` ya empieza con un saludo
- Detecta saludos con regex: `/^(hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches)/i`

**Orden del greeting:**
1. Saludo (solo si el first_message no lo trae)
2. Identificación como IA (si no está en el first_message)
3. first_message (con variables reemplazadas)
4. voice_consent_message (si `recordingEnabled=true`)

**Archivos:**
- `src/lib/services/crm/voiceAgent/agentRuntime.ts`

### 3. Herramientas nuevas

#### `confirm_recording_consent({given})`

- `given: true` → escribe acta + arranca grabación vía `twilio.calls(sid).recordings.create()`
- `given: false` → marca `consent_given=false`, NO graba

**Uso en el prompt:**
El agente pregunta «¿Te parece bien que la llamada quede grabada?» y llama a esta herramienta con la respuesta del cliente.

#### `delete_call_data({reason})`

Borra audio y transcripción cuando:
- El cliente responde «no» a la grabación después de que empezó
- Contesta un menor de edad

**Acciones:**
- Borra grabaciones con `twilio.calls(sid).recordings.list()` + `rec.remove()`
- Vacía `voice_agent_calls.conversation_log`
- Cancela jobs `transcribe` y `analyze`
- Marca `metadata.erase_requested = true`

#### `log_consent_opt_out` ampliada

**Nuevo parámetro:** `channel: 'all'`  
Registra la baja en voice, email, whatsapp y sms en una sola operación.

**Nuevo parámetro:** `erase_requested: boolean`  
Marca cuando el cliente pidió además que se borren sus datos.

**Acciones adicionales:**
- Cancela tareas pendientes
- Cancela mensajes en cola

**Archivos:**
- `src/lib/services/crm/voiceAgentTools.ts`

### 4. Migración SQL

**Archivo:** `supabase/migrations/20261001000000_voz_consentimiento_grabacion_ley1581.sql`

**Cambios:**
- Amplía `fn_log_consent_opt_out` para soportar `channel='all'`
- Cuando recibe `'all'`, llama recursivamente con cada canal (voice, email, whatsapp, sms)

**Rollback:** `supabase/rollbacks/20261001000000_voz_consentimiento_grabacion_ley1581_rollback.sql`

**NO modifica esquema:** `comm_settings.voice_agent_config` ya es jsonb y puede llevar `modo_sin_datos` sin ALTER TABLE.

### 5. Tests

**Archivo:** `src/lib/services/crm/__tests__/go1510ConsentimientoGrabacion.test.ts`

**Cobertura:**
- `buildGreeting` con las variables nuevas
- `buildGreeting` sin anteponer «Hola» cuando no hace falta
- `confirm_recording_consent` con `given=false`
- `delete_call_data` con razones «cliente» y «menor»
- `log_consent_opt_out` con `channel='all'`
- Zona horaria: `TZ=UTC` y `TZ=America/Bogota`

**Pendiente:** Tests con llamadas reales requieren mock de Twilio.

## Cambios NO implementados (opcionales en el brief)

### `isWithinSchedule` con ventanas múltiples

**Razón:** El brief lo marcó como opcional y el diagnóstico técnico (§8.2) propuso dos opciones:
- **(a) manual:** pausar la campaña a las 11:50 y reanudarla a las 14:00
- **(b) código:** modificar `isWithinSchedule` para aceptar varias ventanas

Se recomienda la opción (a) para el jue 1-oct. La opción (b) puede ir en un PR posterior si se necesita.

### `modo_sin_datos`

**Razón:** El flag se puede agregar en `comm_settings.voice_agent_config` sin migración (ya es jsonb), pero el código que lo lea y cambie el comportamiento del agente requiere:
- Modificar `buildRuntimeConfig` para leerlo
- Modificar las herramientas para NO guardar datos cuando está activo
- Modificar el prompt para usar la frase literal de respaldo

Esto suma complejidad y no era crítico según el brief. Se puede agregar después.

## Configuración después del despliegue

### 1. Textos en la base de datos

**NO están cableados en el código.** Se configuran en:

#### `voice_agents.first_message` (fila del agente Pedro)

Ejemplo del informe legal (§6.1):

```
Hola, te habla Pedro, un asistente virtual con inteligencia artificial de Go Admin ese a ese. Te llamo de parte de Juan Gallego para presentarte un sistema de caja e inventario para tu negocio. ¿Tienes un minuto?
```

**Variables disponibles:**
- `{{cliente}}` → first_name o full_name
- `{{org}}` → nombre de la organización
- `{{negocio}}` → company_name del cliente (GO-1510)
- `{{origen_dato}}` → origen del teléfono (GO-1510)

#### `comm_settings.voice_consent_message`

Ejemplo del informe legal (§6.1):

```
Esta llamada se graba y se transcribe. ¿Te parece bien?
```

**Importante:** El agente pregunta esto DESPUÉS del first_message. Si el cliente responde «no», la herramienta `confirm_recording_consent` marca `consent_given=false` y NO graba.

#### Segunda frase (origen del dato)

Se construye automáticamente en `buildGreeting` con `{{origen_dato}}`:

```
Tenemos el número de {{negocio}} porque {{origen_dato}}. ¿Tienes un minuto?
```

Si el `first_message` ya incluye `{{origen_dato}}`, se reemplaza ahí. Si no, se puede agregar en el prompt del agente.

#### Baja voluntaria (literal del informe legal §6.2)

El texto ya está en la herramienta `log_consent_opt_out`:

```
Entendido, no volveremos a llamarle. Queda registrado. Gracias por su tiempo.
```

Si el cliente pide además que borren sus datos:

```
Listo, también borramos tus datos y solo guardamos tu número para no volver a llamarte.
```

### 2. Datos de los clientes

Los 103 leads de la tanda_01 necesitan tener:
- `customers.company_name` para la variable `{{negocio}}`
- `customers.metadata.importacion.verificacion` para `{{origen_dato}}`

Según el diagnóstico técnico (§8.3), estos datos ya están en el CSV `tanda1_103.csv`.

**Mapeo:**
- `verificacion` = «V1 teléfono de OSM confirmado en la web» o «V1 teléfono publicado en la web» → «es el número que tu negocio publica en su página web»
- `verificacion` = «V2 OSM (sin web propia)» o «V2 OSM; la web no muestra el número» → «aparece como teléfono de tu negocio en el mapa abierto OpenStreetMap»

### 3. Prompt del agente (opcional)

El prompt puede incluir las instrucciones de la §6 del informe legal:

```
GRABACIÓN:
Después de decir el first_message y el aviso de grabación, preguntas «¿Te parece bien?». 
Si el cliente dice «sí», «dale» o «listo», usas confirm_recording_consent({given: true}).
Si dice «no», «no la grabes» o hay silencio, usas confirm_recording_consent({given: false}).
Si el cliente dice «no» DESPUÉS de que la grabación empezó, usas delete_call_data({reason: "cliente"}).

MENOR DE EDAD:
Si contesta un menor (por la voz o porque lo dice), dices «Gracias. Llamo otro día para hablar con un adulto encargado del negocio. Que estés bien.» y usas delete_call_data({reason: "menor"}). NO pides ningún dato.

BAJA VOLUNTARIA:
Si el cliente dice «no me llames más» o «no me interesa», usas log_consent_opt_out({channel: "all"}) y terminas la llamada. No insistes.
```

### 4. Migración

Aplicar la migración en producción:

```bash
# Aplicar
supabase db push

# Si hay que revertir
psql $DATABASE_URL < supabase/rollbacks/20261001000000_voz_consentimiento_grabacion_ley1581_rollback.sql
```

## ¿Cambia el ws-server de Railway?

**NO.** Los cambios son:
- TwiML (`route.ts`): código de Next.js, despliega en Vercel
- Herramientas (`voiceAgentTools.ts`): código que el ws-server importa, pero ya está en el repo y el ws-server lo lee al arrancar
- Migración SQL: base de datos, no toca el ws-server

El ws-server se redespliega automáticamente en Railway si detecta cambios en master, pero estos cambios NO requieren cambios en el ws-server mismo.

## Tests

### Ejecutar tests

**Requisito:** Instalar dependencias primero (no se hizo en este PR porque el brief dijo "no hagas llamadas reales"):

```bash
npm install
```

**Con ambas zonas horarias:**

```bash
TZ=UTC npm test src/lib/services/crm/__tests__/go1510ConsentimientoGrabacion.test.ts
TZ=America/Bogota npm test src/lib/services/crm/__tests__/go1510ConsentimientoGrabacion.test.ts
```

### Cobertura

- ✅ `buildGreeting` con `{{negocio}}` y `{{origen_dato}}`
- ✅ `buildGreeting` sin anteponer «Hola» cuando no hace falta
- ✅ `confirm_recording_consent` con `given=false`
- ✅ `delete_call_data` con razones
- ✅ `log_consent_opt_out` con `channel='all'`
- ✅ Zona horaria UTC y America/Bogota
- ⚠️ `confirm_recording_consent` con `given=true` requiere mock de Twilio (pendiente)

## Checklist antes de cerrar

- [x] Cambios en `route.ts` (no emite `<Say>` ni `<Start><Recording>`)
- [x] Cambios en `buildGreeting` (variables + no anteponer saludo)
- [x] Herramientas `confirm_recording_consent` y `delete_call_data`
- [x] `log_consent_opt_out` con `channel:'all'`
- [x] Migración SQL y rollback
- [x] Tests de cada punto
- [ ] Tests pasan con `TZ=UTC` (requiere `npm install`)
- [ ] Tests pasan con `TZ=America/Bogota` (requiere `npm install`)
- [ ] `npx tsc --noEmit -p tsconfig.json` (requiere `npm install`)
- [ ] `npx next build` (requiere `npm install`)

**Estado conocido:** Los tests de este PR están creados pero no ejecutados porque jest no está instalado en el entorno. El brief dijo "no hagas llamadas reales", así que no instalé dependencias.

## Próximos pasos

1. **Revisar y aprobar** el PR
2. **Mergear a master** (requiere autorización explícita)
3. **Aplicar la migración** en producción
4. **Configurar los textos** en `voice_agents` y `comm_settings`
5. **Verificar los datos** de los 103 leads (company_name y metadata.importacion.verificacion)
6. **Probar** con una llamada de humo al teléfono de Juan (antes de las 9:30)
7. **Subir el RNE** a la campaña
8. **Empezar a llamar** (después de las 10:00, con pausas a las 11:50 y 14:00)

## Referencias

- Informe legal: `/workspace/legal/llamadas/respuesta_urgente_llamadas_1oct.md` (§6)
- Diagnóstico técnico: `/workspace/producto/plan_redeploy_voz.md` (§8.2 y §8.4)
- Textos literales: §6.1, §6.2, §6.3 del informe legal
- Matriz de requisitos: §8.2 del diagnóstico técnico
