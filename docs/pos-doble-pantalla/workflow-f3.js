export const meta = {
  name: 'pos-doble-pantalla-f3',
  description: 'Fase 3 del POS de doble pantalla: pantalla en otro dispositivo (Supabase Broadcast, emparejamiento, rutas de servidor)',
  phases: [
    { title: 'Parte A', detail: 'rutas de servidor y tokens' },
    { title: 'Partes B C', detail: 'transporte remoto y emparejamiento en pantalla y caja' },
    { title: 'Integración F3', detail: 'extremo a extremo y QA final' },
  ],
}

const PLAN = args.plan
const DATE = args.date
const UMBRAL = 9.5
const MAX_RONDAS = 4 // la ronda 4 solo existe como ronda de cierre con lista congelada del orquestador (CIERRE[parte])

const REGLAS = `
Reglas del repositorio (además del CLAUDE.md que ya tienes):
- Español de Colombia; nunca el nombre de una organización cliente.
- Sin .sql: el esquema ya existe. public.pos_terminals (identidad: id, organization_id, branch_id, name, code, is_active, display_last_seen_at) es legible por authenticated con RLS. Los secretos van en public.pos_terminal_secrets (terminal_id PK → pos_terminals, organization_id, pairing_code de 6 dígitos con CHECK, pairing_code_expires_at, display_token_hash) que NO tiene permisos para anon ni authenticated: solo se lee/escribe desde rutas de servidor con getServiceClient() tras validar la organización por getServerOrgContext() (o, en /pair y en el heartbeat de la pantalla, tras validar el código/token). Si falta esquema, dilo en pendientes.
- Todo route handler con sesión empieza por getServerOrgContext() (o withOrg): la organización sale de la sesión, nunca del body. Las rutas de la pantalla remota NO tienen sesión: autentican por token y resuelven la organización DESDE LA TERMINAL (fila de pos_terminals), nunca desde la petición. Usan getServiceClient() solo tras validar el token, y fallan cerrado (401/403) con token ausente, inválido o revocado.
- Secretos: nada de tokens en claro en la base (solo sha256). El token en claro se devuelve UNA vez al canjear el código. Rate limit del canje: 10 intentos / 15 min por IP (reutiliza la infraestructura de rate limit del repo si existe: busca rate_limit / rateLimit en src/lib).
- Estas rutas se añaden a la lista de exclusión del middleware (src/middleware.ts, skipPatterns y matcher) igual que /u/ y api/auth: fail-closed por token, no por sesión.
- Realtime: SOLO Broadcast (no Postgres Changes, no escrituras en BD por mensaje). Un canal por terminal: pos-display:<terminalId>.
- eslint limpio en lo tocado; tsc filtrado; jest de pos-display en verde. No edites PROGRESS.md ni ${PLAN}. No commits ni push.
- PROHIBIDO git stash / git checkout -- . / git reset --hard: el árbol tiene cambios sin commitear de otras sesiones. Para ver el estado limpio usa git show HEAD:<ruta>.
- Archivos compartidos con otras sesiones (src/middleware.ts, posService.ts, CheckoutDialog.tsx, messages/*.json, guardrails.test.ts): solo reemplazos puntuales (Edit con old_string corto), nunca reescrituras ni reformateos; relee justo antes de editar.
- ALCANCE CONGELADO: no amplíes el alcance con sincronías, cierres automáticos ni «mejoras» no pedidas; si falta algo, va a pendientes. Lección de F0-F2: ampliar el alcance es lo que impidió converger.
- Migraciones: SOLO por el MCP de Supabase y SOLO si el QA/tester la exige; deja el .sql en supabase/migrations/ y el rollback en supabase/rollbacks/ y dilo en decisiones. El esquema de pos_terminals/pos_terminal_secrets ya existe.
`

const CONTEXTO = `
Contexto verificado:
- Plan: ${PLAN} §3.2 (transporte), §3.3 (identidad y emparejamiento), §7 (rutas), §8 (protocolo real), §11 (seguridad), §12 Fase 3.
- Fases 0-2 aprobadas: src/lib/pos/display/ (protocol, projection, transport con interfaz DisplayTransport/DisplayReceiver, terminal, emitter, settings), src/lib/services/posTerminalsService.ts, ruta src/app/pos-display/, tarjeta en src/components/pos/configuracion/. Lee transport.ts: la implementación remota debe cumplir EXACTAMENTE DisplayTransport y DisplayReceiver, y el emitter/pantalla deben poder elegir transporte sin cambiar su lógica.
- Cliente Supabase en navegador: @/lib/supabase/config. En servidor: getServerUserClient() (sesión) y getServiceClient() (service role, solo justificado).
- Precedente de token rotatorio por dispositivo: gym_access_devices (current_qr_token, qr_token_expires_at) y src/app/qr-display/.
- Supabase Realtime Broadcast en supabase-js: channel(name).send({type:'broadcast', event, payload}) y .on('broadcast', {event}, handler). Para que la pantalla remota se una sin sesión de usuario, /bootstrap debe emitir un JWT de Realtime de corta vida (firmado con el JWT secret del proyecto desde el servidor) o, si el proyecto tiene Realtime con RLS para canales privados, la política correspondiente. Investiga cuál aplica en este proyecto (busca realtime.channel / broadcast en supabase/migrations y en src/lib) y documenta la decisión.
`

const PARTES = {
  A: { nombre: 'A · Rutas de servidor y tokens', alcance: `
1. POST /api/pos/terminals/[id]/pairing-code (sesión): genera código de 6 dígitos, 5 min, invalida el anterior; solo admin/manager de la organización de la terminal.
2. POST /api/pos/display/pair (sin sesión, rate-limited): canjea código → token largo aleatorio (32 bytes) devuelto una vez; guarda sha256 en pos_terminal_secrets.display_token_hash; borra el código (pairing_code = null). Respuestas 400/404/429 sin filtrar existencia.
3. GET /api/pos/display/bootstrap (token): marca (logo, colores, nombre), settings pos_customer_display, locale, moneda, terminalId, y el JWT/credencial de Realtime de corta vida para unirse al canal de ESA terminal. Sin datos de ventas.
4. POST /api/pos/display/heartbeat (token): display_last_seen_at. POST /api/pos/display/revoke (sesión, admin): borra el hash.
5. Helper src/lib/pos/display/server/displayAuth.ts: validar token (sha256 constante en tiempo), resolver terminal + organización, y devolver 401 uniforme.
6. Middleware: excluir /api/pos/display/* en skipPatterns y matcher.
7. Tests: displayAuth (token válido/inválido/revocado), generación de código (6 dígitos, caducidad), rate limit, y las rutas con mocks del cliente de servicio.` },
  B: { nombre: 'B · Transporte remoto y pantalla emparejable', alcance: `
1. src/lib/pos/display/supabaseBroadcastTransport.ts: SupabaseBroadcastTransport (lado caja) y SupabaseBroadcastReceiver (lado pantalla) que cumplen DisplayTransport / DisplayReceiver: mismo sobre (v, seq, terminalId, instanceId, toInstanceId), mismo descarte por terminal/seq/instancia, heartbeat, close con bye. Reutiliza la lógica de sobre/adopción de transport.ts extrayéndola a un módulo común si hace falta (cambio ADITIVO, tests existentes en verde).
2. Pantalla: /pos-display?pair=<código> canjea el código, guarda el token en localStorage (clave documentada), llama a /bootstrap, se une al canal y funciona igual que en local. Sin código y sin token: pantalla de emparejamiento con campo para el código (teclado en pantalla si táctil). Heartbeat a /heartbeat cada 60 s. Si /bootstrap responde 401 (revocada): vuelve a la pantalla de emparejamiento y borra el token.
3. Selección de transporte en la pantalla: si hay token remoto → Supabase; si no → BroadcastChannel (comportamiento actual). Documenta.
4. Tests: transporte remoto con un doble del canal de supabase (send/on), descarte por instancia/seq, y flujo de emparejamiento con fetch mockeado.` },
  C: { nombre: 'C · Lado caja: emparejar y emitir en remoto', alcance: `
1. En la tarjeta "Pantalla del cliente" y en el indicador del POS: "Emparejar otro dispositivo" → muestra el código de 6 dígitos grande con cuenta atrás de 5 min y el paso a paso; "Revocar" para desemparejar.
2. El emitter publica por AMBOS transportes cuando la terminal tiene una pantalla remota emparejada (o por ambos siempre, si es más simple y no añade escrituras en BD): BroadcastChannel local + Supabase Broadcast por el canal de la terminal. Sin duplicar seq: un solo contador para los dos.
3. El indicador del POS muestra si la pantalla conectada es local o remota (los need_snapshot/heartbeats llegan por uno u otro transporte).
4. Tests: emitter con dos transportes (un solo seq, ambos reciben), indicador con origen del heartbeat.` },
}

const BUILD_SCHEMA = { type: 'object', properties: { resumen: { type: 'string' }, archivos: { type: 'array', items: { type: 'string' } }, feedbackAtendido: { type: 'array', items: { type: 'string' } }, decisiones: { type: 'array', items: { type: 'string' } }, pendientes: { type: 'array', items: { type: 'string' } } }, required: ['resumen', 'archivos', 'feedbackAtendido', 'decisiones', 'pendientes'] }
const TEST_SCHEMA = { type: 'object', properties: { ejecutados: { type: 'number' }, pasaron: { type: 'number' }, fallaron: { type: 'number' }, fallos: { type: 'array', items: { type: 'object', properties: { severidad: { type: 'string', enum: ['crítico', 'alto', 'medio', 'bajo'] }, descripcion: { type: 'string' }, reproducir: { type: 'string' }, esperado: { type: 'string' }, obtenido: { type: 'string' } }, required: ['severidad', 'descripcion', 'reproducir', 'esperado', 'obtenido'] } }, noProbado: { type: 'array', items: { type: 'string' } }, robustez: { type: 'number' }, evidencia: { type: 'string' }, testsAgregados: { type: 'array', items: { type: 'string' } } }, required: ['ejecutados', 'pasaron', 'fallaron', 'fallos', 'noProbado', 'robustez', 'evidencia', 'testsAgregados'] }
const QA_SCHEMA = { type: 'object', properties: { calificacion: { type: 'number' }, fortalezas: { type: 'array', items: { type: 'string' } }, problemas: { type: 'array', items: { type: 'object', properties: { severidad: { type: 'string', enum: ['crítico', 'alto', 'medio', 'bajo'] }, descripcion: { type: 'string' }, accion: { type: 'string' } }, required: ['severidad', 'descripcion', 'accion'] } }, paraElDiez: { type: 'array', items: { type: 'string' } }, veredicto: { type: 'string', enum: ['aprobado', 'requiere-nueva-ronda'] } }, required: ['calificacion', 'fortalezas', 'problemas', 'paraElDiez', 'veredicto'] }


const CIERRE = {
  B: `RONDA DE CIERRE (ronda 4) de la Parte B. Rondas 1-3: 8,2 -> 8,4 -> 8,0. El orquestador CONGELA la lista; aplicala tal cual, sin anadir nada. PROHIBIDO git stash.
B1. Tope de tiempo por peticion en callDisplayApi (remoteDisplay.ts): AbortController ~10 s (o Promise.race si el FetchLike inyectado no admite signal) que convierta la cuelgue en un fallo de red normal. Tests con un fetch que nunca responde.
B2. El latido no puede quedar muerto para siempre: en startRemoteHeartbeat, descartar el inFlight pasado el tope (guardar el instante de creacion y dejar salir uno nuevo). Test: heartbeat colgado -> el siguiente latido sale y renueva el JWT.
B3. resolveRedeemFailure: permitir el respaldo al emparejamiento guardado cuando la huella del codigo COINCIDE (attemptedCodeHash === stored.codeHash), sea cual sea el estado HTTP (incluido 429); mantener la exclusion solo cuando la huella es distinta. Test con 429 y huella igual.
B4. Salida de la fase bootstrapping: tras 3 intentos seguidos que NO sean 401, RemoteBootstrappingView ofrece «Emparejar con un codigo» (reutilizando la vista de emparejamiento). Test de la logica pura.
B5. Retry-After real: callDisplayApi lee la cabecera Retry-After (ampliando FetchLike con headers.get) y rellena retryAfterSeconds; si no se puede, quita el campo del tipo. Y no prometer una ventana entera cuando el cubo global no la calculo.
B6. Un fallo que NO consume el codigo (kind 'network' o 5xx) conserva el codigo como prefill; 400/404/429 lo limpian. Quitar el campo muerto RemoteIntent.fallback (o documentarlo como informativo).
B7. Compuerta: jest de pos-display + guardrails en verde, eslint de lo tocado limpio, tsc filtrado 0.`,
  C: `RONDA DE CIERRE (ronda 4) de la Parte C. Rondas 1-3: 5,0 -> 8,3 -> 7,5. El orquestador CONGELA la lista; aplicala tal cual, sin anadir nada. PROHIBIDO git stash.
C1. SEGURIDAD (decision del orquestador, no la rediscutas): la suplantacion ENTRE ORGANIZACIONES y entre sucursales ya la cierra la base: las politicas pos_display_caja_recibe/envia sobre realtime.messages (verificadas hoy por MCP) exigen que la terminal del topic pertenezca a la organizacion del miembro y que ese miembro sea admin/manager/super o tenga la sucursal de la terminal. Lo que queda es que un miembro de ESA sucursal apunte su localStorage a otra caja de la MISMA sucursal. Para el cierre: (a) la caja solo emite en remoto si la terminal esta vinculada Y existe leyendola del SERVIDOR con el cliente de sesion (RLS), nunca solo de localStorage; si la lectura falla o no devuelve fila, no se abre el canal remoto (fail-closed) y el indicador lo dice; (b) borra la guarda circular isRegisteredActiveTerminal que se apoya en getLinkedTerminal(); (c) documenta el limite residual en la cabecera del modulo y en pendientes. NO inventes tablas de reclamos ni claims nuevos.
C2. cajaChannel.ts: esperarSalidaAnterior borra su entrada de salidasEnVuelo tambien al vencer el timeout (misma comparacion de identidad), no solo en el finally.
C3. upMessageListenerGate: un display_bye solo duerme la compuerta si viene de la instancia que la abrio, y aplica el MISMO descarte por toInstanceId que transport.ts (o corrige la cabecera para que no prometa lo que no hace). Tests de los dos abusos que describio el QA.
C4. Compuerta: jest de pos-display + guardrails en verde, eslint de lo tocado limpio, tsc filtrado 0. next build y la prueba viva contra la base los hace el orquestador al cerrar la fase (no los penalices).`,
}

function fb(test, qa) {
  const a = (qa?.problemas || []).map((p, i) => `${i + 1}. [qa · ${p.severidad}] ${p.descripcion}\n   Acción: ${p.accion}`)
  const b = (test?.fallos || []).map((f, i) => `${i + 1}. [tester · ${f.severidad}] ${f.descripcion}\n   Reproducir: ${f.reproducir}\n   Esperado: ${f.esperado} | Obtenido: ${f.obtenido}`)
  return [...a, ...b].join('\n')
}

async function ciclo(parte, fase) {
  const p = PARTES[parte]
  const rondas = []
  let feedback = null
  for (let ronda = 1; ronda <= MAX_RONDAS; ronda++) {
    log(`F3 ${p.nombre} — ronda ${ronda}`)
    const build = await agent(`Eres el BUILDER de la Fase 3 del POS de doble pantalla, parte ${p.nombre} (ronda ${ronda}).
${CONTEXTO}${REGLAS}
Alcance exacto:
${p.alcance}
${feedback ? `RONDA DE CORRECCIÓN. Lista obligatoria por severidad:\n${feedback}` : ''}
${parte !== 'A' ? 'La Parte A (rutas y displayAuth) ya está aprobada: úsala tal cual; cambios solo aditivos.' : ''}
Al terminar: eslint limpio, jest de pos-display en verde. No declares la parte lista.`, { label: `builder:F3${parte}:r${ronda}`, phase: fase, schema: BUILD_SCHEMA })
    if (!build) break
    const test = await agent(`Eres el TESTER de la Fase 3, parte ${p.nombre} (ronda ${ronda}). Esta fase es de SEGURIDAD: intenta romperla. Token inválido, revocado, de otra terminal; código caducado o reutilizado; organization_id en el body (debe ignorarse); fuerza bruta del código (rate limit); canal de otra terminal; mensajes con instanceId ajeno; JWT de Realtime caducado. Corre jest de pos-display y guardrails, eslint, tsc filtrado. Verifica que el middleware excluye /api/pos/display/* y que ninguna ruta ni componente de navegador toca pos_terminal_secrets (grep -rn pos_terminal_secrets src/ solo debe dar rutas de servidor con service role). No arregles: reporta con pasos.
${CONTEXTO}
Alcance: ${p.alcance}
Builder dice: ${JSON.stringify(build, null, 2)}`, { label: `tester:F3${parte}:r${ronda}`, phase: fase, schema: TEST_SCHEMA })
    const qa = await agent(`Eres el QA-REVIEWER de la Fase 3, parte ${p.nombre} (ronda ${ronda}). Aplica además el rubric de seguridad: organización desde la terminal y nunca desde la petición; fail-closed; hash y no token; rate limit; sin Postgres Changes; exclusión correcta en middleware. Un fallo de seguridad es crítico y limita a 6. Verifica el código tú mismo. ${ronda === MAX_RONDAS ? 'RONDA DE CIERRE con lista congelada por el orquestador (ver el feedback del builder): califica contra ESA lista; no pidas alcance nuevo.' : ''}
${CONTEXTO}
Alcance: ${p.alcance}
Builder: ${JSON.stringify(build, null, 2)}
Tester: ${JSON.stringify(test, null, 2)}`, { label: `qa:F3${parte}:r${ronda}`, phase: fase, schema: QA_SCHEMA, effort: 'high' })
    rondas.push({ ronda, build, test, qa })
    const nota = qa?.calificacion ?? 0
    log(`F3 ${p.nombre} — ronda ${ronda}: QA ${nota}/10, tester ${test?.robustez ?? '?'}/10, ${qa?.veredicto ?? '?'}`)
    if (nota >= UMBRAL) break
    if (ronda === MAX_RONDAS - 1 && !CIERRE[parte]) break // sin lista de cierre no hay ronda 4
    feedback = ronda === MAX_RONDAS - 1 ? CIERRE[parte] + '\nHallazgos concretos de la ronda anterior (solo los compatibles con la lista):\n' + fb(test, qa) : fb(test, qa)
  }
  return { parte, rondas }
}

phase('Parte A')
const rA = await ciclo('A', 'Parte A')
const ACEPTADAS_POR_ORQUESTADOR = [] // partes aceptadas tras aplicar el orquestador la acción del QA (documentado en PROGRESS.md)
const qaA = rA.rondas[rA.rondas.length - 1]?.qa
if ((qaA?.calificacion ?? 0) < UMBRAL && qaA?.veredicto !== 'aprobado' && !ACEPTADAS_POR_ORQUESTADOR.includes('A')) return { fecha: DATE, fase: 'F3', detenidoEn: 'A', partes: [rA] }

phase('Partes B C')
const rBC = await parallel(['B', 'C'].map((p) => () => ciclo(p, 'Partes B C')))
const partes = [rA, ...rBC.filter(Boolean)]
const noOk = partes.filter((r) => { const q = r.rondas[r.rondas.length - 1]?.qa; return (q?.calificacion ?? 0) < UMBRAL && q?.veredicto !== 'aprobado' && !ACEPTADAS_POR_ORQUESTADOR.includes(r.parte) }).map((r) => r.parte)
if (noOk.length) return { fecha: DATE, fase: 'F3', detenidoEn: noOk, partes }

phase('Integración F3')
const testInt = await agent(`Eres el TESTER DE INTEGRACIÓN de la Fase 3. Con dobles de fetch y del canal de Supabase, prueba el flujo completo en jest (src/__tests__/pos-display/integracion-f3.test.ts): generar código → canjear → bootstrap → unirse al canal → recibir hello/state por el transporte remoto con el mismo seq que el local → heartbeat → revocar → 401 → pantalla de emparejamiento. Regresión: jest completo, eslint, tsc filtrado. Seguridad: repite los ataques de las partes sobre el conjunto.
${CONTEXTO}
Partes: ${JSON.stringify(partes.map((r) => ({ parte: r.parte, archivos: r.rondas[r.rondas.length - 1].build.archivos })))}`, { label: 'tester:F3:integracion', phase: 'Integración F3', schema: TEST_SCHEMA })
const qaFinal = await agent(`Eres el QA-REVIEWER FINAL de la Fase 3. Califica la fase 1-10 verificando el código. Criterio de aceptación (PLAN §12 Fase 3): una tableta se empareja con un código de 6 dígitos en < 30 s, refleja la venta con < 300 ms de retraso, y al revocarla deja de recibir en el siguiente mensaje. Seguridad ante todo. Anota qué probar con una tableta real.
${CONTEXTO}
Partes: ${JSON.stringify(partes.map((r) => ({ parte: r.parte, rondas: r.rondas.length, qa: r.rondas[r.rondas.length - 1]?.qa?.calificacion })))}
Integración: ${JSON.stringify(testInt, null, 2)}`, { label: 'qa:F3:final', phase: 'Integración F3', schema: QA_SCHEMA, effort: 'high' })
return { fecha: DATE, fase: 'F3', partes, integracion: { test: testInt, qa: qaFinal } }
