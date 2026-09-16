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
const MAX_RONDAS = 3

const REGLAS = `
Reglas del repositorio (además del CLAUDE.md que ya tienes):
- Español de Colombia; nunca el nombre de una organización cliente.
- Sin .sql: pos_terminals ya tiene pairing_code, pairing_code_expires_at, display_token_hash y display_last_seen_at. Si falta esquema, dilo en pendientes.
- Todo route handler con sesión empieza por getServerOrgContext() (o withOrg): la organización sale de la sesión, nunca del body. Las rutas de la pantalla remota NO tienen sesión: autentican por token y resuelven la organización DESDE LA TERMINAL (fila de pos_terminals), nunca desde la petición. Usan getServiceClient() solo tras validar el token, y fallan cerrado (401/403) con token ausente, inválido o revocado.
- Secretos: nada de tokens en claro en la base (solo sha256). El token en claro se devuelve UNA vez al canjear el código. Rate limit del canje: 10 intentos / 15 min por IP (reutiliza la infraestructura de rate limit del repo si existe: busca rate_limit / rateLimit en src/lib).
- Estas rutas se añaden a la lista de exclusión del middleware (src/middleware.ts, skipPatterns y matcher) igual que /u/ y api/auth: fail-closed por token, no por sesión.
- Realtime: SOLO Broadcast (no Postgres Changes, no escrituras en BD por mensaje). Un canal por terminal: pos-display:<terminalId>.
- eslint limpio en lo tocado; tsc filtrado; jest de pos-display en verde. No edites PROGRESS.md ni ${PLAN}. No commits ni push.
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
2. POST /api/pos/display/pair (sin sesión, rate-limited): canjea código → token largo aleatorio (32 bytes) devuelto una vez; guarda sha256 en display_token_hash; borra el código. Respuestas 400/404/429 sin filtrar existencia.
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
    const test = await agent(`Eres el TESTER de la Fase 3, parte ${p.nombre} (ronda ${ronda}). Esta fase es de SEGURIDAD: intenta romperla. Token inválido, revocado, de otra terminal; código caducado o reutilizado; organization_id en el body (debe ignorarse); fuerza bruta del código (rate limit); canal de otra terminal; mensajes con instanceId ajeno; JWT de Realtime caducado. Corre jest de pos-display y guardrails, eslint, tsc filtrado. Verifica que el middleware excluye /api/pos/display/* y que ninguna ruta lee pairing_code/display_token_hash desde el cliente. No arregles: reporta con pasos.
${CONTEXTO}
Alcance: ${p.alcance}
Builder dice: ${JSON.stringify(build, null, 2)}`, { label: `tester:F3${parte}:r${ronda}`, phase: fase, schema: TEST_SCHEMA })
    const qa = await agent(`Eres el QA-REVIEWER de la Fase 3, parte ${p.nombre} (ronda ${ronda}). Aplica además el rubric de seguridad: organización desde la terminal y nunca desde la petición; fail-closed; hash y no token; rate limit; sin Postgres Changes; exclusión correcta en middleware. Un fallo de seguridad es crítico y limita a 6. Verifica el código tú mismo.
${CONTEXTO}
Alcance: ${p.alcance}
Builder: ${JSON.stringify(build, null, 2)}
Tester: ${JSON.stringify(test, null, 2)}`, { label: `qa:F3${parte}:r${ronda}`, phase: fase, schema: QA_SCHEMA, effort: 'high' })
    rondas.push({ ronda, build, test, qa })
    const nota = qa?.calificacion ?? 0
    log(`F3 ${p.nombre} — ronda ${ronda}: QA ${nota}/10, tester ${test?.robustez ?? '?'}/10, ${qa?.veredicto ?? '?'}`)
    if (nota >= UMBRAL) break
    feedback = fb(test, qa)
  }
  return { parte, rondas }
}

phase('Parte A')
const rA = await ciclo('A', 'Parte A')
if ((rA.rondas[rA.rondas.length - 1]?.qa?.calificacion ?? 0) < UMBRAL) return { fecha: DATE, fase: 'F3', detenidoEn: 'A', partes: [rA] }

phase('Partes B C')
const rBC = await parallel(['B', 'C'].map((p) => () => ciclo(p, 'Partes B C')))
const partes = [rA, ...rBC.filter(Boolean)]
const noOk = partes.filter((r) => (r.rondas[r.rondas.length - 1]?.qa?.calificacion ?? 0) < UMBRAL).map((r) => r.parte)
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
