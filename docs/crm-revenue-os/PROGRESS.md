# PROGRESS — CRM Revenue OS (V4)

> Fuente de verdad para el comando `/loop` del CRM. Se actualiza en cada ronda; nunca se reescribe desde cero.
> Plan maestro: `docs/crm-revenue-os/PLAN.md` (V4, 2026-09-08). Documentos de fase: `FASE-XX-*.md`.

## Fases (V4)

| Fase | Documento | Estado | Ronda | Última calificación | Responsable |
|------|-----------|--------|-------|---------------------|-------------|
| PLAN-V4 — Plan maestro + ANEXO-A + ANEXO-B + ANEXO-C (documentación) | `PLAN.md`, `ANEXO-A-INVENTARIO-ACTUAL.md`, `ANEXO-B-PROVEEDORES-Y-APIS.md`, `ANEXO-C-RECONCILIACION-2026-09.md` | en_revision | 2 | ANEXO-B tester 7/10 | builder DOCS |
| DOC-F0 — FASE-00 Fundaciones, seguridad, cola/scheduler (documento) | `FASE-00-FUNDACIONES.md` | en_revision | 2 | tester 6/10 | builder DOCS |
| DOC-F3/F5 — Telefonía navegador + celular (documentos) | `FASE-03-TELEFONIA-CRM.md`, `FASE-05-LLAMADAS-MOVIL-PERSONAL.md` | en_progreso | 1 | - | builder |
| DOC-F4/F9 — Transcripción/análisis + timeline/UX (documentos) | `FASE-04-TRANSCRIPCION-ANALISIS-IA.md`, `FASE-09-FICHA-360.md` | en_progreso | 1 | - | builder |
| DOC-F7/F16 — Email + WhatsApp (documentos) | `FASE-07-EMAIL-Y-PLANTILLAS.md`, `FASE-16-WHATSAPP-INDIVIDUAL-Y-MASIVO.md` | en_progreso | 1 | - | builder |
| DOC-F6/F8 — Agente IA + motor de automatizaciones (documentos) | `FASE-06-AGENTE-IA-VOZ.md`, `FASE-08-AUTOMATIZACIONES-SECUENCIAS.md` | en_progreso | 1 | - | builder |
| F0 — Fundaciones, seguridad, cola y scheduler (implementación) | `FASE-00-FUNDACIONES.md` | en_progreso | 1 | - | 4 builders |
| F0-DB — Migraciones F0 vía MCP (CHECKs, activities/messages/customers cols, bucket, outbound_jobs, crm_events, contact_consents, provider_pricing, user_comm_preferences, RPCs de cola, cron inactivo, seeds, realtime) | `FASE-00-FUNDACIONES.md` §3 | en_progreso | 2 | tester 8/10 | builder DB |
| F0-SEC — Seguridad y contexto multi-tenant (orgContext, firmas fail-closed, IDORs, auth IA, verify rate-limit, ws-server auth, enums.ts, guardrails) | `FASE-00-FUNDACIONES.md` §4/§7 | en_revision | 1 | (tester en curso) | builder SEC |
| F0-JOBS — Cola/outbox: runner `/api/crm/jobs/run`, registry de handlers, crm_event dispatcher, vercel cron respaldo, JobsMonitor | `FASE-00-FUNDACIONES.md` §4.4 | en_revision | 2 | tester r1 6/10 → r2 pendiente re-test | builder JOBS |
| F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost, config UI (Proveedores e IA, Créditos), nav CRM, deps npm, .env.example, Dockerfile ws | `FASE-00-FUNDACIONES.md` §4.1-4.2/§5 | en_revision | 1 | (tester en curso) | builder REG |
| F3 — Telefonía en pipeline/oportunidad + grabación (implementación) | `FASE-03-TELEFONIA-CRM.md` | en_revision | 2 | pendiente re-test | builder F3 |
| F4 — Transcripción, análisis IA y actividad automática (implementación) | `FASE-04-TRANSCRIPCION-ANALISIS-IA.md` | APROBADA | 7 | **9.6/10** | builder F4 |
| F5 — Llamadas desde el celular personal (implementación) | `FASE-05-LLAMADAS-MOVIL-PERSONAL.md` | en_revision | 1 | (tester r1 en curso) | tester F5 |
| F6 — Agente IA multicanal por etapa (implementación) | `FASE-06-AGENTE-IA-VOZ.md` | APROBADA | 3 | **9.5/10** | builder F6 |
| F7 — Email profesional: editor, dominios, IA, inbound (implementación) | `FASE-07-EMAIL-Y-PLANTILLAS.md` | APROBADA | 4 | **9.5/10** | builder F7 |
| F8 — Motor único de automatizaciones y secuencias (implementación) | `FASE-08-AUTOMATIZACIONES-SECUENCIAS.md` | APROBADA | 3 | **9.5/10** | builder F8 |
| F9 — Timeline unificado, QuickActionsBar, drawer/detalle, Kanban (implementación) | `FASE-09-FICHA-360.md` | APROBADA | 3 | **9.5/10** | builder F9 |
| F16 — WhatsApp individual y masivo (implementación) | `FASE-16-WHATSAPP-INDIVIDUAL-Y-MASIVO.md` | en_revision | 2 | pendiente re-test | builder F16 |

## Suites rojas ajenas al CRM (no tocar)

`src/lib/services/website/__tests__/sectionContract.test.ts` falla con 2 casos desde antes de este trabajo: veinte variantes del catálogo del editor no existen en el sitio público, y una variante huérfana no está declarada. El archivo no ha sido modificado por ninguna fase del CRM y pertenece al editor web. Los testers deben ignorarla y no contarla como regresión.

## Historial de rondas

### Fase: F9 — APROBADA — 2026-09-09
- Calificación final: **9,5 / 10**. Tres rondas: 4,0 → 6,0 → 7,5 → 8,5 → 9,5.
- **La migración quedó verificada de extremo a extremo, que era lo que faltaba.** La función que conservaba la pertenencia comentada en su cuerpo pasó de responder con éxito y ejecutar el cuerpo a devolver error de permiso en vivo con la clave publicable. Las dos de secuencias igual, conservando el acceso con sesión, y se comprobó **en el código** que el llamador legítimo sigue en pie.
- **La lección se aplicó más allá de la lista encargada.** El tester revisó trece funciones leyendo el cuerpo real y no por búsqueda de texto, y comprobó sobre el esquema completo que **cero funciones en toda la base combinan acceso anónimo con la guarda condicional**.
- Matiz que evita una alarma falsa y que conviene conservar: las seis hermanas que aún son ejecutables por anónimos y escriben oportunidades **no tienen el mismo error**, porque usan una afirmación positiva incondicional y con identificador nulo **fallan cerradas**, que es lo contrario de saltarse la guarda.
- Deuda anotada con dueño: la función cerrada conserva la comprobación de pertenencia **comentada** dentro del cuerpo. Hoy es inocua porque nadie puede entrar, pero **no debe recuperar el permiso sin reescribirse antes**.
- El inventario de funciones con privilegios elevados y acceso anónimo baja de 327 a 324: las tres cerradas, ni una más.
- Corregida en el documento de F8 una prescripción de permisos que pedía conceder solo al rol de servicio, cuando los llamadores reales usan sesión. Lo desplegado ya era lo correcto.


### Lección de seguridad de la sesión: la guarda y la revocación son UNA sola medida — 2026-09-09
- Todo el plan usa una guarda con la forma «si hay sesión y no pertenece, error». El tester de F9 detectó la trampa: esa forma **solo funciona si el acceso anónimo está revocado**, porque para un anónimo el identificador de usuario es nulo y **la guarda se salta entera**. Dos funciones de secuencias tenían guarda y seguían abiertas a anónimos, así que la protección no aplicaba justo a quien más había que proteger.
- Queda como regla para cualquier función futura con privilegios elevados: **guarda de pertenencia y revocación de anónimos van juntas o no valen**.

### Cierre de la familia de funciones expuestas — orquestador — 2026-09-09
- **Quinta hermana de la familia de bypass**, señalada por el tester y escapada de la revocación anterior: estaba concedida a PUBLIC y a anónimos, y su comprobación de pertenencia estaba **comentada dentro del propio cuerpo**. Escribe el desenlace, así que permitía fijar como ganada una oportunidad ajena y disparar su comisión. Cero llamadores: código muerto. Revocada.
- Revocado también el acceso anónimo a las dos funciones de inscripción y reanudación de secuencias, conservando el acceso con sesión, que es como las invoca el servicio.
- **La migración se aplicó con éxito pero la base cayó justo después y no pudo verificarse en esa pasada.** No se da por hecha: la verificación queda encargada como tarea principal de la confirmación final, con la instrucción de reintentar y de distinguir indisponibilidad de defecto.
- Contexto que el propio tester aporta y que justifica no ir más allá: hay **327 funciones** con privilegios elevados y acceso anónimo en toda la base, y revocarlas en bloque «rompería punto de venta, inventario, nómina, alojamiento y facturación con casi total certeza». Por eso se cierran solo las de gravedad demostrada y el resto queda como trabajo del dueño.


### Fase: F9 — Re-verificación de la ronda 3 — 2026-09-09
- Calificación: **7,5 / 10**, desde 6,0. Los quince hallazgos cerrados y verificados.
- **Método del tester, que conviene copiar**: no se fió de que los tests pasaran. **Revirtió quirúrgicamente cada corrección en seis archivos** y comprobó que su caso se pone rojo. Los siete casos clave cayeron al reintroducir el defecto, así que las nueve conversiones son legítimas y **no vacuas**.
- Cerró además su reserva principal de la ronda anterior: quitando los siete filtros de organización del servicio real, dos casos caen, de modo que **el timeline por fin tiene prueba de aislamiento entre organizaciones**.
- Confirmó que el agujero crítico hallado por el constructor era real y que su cierre es correcto, incluido que el disparador nuevo bloquea al empleado sin romper la edición legítima ni el sembrado.
- **Lo que bloqueaba el listón era otro gemelo, y se le escapó en la pasada que hizo para cazarlo**: acotó la auditoría a «las funciones que toca esta fase» y quedaron vivas cuatro hermanas **ejecutables por anónimos**. Una es peor que la original, porque escribe el desenlace directamente: con la clave del navegador se podía cerrar como ganada cualquier oportunidad de cualquier organización y **disparar su comisión**, saltándose la API, el control de permisos y la corrección anterior, que defiende la vía de la etapa y no la del estado.

### Cierre del hallazgo crítico y del gemelo propio — orquestador — 2026-09-09
- Verificadas contra el catálogo las cuatro funciones y comprobado que **ninguna tiene un solo llamador en el código**: son código muerto con un agujero vivo. Revocadas para PUBLIC, anónimos y usuarios con sesión. La hermana viva, ya asegurada, se deja intacta. Se **revoca en vez de eliminar** porque cerrar el acceso es reversible y borrarlas es una limpieza aparte que decide el dueño.
- Aplicada por fin la comprobación de pertenencia que faltaba en la función que pausa secuencias por respuesta del cliente: **era el gemelo que el propio orquestador había dejado abierto** al aplicar la guarda a dos de tres funciones. Su primer intento falló por la caída de la base y se reintentó.
- Estado verificado de las cinco funciones tocadas en la sesión: **todas con comprobación de pertenencia y ninguna ejecutable por anónimos**.
- **La oportunidad dañada NO se repara aquí.** El dato es de julio de 2025, anterior a esta sesión, y rellenar sus datos de venta es afirmar hechos sobre una operación real. El tester verificó que la propuesta es segura y no dispara comisión; la decisión de escribirla es del dueño.


### Fase: F6 — APROBADA — 2026-09-09
- Calificación final: **9,5 / 10**. Tres rondas: 2,0 → 6,0 → 8,5 → 9,5, desde un veredicto inicial de «la fase no se ha empezado».
- **Las dos demostraciones de que las pruebas muerden se reprodujeron de forma independiente.** El tester rehízo la mutación desde cero: rompió el productor y **el caso antiguo de solo texto siguió verde mientras seis casos nuevos se ponían rojos**, con la cifra literal. Y comprobó que la foto de privilegios coincide **carácter a carácter** con sus propias consultas al catálogo. También revirtió los topes y vio ponerse rojo el caso que los vigila, con dos controles en verde.
- Verificó en vivo, con usuario real, que la escritura entre organizaciones, el libro de intentos y la tabla de ejecuciones de herramientas devuelven todos error de permiso, y que la corrección financiera del orquestador **no movió un solo asiento contable**, comprobando las cuentas línea a línea.
- Único fallo nuevo dentro de la fase: un caso que afirmaba algo que **la base desmiente**, porque su copia local del enumerado estaba desfasada y por eso pasaba. Corregido por el orquestador junto con la casilla del menú.

### Casilla del agente de voz activada por el orquestador — 2026-09-09
- Activada tras el visto bueno del tester, que lo dio **sin condiciones previas**. Se corrigió a la vez la aserción de otra fase que habría quedado roja al activarla, tal como él advirtió que pasaría.
- Corregido también el caso desfasado: la copia local del enumerado no incluía el tipo de trabajo que otra fase había añadido, así que el caso pasaba afirmando lo contrario de lo que dice la base. Ahora la copia está al día y el caso vigila que no vuelva a desfasarse en silencio.

### Fase: F9 — Ronda 3 — 2026-09-09
- **Los tres defectos de paginación resultaron ser el mismo defecto**, y ese es el hallazgo de método de la ronda: algo que se descarta después de consultar convertía «quedan filas» en «fuente agotada». Por eso se arreglaron con una sola idea, haciendo que la cola segura salga de lo que se **leyó** y no de lo que **sobrevivió** al filtro.
- La pasada de gemelos encontró el mismo defecto de precisión temporal **en dos funciones de comparación** que nadie había mirado, más tres escrituras que ignoraban su error y el encargo que le pasó la fase de transcripción, donde un diálogo decía siempre «Email enviado» aunque el envío quedara **programado**.
- **Tercer agujero crítico de seguridad de la sesión, y este no estaba en ningún informe**: una función de actualización sin disparadores era de privilegios elevados, sin ruta de búsqueda fijada, **ejecutable por anónimos y por PUBLIC** y sin comprobación de pertenencia, de modo que cualquiera con la clave publicable podía reconfigurar cualquier etapa de cualquier organización. Cerrado por migración, junto con un disparador que exige jefatura para tocar las marcas de ganada y perdida y con el autor del cambio por fin registrado.
- Queda **una escritura correctiva pendiente sobre datos reales**: la oportunidad dañada. Se propone un relleno que **no toca el estado**, tras verificar que el disparador de comisión solo actúa al cambiar el estado. No se ejecuta hasta que el tester juzgue la propuesta.


### Fase: F6 — Ronda 3 — 2026-09-09
- Cierra los tres hallazgos de calidad de pruebas, y lo hace **demostrando que las pruebas nuevas muerden**. Para el productor, renombró un campo del contenido y se tragó un error de base a propósito: **el test antiguo de solo texto siguió verde mientras seis casos nuevos se ponían rojos**. Después restauró el archivo y comprobó la firma.
- Verificó las dos correcciones del orquestador **contra la base con un usuario real**, en vez de darlas por buenas: la escritura entre organizaciones ya devuelve error de permiso, y el libro de intentos rechaza inserción, actualización y borrado conservando la lectura.
- **Retiró de la tabla un caso propio que era teatro**: afirmaba una longitud sobre su propio literal y pasaba aunque no hubiera ninguna política en la base.
- **La pasada de gemelos encontró dos defectos suyos**, y uno tiene peso legal: la tabla de ejecuciones de herramientas tenía el mismo agujero que el libro, de modo que un inquilino podía **borrar la prueba de que un cliente pidió no ser contactado**. El otro era un mensaje que mentía al cliente en mitad de la llamada, gemelo del que ya había corregido al lado.
- La suite pasa de 69 a 96 casos.
- Aviso operativo honesto: la interfaz de datos del proyecto estuvo intermitente durante la ronda, y las pruebas de privilegios **se saltan con un aviso ruidoso** en vez de dar un falso verde cuando eso ocurre.

### Hallazgo de seguridad FUERA del CRM, verificado y cerrado por el orquestador — 2026-09-09
- El constructor lo encontró en su pasada de gemelos y **no lo tocó**, por estar fuera de su fase. Verificado contra la base antes de actuar.
- La función que crea un **saldo a favor de cliente** salta la seguridad por fila, escribe la nota de crédito **y su asiento contable de doble partida**, recibe la organización como parámetro, no comprobaba nada y estaba concedida a **PUBLIC y a anónimo**. Es decir: una **escritura financiera entre organizaciones alcanzable con la clave pública que viaja en el paquete del navegador**. Su gemela de lectura exponía los saldos de cualquier organización.
- Antes de tocar nada se comprobó que el único llamador de ambas es la pantalla de saldos a favor y que las invoca **con sesión**, así que revocar el acceso anónimo y exigir pertenencia no rompe el uso legítimo. Lo que deja de ser posible es pasar el identificador de otra organización, que es justo lo que el llamador envía desde el cliente.
- Aplicado: revocación de PUBLIC y anónimo en las tres funciones señaladas, y comprobación de pertenencia en la de escritura y en la de lectura. **No se tocó la lógica contable ni se creó ninguna tabla.**
- Queda para el dueño, porque excede este plan: la tabla de consentimientos permite a un inquilino **borrar una baja registrada**, lo que tiene la misma naturaleza legal que el hallazgo del constructor.


### Fase: F4 — Ronda 7 (opcional, tras aprobar) — 2026-09-09
- Cerrados los cinco puntos bajos que quedaban **y un gemelo más que apareció en la pasada**: una lista hermana del mismo archivo tenía los plurales escritos a mano y le faltaba uno, de modo que «los momentos clave son Pro2026» destrozaba el nombre del producto mientras el singular no lo hacía. Se deriva ahora con el mismo ayudante.
- El punto que más importaba era una **afirmación falsa dentro del código**, y resultó estar en **tres** sitios y no en uno. Corregidos los tres, con una prueba que **lee el fuente y falla si la frase vuelve**, y otra que fija que el comportamiento no cambió.
- La suite se escribió primero y se ejecutó en rojo, cinco de nueve, un rojo por hallazgo. El constructor **declara por su cuenta la única excepción**: un caso se escribió ocho segundos después de su arreglo, porque el gemelo apareció en la pasada posterior. Esa precisión, sin que nadie se la pidiera, es el nivel de honestidad que se buscaba.
- Pasada de gemelos por seis carriles, incluido uno nuevo: comentarios que afirman lo que el código ya no hace.
- **Un hallazgo entregado a otra fase en vez de invadir su archivo**: un panel del timeline dice «Análisis generado» cuando la respuesta es solo un encolado aceptado, que es la misma familia de defecto de prometer al usuario algo que aún no ha ocurrido. El parche exacto quedó en el informe para el dueño de ese archivo.
- Árbol tras la ronda: **1392 casos en verde**, y la única suite roja es la ajena y preexistente del editor web.


### Fase: F8 — APROBADA — 2026-09-09
- Calificación final: **9,5 / 10**, justo en el listón. Tres rondas: 3,5 → 7,5 → 8,5 → 9,5.
- El bloqueante quedó cerrado **por los cuatro frentes y sin tomar la salida fácil** que el propio tester había ofrecido, que era retirar el canal. La prueba va por la cola con el orden más adverso, no por el camino cómodo.
- **La semántica general de las reglas no se movió**, verificado por tres vías independientes. Era la forma fácil de romper toda la fase al arreglar las secuencias.
- **La autocolisión del barrido es real y el tester la reprodujo contra producción**: la función de encolado devolvió el identificador del propio trabajo en curso y creó cero sucesores. Era peor que su propio hallazgo, y él mismo escribe que **la prueba que lo tapaba era suya**, porque borraba el trabajo antes de invocar el manejador y así no había nada con que colisionar.
- Los setenta y seis casos anteriores están todos, contados nombre a nombre, y el único cambio de aserción es aditivo. Cero regresiones en todo el árbol.
- El tester restó dos imprecisiones del informe del constructor: la función que se decía sin llamadores **sí tenía uno**, en otro archivo; y la restricción de base cubre menos casos de los declarados.
- Riesgo residual reconocido y no imputable: tras cuatro rondas **nadie ha visto el motor mover un correo de punta a punta** ni el editor renderizado, porque el propio encargo prohíbe drenar la cola y activar tareas. Por eso no da un 10.

### Casilla de secuencias activada por el orquestador — 2026-09-09
- Activada tras el **visto bueno expreso** del tester, que además comprobó por búsqueda que no queda ningún otro enlace ni redirección a la pantalla y repasó los caminos de envío.
- Aplicado a la vez el arreglo que él recomendaba hacer con la casilla: el editor de condiciones ofrecía el grupo de campos de evento, y en una secuencia **no hay evento**, así que ese campo evaluaría siempre a falso y, con el corte a prueba de fallos recién añadido, **cortaría siempre**. El editor invitaba a elegir justo lo único que no puede funcionar.
- Aviso importante que el tester deja escrito: **la casilla del menú no es contención real**, porque la página es alcanzable por dirección directa esté como esté. Por eso el bloqueante había que cerrarlo de verdad y no bastaba con ocultarla.

### Decisión de despliegue que queda para el dueño
- El tester recomienda activar la tarea programada número 17 **después** de la página y observando, y explica qué mirar: un solo trabajo de eventos temporales por organización, reprogramándose cada quince minutos, y **que la cadena no se apague en la segunda vuelta**, que es lo único verificado contra la función pero no en un proceso real.
- **No se activa aquí**: poner en marcha un motor que despacha trabajos por su cuenta es una decisión de despliegue del dueño, no del plan. En el primer ciclo despacharía el evento interno que lleva pendiente desde las fundaciones; con cero reglas y cero secuencias no puede desencadenar ningún envío.


### Fase: F4 — APROBADA — 2026-09-09
- Calificación final: **9,6 / 10**. Alcanza el listón. Seis rondas: 7,5 → 8,0 → 8,5 → 9,0 → 9,2 → 9,6.
- **El resultado que el propio tester pone por encima de los tres arreglos**: por primera vez en seis rondas, **el defecto de la misma familia NO apareció en el sitio contiguo**. El cambio de método vale más que cualquiera de las correcciones.
- Verificó que la pasada de gemelos **es real y no un párrafo**: recontó por su cuenta los puntos de encolado y comprobó que los descartes se sostienen en el fuente, incluidos los dos que se descartan porque la guarda sería inerte.
- Confirmó el método de prueba primero **por las marcas de tiempo**: la última escritura de la suite es anterior a la de la ruta y a la de la regla, así que la prueba se escribió antes que el código. Y reprodujo caso por caso que siete de once estaban en rojo, como se declaraba.
- Demostró contra Postgres que el hallazgo anterior era real: insertó tres filas vivas con la clave llana y dos sufijos, **y las tres entraron**, de modo que el índice único no podía frenarlas y la guarda del código era el único freno posible.
- Sobre el enmascarado: veinticinco frases nuevas, todas correctas. Por primera vez **el fallo no se desplazó a un hueco sin declarar**. Los dos hallazgos que quedan son bajos y estaban ya dentro de los límites declarados.
- Quedan cinco puntos bajos, todos de menos de media hora, en ronda corta y opcional para acercar la fase a 10. Ninguno toca dinero ni fuga de datos.
- **Petición viva desde hace seis rondas y que es decisión del dueño**: el catálogo de objeciones está vacío en toda la base. Sin él, el mapeo de objeciones no tiene con qué trabajar. Sembrarlo es contenido de negocio, no una migración técnica, así que no se hace de oficio.


### Fase: F8 — Ronda 3 — 2026-09-09
- El bloqueante se cierra en cuatro frentes: editor de condiciones nuevo montado en el diálogo de secuencia, validación que **rechaza** un paso de condición sin ninguna regla, comportamiento en ejecución **a prueba de fallos** (una condición vacía o malformada corta en vez de dejar pasar) y una restricción en la base.
- Detalle revelador: la validación por fin **llama a una función que existía y no tenía ningún llamador**. Es el tercer caso en esta sesión de código escrito, correcto y nunca invocado.
- **Encontró un fallo peor que el reportado, y esa es la aportación de la ronda.** La función de encolado deduplica sobre trabajos en cola o en ejecución y devuelve el vivo; como el trabajo del barrido está en ejecución **mientras corre su propio manejador**, colisionaba consigo mismo y no creaba sucesor. El barrido moría tras su **primera** pasada, no tras tres fallos. Y las pruebas de la ronda anterior no lo veían porque **borraban el trabajo del barrido antes de invocar el manejador**.
- Noventa casos en verde, con los setenta y seis anteriores conservados y catorce nuevos, ninguno borrado ni aflojado.
- El constructor afirma que la página de secuencias ya puede activarse. **La casilla se retiene hasta el veredicto del tester**, siguiendo lo que ha funcionado toda la sesión: en cada fase, el verificador ha encontrado algo que el constructor daba por cerrado.


### Fase: F6 — Re-verificación de la ronda 2 — 2026-09-09
- Calificación: **8,5 / 10**, desde 6,0. Las ocho declaraciones del constructor se verificaron **en vivo**, no por lectura.
- Las revocaciones funcionan: cinco funciones devuelven error de permiso con la clave pública, donde en la ronda anterior tres respondían con éxito. El libro de intentos se reprodujo contra la base con los números exactos. La pestaña del dueño es alcanzable recorriendo la cadena entera hasta el engranaje real. El productor existe y el tester **lo ejecutó él mismo** con una sonda propia.
- **La comprobación más valiosa de toda la sesión**: el tester parcheó el conteo a la semántica antigua para ver si el caso de prueba **falla de verdad contra el código defectuoso**. Se puso rojo con doscientas una marcaciones frente a un tope de cincuenta, y restauró el archivo comprobando la firma. Eso convierte esa prueba en una prueba de verdad, y es el estándar que debería aplicarse a toda guarda.
- **Dos hallazgos altos, ambos de base de datos y ambos explotados en vivo**: la función de registro de baja no comprobaba la pertenencia del llamante, de modo que un miembro de una organización podía marcar como dado de baja a un cliente de otra en los cuatro canales; y el «libro inmutable» lo podía borrar cualquier miembro autenticado, dejando el tope de marcación en cero.

### Corrección aplicada por el orquestador — y un error propio reconocido — 2026-09-09
- **El primer hallazgo era, en parte, culpa mía.** Al cerrar el agujero crítico de la ronda anterior pedí la comprobación de pertenencia para **las dos** funciones que escriben y **solo la apliqué a una**. Es exactamente el patrón de dejar el gemelo en el archivo de al lado que llevo toda la sesión señalando en los constructores. Queda escrito para que no se pierda la lección.
- Cerrado el gemelo: la función de registro de baja ya exige pertenencia activa cuando hay sesión, y el rol de servicio sigue pasando, que es como la invoca el agente.
- El libro de intentos vuelve a ser inmutable para el cliente: eliminadas las políticas de inserción, actualización y borrado, y revocados esos permisos de tabla. Solo queda la lectura, para que la interfaz pueda mostrar los intentos, y solo escribe el rol de servicio. Verificado: una sola política, y los roles de cliente sin permiso de escritura.
- Lo que queda para la ronda 3 es **calidad de las propias pruebas**: el productor solo tiene aserciones de texto, la suite no comprueba privilegios pese a dos rondas con hallazgos de permisos, y los topes de campaña y de despacho puntual se suman en vez de compartir presupuesto.


### Fase: F4 — Ronda 6 — 2026-09-09
- **Por primera vez en la fase, el constructor buscó el gemelo antes de cerrar, y encontró uno.** El panel de transcripción prometía una transcripción nueva aunque la respuesta viniera deduplicada; al buscar ese gemelo apareció que **el panel de análisis tampoco leía ese campo desde la ronda anterior**, pese a que el campo existía y nadie lo mostraba. Los dos corregidos.
- La pasada de gemelos queda escrita: seis puntos de encolado revisados, dos descartados **con motivo** porque la guarda sería inerte al ejecutarse sobre una llamada recién creada, un único punto de envío al proveedor y ningún segundo memo por importe.
- El enmascarado deja de filtrar credenciales **por construcción**: la lista de conectores se construye incluyendo la de sustantivos de contexto, así que la contradicción interna no puede reaparecer.
- Y algo que vale más que un cierre: **declara un falso positivo nuevo que crea su propio arreglo**, y deja dos límites abiertos a propósito porque cerrarlos exige tocar la pieza que lleva cuatro rondas rompiendo por el lado contiguo. La lista pasa de ocho a doce límites y dice **expresamente que no es exhaustiva**, en vez de declararla completa como en la ronda anterior.
- Cambio de método verificable: escribió la suite nueva **y la ejecutó en rojo**, siete de once, **antes** de tocar la regla, con la batería completa de las cuatro versiones anteriores dentro.

### Integración aplicada por el orquestador — tope de cuerpo del despliegue — 2026-09-09
- Documentada la variable que faltaba para cerrar la petición abierta desde la ronda 4. El problema real: los adaptadores de transcripción aceptan mucho más que la plataforma que los sirve, porque uno admite un gigabyte y otro dos, mientras que una función sin servidor corta el cuerpo de la petición muy por debajo. Sin ese número, un rechazo por tamaño puede **prometer al usuario un tamaño que la plataforma nunca va a dejar subir**.
- Se deja escrito el aviso que evita el malentendido más probable: subir ese número **no amplía** el límite real del proveedor de despliegue, solo cambia lo que se le promete al usuario. Para archivos grandes hay que subir al almacenamiento y pasar la referencia, no el archivo por la ruta de interfaz.
- **No se cableó el cambio de dos líneas en el servicio**, a propósito: la reverificación de la fase está examinando el árbol en este momento y tocarlo ahora invalidaría su medición. Queda como primer punto de la siguiente ronda si la hay.


### Fase: F8 — Re-verificación de la ronda 2 — 2026-09-09
- Calificación: **8,5 / 10**, desde 7,5. **Los ocho hallazgos corregidos y ninguna declaración falsa**, con las dieciséis fechas coincidiendo al segundo y los errores de compilación clavados.
- El bloqueante quedó corregido en la raíz y el tester lo verificó con una prueba **que el constructor no había hecho**: primer paso a cinco días y correo a día cero, comprobando que solo se encola el primero. Con el código anterior el correo habría salido **cinco días antes**. Subraya además que no se disimuló el síntoma, porque las horas siguen empatadas al microsegundo y lo que cambió es el encadenamiento.
- **El tester se corrige a sí mismo**: su frase de que «esto se pone en 9 sin tocar nada más» era demasiado generosa. Al cerrar la puerta de la cola buscó las otras y encontró tres.
- **El hallazgo más revelador**: el paso de condición **no se puede configurar desde el producto**, y una condición nula **evalúa a verdadero**. La interfaz anuncia «puede cortar la secuencia» y no corta nada. Se blindó con mucho cuidado un camino al que desde la aplicación no se puede llegar.
- Además: una condición que falla al evaluarse manda el correo igual, porque continuar ante error viene activado por defecto; y el barrido de eventos temporales, que el encadenamiento convirtió en pieza de carga, puede morir permanentemente porque una ejecución defectuosa envenena el lote entero.

### Casilla de menú activada por el orquestador — 2026-09-09
- Siguiendo la **recomendación expresa del tester**, se activó la página de automatizaciones: su única acción real exige rol de administrador, el botón de probar es en seco y el forzado que ejecutaba una regla desactivada quedó retirado.
- La de secuencias **sigue apagada a propósito**: es la pantalla desde la que se inicia un envío a un cliente real, y su paso de condición todavía no se puede configurar. Cerrar ese hallazgo es lo que la desbloquea.
- Recordatorio útil: esa casilla es ahora el **único interruptor real**, porque los enlaces de la vista de automatizaciones solo se renderizan si está activa. Antes no era así, y ocultarla no contenía nada.

### Fase: F6 — Ronda 2 — 2026-09-09
- Corrige los cuatro hallazgos altos. El más interesante es el tope: se sustituye el conteo por una marca que el reintento ponía a nulo por un **libro de intentos**, una tabla nueva donde la función de reclamo escribe una fila inmutable por reserva. Verificado en la base: al poner la marca a nulo y volver a reclamar, el libro cuenta seis y la marca tres.
- Y algo más importante que el arreglo: dice haber **reescrito el caso de prueba para que el doble ya no lleve su propio contador**, de modo que ahora se pone en rojo contra el código de la ronda anterior. Queda encargado al tester comprobarlo, porque un caso que no falla contra el código defectuoso no prueba nada.
- La pestaña de agente por etapa se movió al diálogo que el engranaje abre de verdad, así que la petición literal del dueño pasa a ser alcanzable. El disparo al entrar en la etapa tiene por fin productor. El despacho puntual recibe las mismas barreras que la campaña más el rol de administrador.
- **Las cuatro funciones nuevas llevan su revocación en la misma migración**, que era la lección de la ronda anterior, y dice haberlo comprobado en vivo con la clave pública obteniendo error de permiso.
- **Retira por escrito sus dos declaraciones falsas** anteriores.
- Declara dos ediciones en archivos compartidos, ambas mínimas e inevitables para conectar el disparo por etapa y la pestaña.


### Fase: F4 — Re-verificación de la ronda 5 — 2026-09-09
- Calificación: **9,2 / 10**, desde 9,0. Cinco de los seis hallazgos cerrados de verdad y **con el método correcto**: la batería completa montada antes de tocar la regla, la consulta de conciliación verificada contra Postgres, y la cita falsa reconocida sin defenderla.
- El enmascarado es por fin la mejor de las cuatro versiones y **la primera que pasa las tres baterías históricas a la vez**. El tester lo reverificó por separado con instrumento propio.
- **Pero se ha desplazado otra vez, y ahora hacia el lado peligroso**: ya no es un falso positivo cosmético, ahora **deja pasar credenciales** al proveedor de análisis. La causa es que el código se contradice a sí mismo, porque la lista de sustantivos que mantienen la lectura de credencial contiene ocho que no están en la lista de conectores: pasan el filtro y acto seguido cortan la búsqueda del valor. Quedan intactas frases como «la clave del router es Admin2024», y lo mismo con sistema, portal, red, plataforma, módem, ingreso y login.
- **Cuarta repetición del mismo patrón**: se arregla el defecto y se deja el gemelo en el archivo de al lado. Esta vez el gemelo es **más alcanzable que el original**, porque la interfaz ofrece el botón de reintentar mientras el trabajo sigue vivo.
- Se le encargó al constructor una pasada explícita buscando el gemelo de cada arreglo en los archivos vecinos, y que escriba qué buscó y qué encontró. Es la comprobación que ha faltado cuatro rondas seguidas.


### Fase: F8 — Ronda 2 — 2026-09-09
- El hallazgo bloqueante se corrigió **en la raíz y no con un parche**. La causa era que la inscripción encolaba un trabajo por paso, todos con la misma hora, y la cola ordena solo por hora sin desempate. Ahora la programación es **encadenada**: se crean todos los pasos en la misma transacción, conservando la atomicidad, pero solo se encola el trabajo del primero, y cada paso encola el siguiente al terminar. Nunca encola si la condición es falsa o la inscripción sale.
- Añade además una guarda que devuelve a pendiente y reencola cualquier paso cuyo predecesor siga sin resolverse, para proteger también el barrido, que empata igual.
- Lo verificó por la cola con un drenador que reproduce la función de reclamo y **elige el orden más adverso en el empate**, que es la forma correcta de probar un problema de ordenación.
- Cerró también los siete hallazgos restantes: eventos temporales sin necesidad de una tarea programada nueva, reanudación de inscripciones pausadas, retirada completa del forzado, filtrado por organización en el cierre de ejecución, y un diálogo de inscripción con búsqueda, previsualización de pasos y confirmación en lugar del identificador pegado a mano.
- **Atendió la lección sobre la contención**: los dos enlaces de la vista de automatizaciones solo se renderizan si la casilla del menú está activa, de modo que esa casilla pasa a ser el único interruptor real. Antes no lo era.
- Setenta y seis casos en la suite del tester, con los cincuenta y seis anteriores intactos y veinte nuevos, ninguno borrado ni aflojado.
- Declara lo que sigue sin hacer, incluido que la cadena en vivo no se ejerció porque no se drenó la cola.

### Corrección de la suite de guardas — falso positivo propio — 2026-09-09
- La guarda que persigue elegir una configuración de comunicaciones arbitraria tenía un **falso positivo del propio orquestador**: su expresión saltaba de una consulta a otra y marcaba un archivo por tener una consulta correcta, filtrada por organización, y cientos de líneas más abajo fragmentos de consultas distintas.
- Acotada a una sola sentencia y **comprobado que sigue detectando el antipatrón real y ya no marca el caso legítimo**. Treinta y nueve casos en verde. Es la segunda vez en esta sesión que una guarda se valida por mutación antes de darla por buena.


### Fase: F7 — APROBADA — 2026-09-09
- Calificación final: **9,5 / 10**. Alcanza el listón, justo. Cuatro rondas: 8,0 → 8,2 → 9,0 → 9,4 → 9,5.
- La confirmación corta verificó las correcciones documentales y, sobre todo, **demostró por mutación que el caso de blindaje no es vacuo**: reintrodujo el defecto y el caso falla, produciendo el ampersand escapado dos veces tanto en el cuerpo de texto como en la línea de vista previa; y con un doble escapado en el marcado también falla. Muerde en las dos direcciones.
- Confirmó además que **no se tocó una sola línea de lógica** en la corrección final, comprobándolo por fechas de modificación.
- Residuo que el propio tester señaló y quedó cerrado después: la cabecera del archivo de pruebas conservaba palabra por palabra las dos afirmaciones falsas, de modo que dos archivos del mismo directorio se contradecían y **el que mentía era el que leería quien tocase la suite**. Reescrita con la causa raíz real y con el desglose correcto. También se corrigió un recuento propio que estaba a la baja.
- Doscientos veinticinco casos en verde en las trece suites de la fase.

### Fase: F4 — Ronda 5 — 2026-09-09
- El constructor dice haber cerrado los seis hallazgos. Lo más relevante del método: antes de tocar el enmascarado reunió **la batería completa de las tres versiones anteriores**, aciertos y falsos positivos, y iteró hasta que todas pasan a la vez, en vez de arreglar el caso del día. Es justo lo que faltaba en las tres rondas anteriores.
- Los límites del enmascarado pasan de cuatro a **ocho**, escritos y fijados por prueba, **incluido uno que reconoce no poder cerrar sin conocimiento del mundo**. Esa honestidad vale más que una declaración de cierre.
- Reconoce que la guarda que había declarado en la ruta de transcripción **no existía**, y la añade.
- **Retira su petición** de que la función de reembolso lance, y da la razón al orquestador.
- Queda encargado al tester atacar el enmascarado con casos nuevos que no estén en ninguna batería anterior: es la cuarta versión y las tres anteriores rompieron por donde la anterior no rompía.


### Fase: F6 — Re-verificación de la ronda 1 — 2026-09-09
- Calificación: **6,0 / 10**, desde 2,0. El tester subraya que verificó **contra la base real y no contra el informe**: las tres migraciones existen y cada afirmación se reprodujo. Los cinco errores de esquema que mataban la fase están cerrados, el despachador propaga el código de error real en vez de mentir con «Cliente no encontrado», la configuración por etapa **sí llega al comportamiento de la llamada** y la herramienta ya no miente.
- **Hallazgo crítico, explotado en vivo sin sesión**: tres funciones nuevas con elevación de privilegios quedaron ejecutables por usuarios anónimos. La peor devuelve filas completas de la tabla de llamadas, es decir **fuga de datos entre organizaciones**; otra permite marcar como dados de baja a los clientes de cualquier organización en los cuatro canales, rompiendo también correo y WhatsApp.
- **El tope de marcación no frena lo que dice frenar**: el reintento y el rechazo por franja horaria ponen a nulo la marca por la que se cuenta, así que el intento desaparece del conteo. Tres filas producen quince marcaciones contadas como tres, y el techo efectivo es de doscientas cincuenta diarias contra un tope declarado de cincuenta. El caso de prueba da verde con el tope roto porque modela el conteo con un contador propio en vez de con la semántica real.
- **La petición literal del dueño es inalcanzable**: la pestaña de agente por etapa está bien montada, pero el diálogo que la contiene **tiene cero importadores** desde que otra fase borró el único que había. Su prueba tampoco lo detecta, porque comprueba que el archivo contiene el nombre de la pestaña, no que alguien monte el diálogo.
- Además: el disparo al entrar en la etapa sigue sin ocurrir porque **no hay productor** que encole el trabajo; hay un camino de despacho puntual **sin ningún tope** y sin exigir rol de administrador; la reserva de crédito nunca se concilia, de modo que treinta segundos cuestan dos créditos; y el consentimiento se puede **desmarcar** en la interfaz, lo que incumple la ley de protección de datos.

### Corrección crítica aplicada por el orquestador — 2026-09-09 (F6)
- Revocada la ejecución por usuarios anónimos en las tres funciones. En la que reserva llamadas se revocó también a los usuarios con sesión, porque devuelve filas completas de la tabla y solo la usa el servidor. A la que detiene campañas se le añadió **comprobación de pertenencia**, de modo que la organización deja de ser un parámetro en el que confiar. Verificado: ninguna de las tres sigue abierta a anónimos.
- **Corrección importante a la atribución del tester**: la ronda de esta fase **no abrió** ese agujero. Es el privilegio por defecto del esquema público en este proyecto, y afecta a **339 de las 360 funciones con elevación de privilegios**. Lo que hizo la fase fue añadir tres funciones peligrosas siguiendo el default sin revocar. La regla que queda para todos los constructores es que toda función con elevación de privilegios lleve su revocación en la misma migración.
- **Pendiente para el dueño, y es un trabajo aparte**: revisar las otras trescientas treinta y seis. Es una limpieza amplia y con riesgo de romper funcionamiento existente, así que no se hace de oficio dentro de este plan.


### Fase: F7 — Re-verificación de la ronda 4 — 2026-09-09
- Calificación: **9,4 / 10** (316 casos), desde 9,0. **Se rompe la racha: por primera vez en cuatro rondas el arreglo no introdujo ningún defecto propio en el código.** El tester lo buscó con vectores nuevos, incluidos treinta y cuatro casos con los valores peligrosos entrando **por variable** en vez de por literal, y veinticuatro vectores de navegador que nunca había usado. No lo encontró.
- El caso exacto que fallaba se lee ya correcto en **las dos salidas**: cero entidades en el texto y cero en el preheader, donde antes contó nueve y cuatro. El marcado, que era la mitad fácil de romper al arreglar el texto, sigue con cero manejadores de eventos medidos con analizador real.
- Reconocimiento expreso del tester: el constructor abrió la salida que acababa de arreglar y **encontró dos defectos que nadie le había reportado**, los cerró y los cubrió con prueba. Los tres arreglos quedaron verificados de forma independiente.
- **Lo único que impedía el listón no era el código, sino dos afirmaciones falsas sobre el propio árbol de pruebas.** Se dijo que la suite nueva era la primera en mirar la salida de texto y el preheader, y no lo era: una suite de la ronda 1 ya lo hacía. Y se dijo que sus catorce casos cruzan las dos salidas del mismo render, cuando lo hace **uno**.
- Eso importaba más de lo que parece porque **dejaba escrita la causa raíz equivocada en el documento permanente**. El hueco no era que nadie mirase la salida de texto: era que **ninguna fixture llevaba un ampersand, comillas ni un menor-que**, así que el escapado era una operación nula y no había nada que observar.

### Corrección aplicada por el orquestador — 2026-09-09 (F7)
- El propio tester dijo que bastaban tres frases y que no hacía falta una ronda entera, así que se corrigieron directamente: el documento de fase en sus dos secciones y la fila de la tabla, con la causa raíz real y el desglose honesto de cuántos casos cruzan de verdad las dos salidas.
- El informe de la ronda lleva ahora al principio una **nota de rectificación** con las dos afirmaciones falsas, para que nadie las herede como ciertas.
- Añadido el blindaje que el tester proponía: un caso con una razón social con ampersand y comillas **entrando por variable**, que exige escapado en el marcado sin doble escapado y ausencia de entidades en el texto y en el preheader. Convierte el escapado en una operación con efecto justo en la fixture que dejó pasar el fallo. Catorce casos en verde.
- **No se tocó una línea de lógica.** Confirmación corta encargada al tester.
- Petición pendiente del tester al orquestador: la carpeta de servicios de correo **está sin seguimiento en git**, y por eso tres verificaciones seguidas han tenido que apoyarse en fechas de modificación en vez de en el historial. Conviene incorporarla, y esa es decisión del dueño.


### Fase: F8 — Re-verificación de la ronda 1 — 2026-09-09
- Calificación: **7,5 / 10**, desde 3,5. El tester dice que **el salto es real y no declarativo**, y que no encontró **ni una sola afirmación falsa** en el informe del constructor.
- Verificado contra la base: las dos migraciones existen y hacen lo que dicen; el índice único es **parcial de verdad**, bloquea el duplicado vivo y **permite reinscribir a quien salió**; y la inscripción es **atómica de verdad**, probada forzando un fallo a mitad, con cero filas resultantes.
- **El tester corrigió una exageración propia**: había escrito que la cola tenía treinta y tres trabajos vivos y que drenarla podía enviar mensajes reales. Hay **uno**, y es un evento interno, no un envío. Mantiene la política de no drenar, pero rectifica el riesgo que describió.
- **Hallazgo alto nuevo**: dos pasos con retardo cero reciben el mismo sello de tiempo, y la cola ordena solo por hora sin desempate. Si el paso del correo se procesa antes que el de la condición, **el correo se envía**, y luego el salto de pasos solo marca omitidos los que aún estaban pendientes. Es el peor síntoma del fallo original, reabierto y ahora alcanzable porque el motor está conectado.
- Lección que corrige una contención mía: **ocultar las páginas del menú no era contención**. La vista de automatizaciones está montada en el pipeline y enlaza a la página nueva, así que cualquiera que abra esa pestaña ya podía entrar. Lo que de verdad contiene el riesgo es que no hay reglas ni secuencias y que las tareas programadas siguen inactivas.
- Recomendación del tester: la página de automatizaciones es activable en cuanto se cierre un punto bajo; la de secuencias **no**, hasta cerrar el hallazgo alto.

### Integraciones aplicadas por el orquestador — F6 y guarda de reembolsos — 2026-09-09
- **Registrado el manejador del tipo de trabajo de llamada del agente**, con importación perezosa para no arrastrar el servicio de voz al arranque del ejecutor. Sin él, un agente configurado para dispararse al entrar en una etapa no hacía nada.
- **Una de las cuatro peticiones del agente de voz no requería cambio**: suponía que la imagen del servidor de websockets solo copiaba una subcarpeta, y en realidad copia toda la carpeta de librerías, así que los módulos que importa ya estaban incluidos. Se le devolvió el dato para que corrija su informe.
- **Nueva guarda contra la reincidencia del fallo de reembolsos**, propuesta por el tester de transcripción: un caso que falla si algún archivo de producción llama a la función de reembolso **sin guardar el valor devuelto**. Se comprobó que discrimina de verdad, marcando la llamada suelta y aceptando la asignada, en vez de pasar siempre. Treinta y nueve casos en verde.
- Sigue sin activarse la visibilidad en el menú de las páginas de las tres fases nuevas, y sin programarse ninguna tarea periódica: lo primero espera veredicto del tester y lo segundo es decisión de despliegue del dueño.


### Fase: F8 — Ronda 1 real — 2026-09-09
- El constructor declara haber construido la fase entera: dos migraciones por el MCP con las columnas que el plan pedía, el índice único **parcial** que impide inscribir dos veces solo mientras la inscripción está viva (y permite reinscribir a quien ya salió), y una función de base que hace la inscripción completa **en una sola transacción**, con sus pasos y sus trabajos encolados.
- Atiende los doce fallos, incluida la corrección de las columnas y el estado de las tareas, el reclamo atómico con rescate de trabajos colgados, el control de rol de administrador en las seis rutas y el destinatario resuelto desde el cliente para que el consentimiento se aplique.
- Decisión que conviene juzgar: **borró** la ruta inalcanzable en vez de eximirla en el middleware, y así no hubo que tocar un archivo compartido. También borró un componente muerto de trescientas sesenta líneas.
- Honestidad que se agradece: cinco de las catorce acciones siguen sin implementar y **ahora fallan explícitamente** en vez de reportar éxito, y así queda declarado. Tampoco sembró datos de ejemplo, a propósito, para no provocar envíos sorpresa.
- Dejó las tres tareas programadas inactivas, como se le indicó: activarlas es decisión de despliegue y en el primer ciclo se despacharían los treinta y tres trabajos vivos que ya hay en la cola.
- Un salto de «no implementada» a «construida entera» en una sola ronda merece verificación estricta, y así se encargó.

### Integraciones aplicadas por el orquestador — 2026-09-09 (F8)
- **Conectado el motor**: el registro de manejadores ya importa el módulo de la fase. Sin esa línea el motor seguía desconectado y cualquier trabajo encolado moría como fallo terminal.
- Añadido el tipo de evento temporal **a la vez** en la lista de valores y en el fichero de referencia, que deben ir juntos o la guarda se pone roja.
- Retirada de la lista de excepciones la ruta borrada. La suite de guardas queda en treinta y ocho casos verdes.
- **No se activó la visibilidad de las dos páginas nuevas en el menú.** Es la única integración que se retiene, porque expone pantallas nuevas a usuarios reales y la fase aún no está reverificada. Se aplicará cuando el tester dé su veredicto, y se le pidió recomendación expresa al respecto.

### Integración aplicada por el orquestador — contrato del reembolso — 2026-09-09
- El constructor de transcripción pidió que la función de reembolso **lanzara** en vez de devolver un booleano, para que ningún llamador pudiera ignorarla. **No se hizo así**, y conviene dejar escrito el motivo: en el patrón de cobro y reembolso automático, el reembolso ocurre dentro del bloque que atiende un fallo del proveedor, de modo que lanzar allí habría **enmascarado el error original**, que es justo la información que el llamador necesita.
- En su lugar se corrigió el punto que de verdad ignoraba el resultado: ese patrón ahora comprueba el reembolso y, si no se aplicó, deja rastro visible con la deuda viva antes de volver a lanzar el error original **intacto**. Afectaba al camino de correo, el otro usuario de esa función. Trece casos en verde, uno nuevo que fija exactamente ese comportamiento.
- Se pidió al tester que juzgue la decisión y la razone, en vez de darla por buena.


### Fase: F7 — Re-verificación de la ronda 3 — 2026-09-09
- Calificación: **9,0 / 10** (347 casos), desde 8,2. Los ocho fallos, los cuatro parciales y el ítem restante quedan **todos corregidos**, sin ninguna falsa declaración técnica.
- **El tester dio la razón al constructor en sus tres acusaciones** y corrigió sus propios instrumentos. Sobre el mismo HTML, su medidor por expresión regular contaba siete manejadores de eventos y un analizador real cuenta **cero**. Otro guion invocaba una función con los argumentos invertidos, y un tercero reasignaba sobre un espacio de nombres de módulo, que es de solo lectura.
- Y fue más lejos de lo que se le pedía: **reconoce que una afirmación de su propio informe anterior no estaba respaldada por ninguna ejecución**, porque el guion abortaba antes de llegar a medirla. Encontró además dos instrumentos defectuosos más que nadie le había señalado, uno que pasaba trivialmente y otro que era un valor escrito a mano en vez de una medición. Cinco instrumentos corregidos, ninguna corrección relaja lo que medían.
- Matiz honesto que se cobra a sí mismo: cuando midió los siete manejadores, el escapado **aún no existía en el código**, así que aquel hallazgo no fue inventado; lo defectuoso era el instrumento como herramienta de reverificación.
- Verificó con fechas de modificación que la distinción entre «ya estaba» y «hecho ahora» es honesta, que los ocho tests invertidos conservan escenario y salen **reforzados**, y que los casos del lote ejercen el camino real. Único reproche: se dijo haber sustituido la prueba por expresión regular y en realidad se añadió la ejecutada y se dejó la vieja.
- La previsualización se verificó **en navegador real con cuarenta y dos vectores**, todos inertes, incluidos cuatro de un tipo que el constructor no había probado.
- **Fallo nuevo, medio y visible para el cliente final**: el arreglo del escapado se propagó a donde no debía, así que el texto plano y la línea de vista previa de la bandeja de entrada salen con entidades en crudo. Una empresa llamada «Pérez & Asociados» se lee con el ampersand escapado. Lo delata que el bloque de columnas sí sale bien, lo que demuestra que nadie miró la salida en texto plano.
- Es la **tercera ronda seguida** en que un arreglo introduce un defecto propio, y esa es la razón principal de no alcanzar el listón.


### Fase: F4 — Re-verificación de la ronda 3 — 2026-09-09
- Calificación: **8,5 / 10**. Ocho ítems corregidos limpiamente, dos parciales, uno corregido pero sin ninguna prueba que lo cubra, ninguno sin corregir.
- **Sobre la afirmación fuerte del constructor**: el tester no se fió de su palabra, comprobó las **fechas de modificación** de los archivos y la dio por buena para los cuatro fallos del dinero, porque el código que los contiene se escribió después de cerrarse el informe anterior y no se tocó ese día. Para los casos de enmascarado el argumento no vale, porque ese archivo sí se modificó. Y le corrigió en dirección contraria: un ítem declarado «trabajo nuevo» vive en un archivo que no se tocó, así que ahí se acreditó trabajo de la sesión anterior.
- También verificó que **ninguna conversión de test debilitó las aserciones y que varias las endurecieron**, y que la suma de los dos movimientos de reembolso es exacta tanto por construcción como por ejecución.
- Confirmó que el defecto latente era real reproduciendo contra Postgres el error que se habría producido, y que los índices nuevos bloquean duplicados en la tabla real.
- **Fallo alto nuevo**: la comprobación del reembolso se añadió al cierre y **no al ajuste**, treinta líneas más arriba. Un ajuste a la baja rechazado sale informado como correcto, el libro mayor lo apunta como devuelto y la respuesta publica un importe que la organización nunca recuperó. Es la misma familia del fallo que se declaraba corregido.
- Segundo hallazgo incómodo: la prueba citada como evidencia de ese arreglo **sigue afirmando el defecto** y pasa solo por una coincidencia de vocabulario entre el mensaje y lo que el test busca.
- Y una declaración falsa que hay que retirar o hacer cierta: la mitigación del doble cobro de análisis no existe, porque ni la ejecución síncrona ni el modo forzado pasan por la clave de deduplicación.


### Fase: F7 — Ronda 3 — 2026-09-09
- El constructor distingue explícitamente lo que ya estaba aplicado por su sesión interrumpida de lo hecho ahora, para no acreditarse trabajo ajeno. Queda encargado al tester comprobar que esa distinción es honesta.
- Cerrados los dos hallazgos altos: el escapado cubre ahora las catorce propiedades de texto de los bloques, y la previsualización del editor deja de insertar HTML sin sanear, verificada **en navegador real** con dieciséis vectores, todos inertes.
- Cerradas las dos regresiones propias: un lote con varios remitentes aísla los fallos y deja lo no enviado reintentable; y el cifrado de credenciales pasa a un llavero con identificador de clave y migración progresiva automática, de modo que activarlo o rotarlo ya no destruye lo guardado, con marca de ilegible en la interfaz cuando de verdad no se puede descifrar.
- Sustituyó una prueba que inspeccionaba el código fuente con expresión regular por casos realmente ejecutados. Es la clase de cambio que sube la confianza de verdad.
- **Acusa a tres instrumentos del propio tester de estar defectuosos**: uno cuenta manejadores de eventos con expresión regular y los ve dentro de un atributo cerrado e inerte, otro invoca una función con los argumentos invertidos, y un tercero reasigna sobre un espacio de nombres de módulo, que es de solo lectura. La reverificación tiene como primera tarea juzgar esas acusaciones: un instrumento que inventa vulnerabilidades es tan dañino como uno que las pasa por alto.

### Integraciones aplicadas por el orquestador — 2026-09-09
- Corregido el comentario **falso** del fichero de ejemplo de entorno sobre la clave de cifrado de credenciales de correo: decía que sin ella las credenciales no se guardan, cuando en realidad la clave se deriva de otros secretos y sí se guardan cifradas. Ese comentario era el que inducía al fallo.
- **Corregido un doble de pruebas que mentía sobre la versión de la librería de firmas.** Reproducía la versión 1, en la que la verificación devolvía el contenido; la versión instalada es la 2, donde no devuelve nada. Esa mentira ocultó un fallo real de producción: todo webhook con firma **válida** reventaba mientras el test seguía en verde. El doble ya imita la versión instalada y se añadió una guarda que falla ruidosamente si la versión mayor cambia, para que el mismo agujero no pueda reabrirse. Veinticuatro casos en verde.


### Fase: F8 — Primera calificación — 2026-09-09
- Calificación: **3,5 / 10**. Veredicto: **la fase no está implementada**. Lo que hay es andamiaje de una versión anterior, con alta y baja de reglas y un ejecutor sin interfaz. Las once casillas de «hecho» están todas sin cumplir y ninguna de las migraciones que el propio plan pedía llegó a aplicarse.
- Matiz decisivo y honesto del tester: **no es un motor roto, es un motor desconectado**. No hay productor de eventos, no hay manejadores registrados en la cola y las tres tareas programadas del CRM están inactivas, así que hoy es imposible que envíe algo sin que una persona pulse. Por eso ningún hallazgo se marca como crítico, aunque varios pasarían a serlo el día que se conecte.
- **La acción más inocua del plan nunca ha funcionado**: crear una tarea escribe una columna que no existe y además un estado que la base rechaza, dos errores encadenados. Verificado por el orquestador: la columna correcta es otra y el estado válido es abierto, en curso, hecho o cancelado.
- **Inscripciones duplicadas sin freno**: no hay índice único y la función no comprueba nada, así que veinte inscripciones son veinte correos idénticos al mismo cliente.
- **La ruta de ejecución de secuencias es inalcanzable**: el middleware no la exime y devuelve una redirección incluso con el secreto correcto, de modo que su comprobación de credencial nunca llega a ejecutarse.
- **La ejecución miente**: una acción que falla deja la ejecución marcada como completada, un tipo desconocido se reporta como éxito, y un paso de condición no evalúa nada, así que una condición falsa manda el correo igual.
- El reclamo de trabajo no es atómico y dos trabajadores toman el mismo paso; ninguna de las seis rutas exige rol de administrador; y el envío de correo acepta el destinatario del cuerpo de la petición, saltándose el control de consentimiento. En secuencias sí se aplica, y ese contraste marca el camino del arreglo.
- Lo que el tester reconoce como bueno: el perímetro está cerrado en las catorce rutas, la seguridad por fila tiene política real en las ocho tablas, y la acción de actualizar un campo filtra por organización de verdad. La llama «el mejor trabajo que hay en estos dos archivos».
- **El tester corrigió sus propios falsos positivos de la sesión interrumpida** y lo dejó escrito: su simulacro de base no aplicaba los valores por defecto. Al arreglarlo, cinco de los seis casos afectados resultaron ser defectos reales que el falso positivo tapaba. Entrega noventa y tres casos, todos en verde, con los defectos vivos documentados por casos que afirman el comportamiento defectuoso.
- El tester se abstuvo deliberadamente de drenar la cola de trabajos: tiene treinta y tres trabajos vivos de otras fases y drenarla habría enviado mensajes reales a clientes reales.


### Fase: F6 — Primera calificación — 2026-09-09
- Calificación: **2,0 / 10**. El veredicto del tester es que **la fase no se ha empezado**: hay rutas y un servicio escritos, pero no completan ni una sola llamada, y el documento tiene sus veintisiete casillas de «hecho» sin marcar.
- **La fase no puede completar una llamada.** El despachador consulta una columna de «no llamar» que **no existe** en la tabla de clientes, y como no desestructura el error lo convierte en «Cliente no encontrado», de modo que el fallo real queda invisible. El documento de fase culpaba a la columna de zona horaria, que sí existe, y no mencionaba la verdadera en sus mil setenta y tres líneas: el plan tenía mal el diagnóstico. Verificado por el orquestador contra la base.
- **Marcación sin freno**: una campaña puede marcar unas cuatro mil trescientas veces al día contra un tope de cincuenta, porque el conteo diario excluye los intentos fallidos. Hoy solo lo contiene un accidente, que la tarea programada devuelve una redirección al no estar exenta en el middleware. En cuanto alguien la exima sin arreglar el tope, se abre la marcación contra clientes reales.
- **La petición literal del dueño no existe en ninguna capa**: no hay configuración del agente por etapa del embudo, ni tabla, ni servicio, ni pestaña en el diálogo de etapa.
- **La voz clonada no está simulada, está sin escribir**: no hay tabla de voces y la respuesta de voz no lee ningún identificador de voz ni declara proveedor de síntesis. El tester subraya que el 401 de la clave de ElevenLabs **no es el problema**: una clave válida no cambiaría nada porque la fase nunca intenta usar el proveedor.
- Lo único sólido son los dos puntos de seguridad perimetral, y el propio tester aclara que ese trabajo es de fundaciones, no de esta fase.
- Confirmación útil: la corrección de base del orquestador funciona. Mover a etapa ganada sin datos de venta deja la oportunidad abierta, sin fecha de cierre y con **cero comisiones**. Queda una incoherencia menor: la oportunidad aparece en «Ganada» y sigue abierta, y la herramienta del agente responde que tuvo éxito.
- El tester heredó su propia suite sin arrancar y la entrega con cincuenta y cinco casos en verde, tras descartar cinco casos mal construidos suyos y añadir diez nuevos.

### Fase: F4 — Ronda 3 — 2026-09-09
- El constructor sostiene que cuatro de los fallos del dinero y los cinco del enmascarado **ya estaban corregidos** por su sesión interrumpida, y que los tests fallaban porque afirmaban el comportamiento roto. Lo dejó escrito él mismo para no acreditarse trabajo ajeno. **Queda encargado al tester verificar esa afirmación caso por caso**, porque es justo el tipo de declaración que serviría para tapar un test debilitado.
- Trabajo nuevo: los siete literales sujetos a restricción de la base pasan por la comprobación de enumerado; el etiquetado deja de tragarse el error de inserción; el tiempo de reintento del panel se alinea con el del servicio; el tope de tamaño de audio pasa a ser el del proveedor efectivo y desaparece el mensaje con el límite antiguo.
- **Defecto latente que nadie había visto**: una inserción con resolución de conflicto nombraba un índice único que no existía, y habría reventado en cuanto el catálogo de objeciones dejara de estar vacío. Se aplicaron dos índices únicos por migración.
- Verificación declarada: ciento noventa y seis casos de la fase en verde, y ocho errores de compilación menos que la línea base, ninguno en archivos de la fase.


### Interrupción por límite de sesión y recuperación — 2026-09-09
- Ocho agentes cayeron a la vez al agotarse el límite de la sesión, varios **a mitad de edición**. El árbol quedó con siete suites rojas.
- Diagnóstico hecho antes de tocar nada, para no rehacer trabajo bueno:
  - En transcripción, el **enmascarado ya está reescrito y funciona**: los cuatro casos que fallan lo hacen porque afirmaban el comportamiento roto, que es justo lo que se corrigió. En cambio los tres fallos del dinero siguen abiertos y dos casos que antes pasaban se rompieron por la edición a medias.
  - En correo, dos casos rojos por la misma causa: el cifrado de credenciales y la comprobación de dominio quedaron a medio cambiar. El ajuste de la configuración de pruebas para cargar el analizador de HTML sí quedó completo y funciona.
  - Los testers de agente de voz y de automatizaciones alcanzaron a dejar sus suites escritas pero sin validar.
- **Falso positivo detectado y corregido por el orquestador**: el tester de automatizaciones acusaba al esquema de romper la inscripción en secuencias. La base dice lo contrario: el retardo del paso es entero obligatorio con valor por defecto, la fecha de inscripción es obligatoria con valor por defecto, y el canal de tarea sí está permitido. Su simulacro omitía un campo que la base real nunca deja vacío. Se le devolvió el caso con la evidencia.
- Lo que sí queda de ahí es una fragilidad real y menor: si el cálculo de la programación revienta, lo hace después de crear la inscripción, así que el contacto queda inscrito sin ningún paso programado y nadie se entera.
- Limpieza: se borraron tres archivos temporales que habían quedado sueltos en el repositorio.
- Relanzados en modo «inspecciona y completa, no rehagas»: los constructores de transcripción y de correo, y los testers de agente de voz y de automatizaciones.


### Fase: F9 — Re-verificación de la ronda 2 — 2026-09-09
- Calificación: **6,0/10** (58 casos). Salto real desde el 4/10 anterior: 15 de 29 hallazgos cerrados de verdad, la migración de base llegó y hace lo correcto, la regresión está limpia y las diez inversiones de tests son honestas.
- **Regresión crítica introducida por la propia ronda**: el filtro por canal resucitó el truncado silencioso que la ronda había cerrado. Con treinta y una visitas presenciales sobre un correo más antiguo y el filtro puesto en correo, el timeline devuelve **cero entradas** y declara que no hay más páginas.
- **Hallazgo transversal grave**: sembrar las marcas de etapa en la ronda anterior convirtió tres rutas vivas del código en generadoras de cierres sin datos de venta y de comisiones devengadas, porque escriben la etapa sin el estado. El servicio que se documenta como «único punto de cambio de etapa» no lo es.
- Más pérdidas silenciosas: el cursor del timeline trunca a milisegundos y las filas con microsegundos intermedios desaparecen para siempre, verificado contra la base real; y una conversación con más de doscientos mensajes en un día borra todo su historial anterior.
- El correctivo de estado no lleva guarda de versión y puede borrar el cierre de un escritor concurrente. El control de permisos del salto de gate se pasó de restrictivo y deja fuera a veintisiete miembros activos, incluido el perfil comercial. El simulador de base usado en los tests es ciego justo donde hay defectos, de modo que el timeline **no** tiene prueba de aislamiento entre organizaciones.

### Corrección de raíz aplicada por el orquestador — 2026-09-09
- El cierre por etapa se arregló en la **base de datos**, no en el servicio, porque tres rutas distintas escriben la etapa sin el estado y el problema habría vuelto por cualquiera de ellas.
- La función que sincroniza el estado con la etapa ya no deriva un desenlace terminal cuando faltan los datos de cierre: sin datos de venta no marca ganada, sin motivo no marca perdida, y en ambos casos deja la oportunidad abierta sobre la etapa terminal, que es un estado recuperable que la interfaz resuelve exigiendo el modal. La reapertura al salir de una etapa terminal queda intacta.
- Daño existente medido en producción: **una** oportunidad marcada como ganada sin datos de venta. Ninguna perdida sin motivo. Dos siguen en etapa terminal con estado abierto, pendientes de cerrarse desde la interfaz.
- La verificación por transacción con reversión quedó bloqueada por la política de permisos de la sesión; se comprobó en su lugar que la función desplegada contiene las dos guardas y conserva la reapertura. Queda encargada al tester de la ronda 3.


### Fases F5, F6 y F8 — Inventario previo a la primera calificación — 2026-09-09
- Estas tres fases figuraban como pendientes, pero el inventario del código muestra que **ya están construidas**: el diálogo de llamada desde el móvil, el servicio del agente de voz con sus campañas y las dos respuestas de voz que Twilio invoca, y el motor de automatizaciones con su servicio de secuencias, sus rutas de inscripción y ejecución, y las dos vistas del pipeline.
- Por eso no se lanzó un constructor sino un **tester adversarial por fase**, con el mismo método que las demás: verificación contra la base real, pruebas nuevas de concurrencia y de fallo del proveedor, sondas HTTP sin sesión y contraste afirmación por afirmación del documento.
- Prioridad marcada a cada tester: en el móvil, que la organización se resuelva solo desde el número ya guardado y que el aviso de grabación no se pueda desactivar; en el agente de voz, que la configuración por etapa llegue de verdad al comportamiento de la llamada y que ninguna campaña pueda llamar sin tope; en las automatizaciones, cualquier camino por el que se envíe algo a un cliente real sin control, que sería crítico.


### Fase: F4 — Re-verificación de la ronda 2 — 2026-09-09
- Calificación: **8,0/10** (229 casos). De los 17 fallos de la ronda 1: 12 corregidos limpiamente, 3 corregidos pero con un defecto nuevo, 1 parcial y 1 fuera de alcance bien declarado.
- Lo difícil salió bien: la inserción que siempre violaba la restricción de la base quedó corregida y demostrada contra la base real; el índice único existe y el código lo aprovecha como se debe, resolviendo el conflicto por relectura en vez de dejar escapar una excepción; la reconciliación por proveedor efectivo da números exactos; y la corrección no se pasó de frenada, porque un error temporal del proveedor sigue siendo reintentable.
- Lo que impide subir: **la corrección del dinero introdujo un problema del mismo tipo que arreglaba**. El ajuste a la baja y el reembolso del cierre no se conocen entre sí, así que una organización puede recibir casi el doble de lo que pagó, o perder el cobro adicional cuando el ajuste fue al alza. Además el reembolso no avisa cuando falla: devuelve un valor que nadie mira, mientras la fila anota que sí se devolvió. Y la rama del webhook quedó fuera de la protección, con el patrón exacto del fallo original, dormida hasta que se configure la credencial que falta.
- También: el enmascarado deja pasar una clave o un PIN en cuanto hay una preposición de por medio, y en cambio borra palabras en frases tan corrientes como «la clave está en el precio»; y el tope global de tamaño anula el mecanismo por proveedor recién construido, con los mensajes todavía hablando de un límite antiguo.
- Regresión limpia: mil tests, ninguna suite roja de esta fase, y once errores de compilación **menos** que la línea base.
- Corregido por el orquestador: el test de contrato del reembolso quedó obsoleto al pasar a la función dedicada de la base; actualizado, 37 casos en verde.
- Próxima acción: ronda 3 en curso.


### Fase: F3 — Ronda 2 — 2026-09-09
- Qué se hizo: los 19 hallazgos. Los estados terminales son ahora pegajosos también en el cierre y la duración nunca se sobrescribe con cero, reconciliando el cobro solo por la diferencia; el cliente y la oportunidad se validan contra la organización antes de escribir y los rechazos quedan registrados; el buzón de voz ya no liquida la llamada al contestar, sino al cerrarse con duración real. Además: verificación de que la subcuenta que firma pertenece a la organización en cinco rutas, rechazo de usar el número global de la plataforma como identificador de llamada, borrado de grabación solo cuando realmente se borró en ambos lados, consentimiento que empieza en falso, proveedor del softphone dividido de 533 a 289 líneas y atajo de teclado por fin operativo.
- Documentación corregida: la afirmación sobre una tabla de créditos inexistente se eliminó de todo el documento; los créditos viven en la configuración de comunicaciones y sí funcionaban.
- Verificación: suite del tester ampliada a 32 casos, 8 suites y 134 tests en verde, sin errores de compilación propios y limpieza confirmada por SQL.
- Integración aplicada por el orquestador: variable de política del identificador de llamada en el ejemplo de entorno.

### Fase: F7 — Re-verificación de la ronda 2 — 2026-09-09
- Calificación: **8,2/10** (236 casos). De los 15 ítems, 11 corregidos de verdad y 4 parciales; ninguno "solo documentado". La inyección original quedó cerrada: 16 vectores nuevos resultaron inertes y la política de seguridad se verificó servida por HTTP.
- **Dos hallazgos altos nuevos**: el escapado se quedó a medias en su propio terreno, porque las propiedades de texto libre de los bloques no se escapaban (se obtuvieron siete manejadores de eventos reales en el correo enviado); y la previsualización del editor inserta HTML sin sanear **fuera** del marco aislado, único punto de la fase donde eso ocurre.
- **Dos regresiones introducidas por los propios arreglos**: un lote con varios remitentes puede quedar a medias sin posibilidad de reintento, y activar el cifrado invalida en silencio las credenciales ya guardadas mientras la interfaz sigue diciendo que existen.
- Próxima acción: ronda 3 en curso.


### Fase: F0-DB — Ronda 4 — 2026-09-09
- Qué se hizo: migraciones 29–35 en producción.
- **WhatsApp entrante desbloqueado**: el disparador de identidades escribía el tipo de canal donde la restricción esperaba el tipo de identificador, y usaba el identificador del mensaje como valor de identidad. Se corrigió el disparador (no la restricción), porque los cinco lectores del código ya usan los valores correctos, y se añadió captura de excepción para que una identidad no vuelva a tumbar un mensaje. **Afectaba a los cuatro tipos de canal**, no solo a WhatsApp. Verificado en todos los caminos, incluida la apertura de la ventana de 24 horas.
- **Cierre de oportunidades corregido en la raíz**: la función ahora usa las marcas de etapa como fuente de verdad y no escribe la fecha de cierre. Sembrado de 14 filas guiado **solo por el nombre**, tras descartar con datos el criterio de probabilidad: la etapa "Ganado" de una organización tiene probabilidad 0 y ese criterio la habría marcado como perdedora. Las etapas ambiguas se dejaron intactas.
- **Dos minas encontradas al certificar las comisiones**: dos comparaciones de tipos incompatibles abortaban la transacción entera del cambio de etapa. Nunca habían saltado porque ninguna organización tenía comisiones configuradas sobre oportunidades. Corregidas y verificadas de extremo a extremo, con asiento contable incluido.
- Créditos: revocado el acceso de usuarios autenticados a las tres funciones tras comprobar que los diez llamadores usan cliente de servicio. El hallazgo de seguridad de la ronda 3 queda cerrado.
- **Cambio visible en producción**: en cinco organizaciones, arrastrar a "Ganado" o "Perdido" ahora exige el modal de cierre, porque el control por fin se dispara.
- Pendiente para F9: dos oportunidades quedaron en etapa terminal con estado abierto; deben cerrarse desde la interfaz, no por SQL, para que registren sus datos de cierre.


### Fase: F9 — Ronda 2 — 2026-09-09
- Qué se hizo: los 22 hallazgos atendidos. **Decisión de arquitectura**: las marcas de etapa ganada/perdida son la fuente de verdad y la probabilidad es solo informativa, porque una probabilidad de 0 es legítima en etapas de entrada (en una organización real dos etapas iniciales la tienen y el disparador las marcaba como perdidas). Mientras la migración no esté aplicada, el servicio corrige lo que escribe el disparador con el principio de "nunca una fecha de cierre sin motivo de pérdida o datos de venta", demostrado en base real para los dos escenarios.
- Timeline: cursor compuesto estricto en la consulta y corte seguro por número de filas, nulos tratados como fecha mínima en filtro, orden y mapeo, grupos de WhatsApp indivisibles, desempate por identificador en todas las fuentes.
- Tiempo real honesto: se declara solo lo que está publicado y se restaura el refresco por evento que se había eliminado. Además: permisos en el override del gate, cierre con datos antes de la petición, escritura optimista con reintento, plegado correcto del archivo de calendario y una sola carga de inteligencia por llamada.
- Sobre los tests del tester: afirmaban el comportamiento roto; el builder los invirtió conservando escenario y datos, y endureció el simulador de base de datos. El re-tester debe validar que esa inversión es legítima.
- Verificación: 61 suites y 909 tests en verde en todo el repositorio; sin errores de compilación propios.
- Integración aplicada por el orquestador: la barra de acciones usa ya el compositor de WhatsApp definitivo y se eliminó el provisional.
- **Sigue bloqueante para base de datos**: el disparador crea la comisión antes de que el código corrija el estado, así que puede quedar una comisión creada aunque la oportunidad vuelva a abierta. La ronda 4 lo resuelve.


### Fase: F16 — Ronda 2 — 2026-09-08
- Qué se hizo: los tres bloqueantes y los quince hallazgos restantes. La reclamación de contactos es ahora atómica con testigo por lote, verificada en vivo: dos ejecuciones en paralelo dan 8 mensajes para 8 destinatarios, donde antes daban 16. La materialización solo se invalida si cambian de verdad la audiencia, la plantilla o el propósito, con lo que el envío masivo desde el tablero ya se lanza. El error de los mensajes entrantes deja de tragarse: se lanza con el detalle de la restricción y el webhook responde de forma que el proveedor reintente. Además, validación de esquema en las veinte rutas, permisos en las rutas de gestión, la bandeja de chat enrutada por el servicio único y función Edge actualizada.
- **Hallazgo adicional**: la creación de clientes desde WhatsApp insertaba la identidad sin dos campos obligatorios, así que **fallaba siempre en silencio**. Corregido.
- El arreglo de fondo del entrante requiere migración (la petición, con su justificación de por qué se corrige el disparador y no la restricción, está en el informe y la ejecuta la ronda 4 de base de datos).
- Verificación: 8 suites y 78 tests; sin envíos reales; limpieza a cero, incluidos residuos de la ronda anterior.
- Integración pendiente: que el compositor de WhatsApp del tablero apunte al definitivo (archivo de F9, que está en su ronda 2).


### Fase: F7 — Ronda 2 — 2026-09-08
- Qué se hizo: los 14 fallos y 4 hallazgos atendidos. La página pública de baja escapa siempre todo texto dinámico y añade política de seguridad de contenido sin código en línea, más cabeceras de protección; los ajustes tipográficos, colores, alineaciones, medidas y direcciones se normalizan con listas permitidas y se revalidan al renderizar; los enlaces peligrosos se neutralizan en los dos motores, incluidos bloques que tenían el mismo agujero y no estaban señalados; la verificación de firma se prueba por fin contra la librería real en un proceso aparte, porque el entorno de tests no puede cargarla; el correo entrante cruza dominio y organización; los lotes se agrupan por remitente; el conflicto de estado deja reintentar al proveedor en vez de perder el contador en silencio; el envío de prueba se limita al propio usuario o a su dominio y deja constancia; las claves por dominio se cifran en reposo; y las doce rutas con cuerpo validan esquema.
- Verificación: 13 suites y 201 tests, con los adversariales de 61 a 70 y los seis que documentaban fallos invertidos; la inyección se demostró servida por HTTP con el manejador real, comprobando que sale escapada.
- Integración aplicada por el orquestador: clave de cifrado de credenciales en el ejemplo de entorno.
- Próxima acción: re-verificación en curso.


### Fase: F4 — Ronda 2 — 2026-09-08
- Qué se hizo: los 17 hallazgos atendidos; las suites del tester pasan de 135 a **151 casos, todos verdes**. La inserción de objeciones ahora usa el valor que la restricción admite y una verificación lanza error si un literal se sale del catálogo (dos restricciones que no estaban registradas en ningún sitio quedan documentadas); todo lo posterior al cobro de créditos va bajo un reembolso garantizado y deja de ser reintentable; el costo registrado se reconcilia con el proveedor que realmente respondió, y los créditos se ajustan al alza o a la baja según ese proveedor; se conserva el contenido previo al marcar un fallo; se validan los tamaños de audio que cada proveedor admite. Enmascarado de datos sensibles entregado con alcance deliberadamente estrecho.
- Integración aplicada por el orquestador: identificador de webhook de transcripción en el ejemplo de entorno y montaje de la tarjeta de política de IA en la pestaña de proveedores.
- Verificación: inserción de objeciones demostrada en base real (y el valor antiguo rechazado por la restricción), reembolso comprobado, limpieza confirmada.

### Fase: F3 — Ronda 1 evaluada — 2026-09-08
- Calificación Tester: **7,5/10** (122 casos, 103 pasan, 19 fallos), sin una sola llamada real.
- Altos: un cierre tardío degrada un estado ya terminal y borra la duración dejando cobrado el tiempo; el cliente y la oportunidad no se validan contra la organización (una llamada quedó con un cliente de otra organización); el buzón de voz liquida la llamada al contestar y luego el cierre real ya no cobra los minutos consumidos.
- Medios: búsquedas de llamadas sin filtrar organización, identificador de llamada saliente cayendo al número global de la plataforma, una URL de webhook que da 404, borrado de grabación que se da por bueno aunque falle, consentimiento marcado sin anuncio, el proveedor del softphone con 533 líneas y el atajo de teclado inoperante.
- Funciona y quedó verificado: firma obligatoria en las 11 rutas de voz, la ruta antigua revalida la firma y rechaza una cruzada, idempotencia del TwiML byte a byte, la máquina de estados resiste desorden y repeticiones, y el ciclo completo de grabación contra la base y el almacenamiento reales, incluido el corte por saldo.
- Próxima acción: ronda 2 en curso.


### Fase: F0-DB — Ronda 3 — 2026-09-08
- Qué se hizo: migraciones 17–28. Columna de costo real en los registros de uso de IA y comunicaciones; función de reembolso de créditos; vigencia en la tabla de precios; **créditos de comunicación con fallo cerrado**; restricción de unicidad que impide dos actividades por llamada; nuevo precio de audio; ampliación de estados de contactos de campaña; publicación de notas en tiempo real e índices del timeline.
- **Agujero grave corregido**: la función que descuenta créditos de comunicación devolvía "permitido" cuando la organización no tenía fila de configuración, y **52 de 83 organizaciones estaban en ese caso**; una de ellas ya acumulaba 11 envíos sin control. Se sembraron las 52 con el cupo de su plan y la función ahora falla cerrada, con bloqueo real de fila (había carrera) y ruta de búsqueda fija.
- **Vulnerabilidad encontrada**: las funciones de créditos aceptan un identificador de organización arbitrario y admiten importes negativos, y estaban expuestas al rol anónimo: cualquiera podía regalarse créditos de otra organización. Cerrado para anónimo; el orquestador corrigió además la única ruta que las llamaba con cliente de sesión, de modo que en la ronda 4 se pueden revocar también para usuarios autenticados.
- Dos migraciones corrigen a otra de la misma ronda, tras medir contra datos reales: el tope de reembolso habría anulado el reembolso al 71 % de las organizaciones, y una de ellas había neutralizado el reembolso de créditos no usados de campañas.
- Descartada con datos la optimización del timeline en base de datos: la consulta real tarda 0,158 ms.
- **A vigilar en producción**: 21 organizaciones de plan gratuito y 8 de plan empresarial quedan con saldo 0 y no podrán enviar hasta configurarlas explícitamente. Es el objetivo buscado, pero conviene anticiparlo.


### Fase: F16 — WhatsApp — Ronda 1 evaluada — 2026-09-08
- Calificación Tester: **6,5/10** (106 casos, 88 pasan, 18 fallos). Los tres bloqueantes son de una línea cada uno; con ellos la fase quedaría en 9.
- **Bloqueante 1 (preexistente del sistema, no de esta fase)**: ningún mensaje entrante de WhatsApp puede guardarse. Un disparador antiguo escribe un tipo de identidad que la propia restricción rechaza, la inserción se revierte entera y el error se traga en silencio. Evidencia: hay 17 mensajes entrantes en la base y ninguno con identificador externo. Sin entrantes no hay ventana de 24 horas, ni bajas por palabra clave, ni atribución de respuestas.
- **Bloqueante 2**: dos lotes concurrentes duplican todos los envíos, porque la reclamación de contactos filtra por un campo que no se actualiza (8 destinatarios → 16 mensajes).
- **Bloqueante 3**: el envío masivo desde el tablero nunca se lanza si el usuario pulsa "Calcular" antes de "Enviar".
- Aguantó: ventana de 24 horas correcta, bajas con fallo cerrado, forma única de mensaje compatible con la función desplegada, materialización idempotente, estados siempre dentro de las restricciones, 13 rutas protegidas y aislamiento por organización. Sin regresión en el canal con tráfico real.
- Próxima acción: ronda 2 en curso; el bloqueante 1 requiere migración.


### Fase: F4 — Transcripción y análisis — Ronda 1 evaluada — 2026-09-08
- Calificación Tester: **7,5/10** (166 casos, 149 pasan, 17 fallos). El núcleo aguanta el maltrato: la cascada de proveedores no pierde el trabajo en ningún orden de fallos, la idempotencia por llamada es real, las validaciones respetan las restricciones reales y no hubo ninguna fuga entre organizaciones en 135 casos (incluido un webhook con organización falsificada).
- Fallos altos: una inserción de objeciones usa un valor que la restricción de la base de datos no admite, así que **nunca** se aplica y el error se silencia; un fallo posterior a la llamada al modelo se trata como reintentable y **cobra créditos tres veces sin reembolsar**; la tarjeta de configuración de la política de IA está construida pero no se renderiza en ninguna parte, pese a que el informe afirmaba lo contrario.
- Medios: el costo registrado dice ser real y es estimado (modelo de un proveedor con tarifa de otro); los créditos se cobran a la tarifa del proveedor estimado; falta la restricción de unicidad que evita dos actividades por llamada; una transcripción atascada deja la interfaz sin salida; se aceptan audios que ningún proveedor puede procesar; y se editaron dos archivos de la zona exclusiva de F3 sin declararlo.
- Próxima acción: ronda 2 en curso con los 17 hallazgos.


### Fase: F7 — Email — Ronda 1 evaluada — 2026-09-08
- Calificación Tester: **8,0/10** (202 casos, 188 pasan, 14 fallos). El backend es el más sólido del ciclo hasta ahora.
- **Fallo crítico**: inyección de código almacenada en la página pública de baja de suscripción (el nombre de la organización se interpola sin escapar). Es accesible sin sesión, en el dominio de la aplicación, y va enlazada desde todos los correos de marketing.
- Otros altos: un ajuste tipográfico libre permite romper el atributo de estilo e inyectar controladores de eventos en el HTML guardado y enviado; los enlaces `javascript:` sobreviven en el modo HTML crudo (el modo de bloques sí los bloquea).
- Medios: el arreglo de la verificación de firma no tiene test con la librería real; el correo entrante no cruza dominio y organización; los lotes con dominios mixtos salen todos por el mismo remitente; un contador puede perderse en silencio; el envío de prueba salta la comprobación de consentimiento.
- Aguantó todo lo esencial: fila creada antes de enviar, idempotencia, una sola actividad, consentimiento y firma con fallo cerrado, estados que no degradan, contadores sin carrera, programación, adjuntos, baja obligatoria en marketing, correo entrante completo y las 18 rutas protegidas sin sesión.
- Próxima acción: ronda 2 en curso, con la inyección y los dos huecos de escapado como prioridad.


### Fase: F3 — Telefonía (softphone y grabación) — Ronda 1 — 2026-09-08
- Calificación QA: pendiente · Tester: en curso
- Qué se hizo: softphone montado globalmente con carga perezosa y estado explícito cuando la telefonía no está configurada; TwiML saliente originado en el navegador con aviso de grabación audible para el cliente y grabación de doble canal; cierre de llamada con mapeo de estados, duración y liquidación de créditos; grabación encolada, descargada y almacenada con retención; entrantes unificados en una sola ruta; ficha de resultado de llamada que actualiza la oportunidad; pestaña de configuración de telefonía.
- Verificación: 0 errores de compilación propios, guardarraíles 38/38 sin excepciones, 781 tests en verde (única suite roja: editor de sitios web, ajena). Llamada firmada de extremo a extremo probada: sin firma 403, con firma válida el TwiML correcto y las filas creadas; reintento idéntico sin duplicar (corrigió una fuga de idempotencia detectada en el momento).
- Desviación deliberada: la ruta antigua de entrantes delega internamente en vez de redirigir, para no forzar un salto extra por llamada ni recalcular la firma.
- Incidencia resuelta: había cuatro servidores de desarrollo compartiendo caché y corrompiéndola; dejó uno solo.

### Fase: F9 — Ficha 360 — Ronda 1 evaluada — 2026-09-08
- Calificación Tester: **4/10** (66 casos, 22 fallos, 2 críticos). Arquitectura correcta y muy superior a lo anterior, pero con tres problemas de fondo.
- Fallos críticos: (1) el cambio de etapa cierra oportunidades como ganadas o perdidas sin datos de cierre, porque el servicio usa las marcas de etapa y el disparador de la base de datos usa la probabilidad, y en las organizaciones reales ninguna etapa tiene esas marcas; (2) el timeline pierde y repite entradas al paginar (cursor inclusivo, timestamps nulos, grupos de WhatsApp duplicados, seis de ocho fuentes sin desempate).
- Otros: el tiempo real anunciado no funciona (las tablas no están publicadas) y se eliminó el refresco por evento que existía; el override del gate no comprueba permisos; fuga de mensajes de WhatsApp de otras oportunidades del mismo cliente.
- Próxima acción: ronda 2 en curso con los 22 hallazgos priorizados; el arreglo de fondo del punto 1 requiere una migración (redefinir el disparador y sembrar las marcas de etapa).


### Fase: F16 — WhatsApp individual y masivo — Ronda 1 — 2026-09-08
- Calificación QA: pendiente · Tester: en curso
- Qué se hizo: servicio de envío único que escribe en `messages` con la forma viva y deja despachar al disparador existente, ventana de 24 horas, consentimiento, plantillas HSM (sincronización, envío a aprobación y estados por webhook), arreglo del mensaje entrante de la API de Meta (insertaba columnas inexistentes), campañas con materialización idempotente y exclusiones, handler de lotes con límites de ritmo y códigos de error de Meta, función Edge desplegada v6→v7, rutas y UI de composición, hilo, plantillas y campañas.
- **Dos bugs encontrados al ejecutar el flujo, ninguno detectado por los tests**: (1) la audiencia no validaba su origen, así que una campaña con un valor mal escrito se materializaba con cero contactos en silencio; (2) el texto plano no pasaba por el motor de variables, de modo que una campaña habría enviado literalmente `Hola {{nombre}}` al cliente. Ambos corregidos y verificados.
- Verificación: 6 suites / 57 tests verdes; campaña de 4 contactos ficticios recorrida de principio a fin con limpieza confirmada por SQL; sin mensajes reales enviados (el canal de prueba no tiene credenciales de Meta).
- Riesgo residual: las ramas de plantilla, multimedia y Twilio de la función Edge nunca se han ejercitado contra un proveedor real porque ninguna organización tiene credenciales; el primer envío real merece vigilancia.


### Fase: F4 — Transcripción y análisis IA — Ronda 1 — 2026-09-08
- Calificación QA: pendiente · Tester: en curso
- Qué se hizo: adaptadores de transcripción (ElevenLabs Scribe, Gemini, OpenAI) con cascada por organización, asignación de roles agente/cliente por canal, transcripción con reintento y cobro previo de créditos, análisis con esquema en español (resumen, sentimiento, calidad, objeciones, próximos pasos, etapa sugerida validada contra el pipeline, etiquetas, temperatura), actividad única por llamada con actualización de la oportunidad y notificación al vendedor, handlers encadenados, rutas de transcripción y análisis, carga manual de audio y paneles de UI.
- **Verificación real de extremo a extremo**: audio de 56 s con diálogo comercial en español → transcripción en 19,4 s (117 palabras, 16 segmentos) → análisis en 66,4 s (sentimiento positivo, calidad 65, etapa sugerida con confianza 0,95, dos tareas, temperatura alta) → una sola actividad enlazada a la llamada, oportunidad actualizada, etiqueta automática y notificación. Datos de prueba eliminados.
- Cuatro correcciones surgidas de la prueba: `gemini-2.5-flash` responde 404 para claves nuevas (default cambiado a `gemini-3.8-flash` por el orquestador en el registro, el catálogo y su test, 35 verdes); los SKU de precios consultados no existían; el registro de uso guardaba el modelo estimado en vez del realmente usado; un test acoplado a un literal.
- **Bloqueante externo**: `ELEVENLABS_API_KEY` responde 401 (clave inválida). Sin ella no hay diarización real y la cadena cae a un proveedor sin separación de hablantes, mostrando todo como "agente". Requiere una clave válida del dueño.


### Fase: F7 — Email profesional — Ronda 1 — 2026-09-08
- Calificación QA: pendiente · Tester: en curso
- Qué se hizo: módulo de email completo (12 tipos de bloque con zod, motor de variables con rutas anidadas/valores por defecto/filtros y escape, render con React Email más saneado del HTML crudo, servicio de dominios contra la API de Resend con clave por dominio, envío con idempotencia determinista y consentimiento verificado, webhook con estados monótonos e idempotencia, correo entrante que crea actividad y adjuntos, baja pública firmada, redacción con IA con cobro previo de créditos, handler de cola para programados y lotes); editor visual de bloques con arrastrar y soltar, editor HTML, previsualización en iframe, selector de variables y plantillas, página `/app/crm/plantillas` y pestaña de configuración de Email.
- **Bug crítico encontrado en verificación real**: con `svix` 2.x, `Webhook.verify()` devuelve `void` (en 1.x devolvía el payload), así que **todo webhook de Resend con firma válida respondía 500**. Los tests no lo veían porque simulaban la librería. Corregido por el orquestador en la raíz (`src/lib/security/webhookSignatures.ts`): se parsea el cuerpo tras validar la firma y el JSON inválido devuelve 400. 85 tests de seguridad y email en verde tras el arreglo.
- Integración aplicada por el orquestador: variables de email en `.env.example` e import de `WhatsAppTab` en `CrmConfigTabs.tsx` (F16 lo había dejado usado sin importar, rompiendo la compilación).
- Pendiente para F9: montar el compositor de email completo y la tarjeta de previsualización en el timeline, y retirar los `mailto:` restantes.


### Fase: F0-JOBS — Ronda 2 — 2026-09-08
- Calificación QA: pendiente (procede re-test)
- Qué se hizo: los diez hallazgos del tester atendidos. `scheduler.ts` con productor real de mantenimiento (inline idempotente, porque `outbound_jobs.organization_id` es NOT NULL) y `recording_cleanup` delegado al handler de F3 con singleton diario por organización; kinds inválidos → 400 en la ruta y `claimed:0` en el runner; `fn_release_job` al liberar por deadline sin quemar intentos; `noop` verificado contra el CHECK real; `isOrgAdminContext` en retry y lectura admin/manager; `payload_preview` redactado por allow-list; purga de `failed|dead` y eventos fallidos a 30 días con resync acotado a 3 intentos; documentación y `JobsMonitor` alineados.
- Verificación: 7 suites / 44 tests verdes (incluidos los 14 que añadió el tester), guardarraíles 38/38, tsc acotado en 0, respuestas 401/400/200 correctas y smoke con la cola limpia al final.
- Hallazgo de entorno: los varios `next dev` del repo comparten un `.next` con caché de webpack corrupta que tumba rutas API (`TypeError: Cannot read properties of undefined (reading 'call')` al cargar `server-service.ts`). No es fallo de código; requiere parar los servidores, borrar `.next` y levantar uno solo antes del E2E.
- Pendiente: activar los jobs `pg_cron` 17/18/19 tras el despliegue.


### Fase: F9 — Ficha 360 (timeline, QuickActionsBar, drawer, Kanban) — Ronda 1 — 2026-09-08
- Calificación QA: pendiente · Tester: en curso
- Qué se hizo: timeline v2 (8 fuentes, cursor estable, dedupe por activities.call_id/email_message_id/message_id) + GET /api/crm/timeline/[type]/[id]; POST /api/crm/activities con zod; PATCH /api/crm/opportunities/[id]/stage con gate y override registrado; /api/crm/meetings; QuickActionsBar (llamar navegador/celular/agente, email, WhatsApp, reunión, tarea, nota) montado en tarjeta, drawer, detalle y ficha de cliente; OpportunityTimeline con entradas por tipo, realtime y paginación; drawer con tabs conservando toda la funcionalidad previa; KanbanBoardV2 con gates, realtime, cierre ganada/perdida y drag sin robar el clic; eliminados PipelineStages/KanbanBoard/KanbanColumn/OpportunityCard y ActivityActions; 23 tests nuevos de guardarraíl de rutas. tsc de F9 en 0 errores; 29 suites / 264 tests verdes.
- Hallazgo de entorno (crítico): el servidor de `localhost:3000` sirve otro checkout (`pagina-web-go-admin-erp-1`) → toda verificación previa por navegador contra 3000 es inválida. Servidor canónico de este repo: **http://localhost:3002**.
- Qué falta: verificación visual con sesión (requiere credenciales de prueba del dueño); modo "Agente IA" (F6); adjunto .ics (F7); `notes` en la publicación de realtime (DB); RPC `fn_crm_timeline` como optimización.


### Fase: F0-SEC — Ronda 1 — 2026-09-08
- Calificación QA: pendiente · Tester: en curso
- Qué se hizo: helpers `getServiceClient`, `server-user`, `src/lib/crm/enums.ts` + fixture `db-checks.json` (25 CHECKs reales), `src/lib/security/{webhookSignatures,rateLimit,wsSessionToken}.ts`; `orgContext.ts` reescrito (resolveOrgFromExternal con service role — C0; org activa por header/cookie/last_org_id; requireOrgAdmin; withOrg/withCron); 43 rutas endurecidas (IA con sesión y org de sesión, JWT hardcodeado fuera, twilio/verify con sesión + rate limit, send-*/credits/usage org de sesión, incoming-message con XML escapado y STOP→contact_consents, voice/* con firma siempre y scoping, whatsapp/send con shape viva de messages, webhook WA con firma Meta fail-closed, dispatch-pending con CRON_SECRET y polling del browser eliminado, sendgrid/notifications con ownership, update_field con allow-list); ws-server con token de sesión + firma en el upgrade; eliminados followup/run + followupEngineService, callService.ts, media-stream. middleware.ts: exclusión de /api/voice/ y dispatch-pending (antes 307 a login para todos los webhooks de voz). 5 suites / 63 tests verdes.
- Pendientes que deja: `email/webhook` y `sendgrid/webhook` siguen detrás del middleware; `verifyElevenLabsWebhook` (F4); Vault para token de subcuenta; env del dueño: WS_SESSION_SECRET, WS_PUBLIC_URL, META_APP_SECRET, TWILIO_WEBHOOK_BASE_URL = origin.

### Fase: F0-REG — Ronda 1 — 2026-09-08
- Calificación QA: pendiente · Tester: en curso
- Qué se hizo: npm (twilio 6.1, voice-sdk 2.18.4, resend 6.26, elevenlabs-js 2.67, @google/genai 2.21, react-email components/render, sanitize-html; openai se queda en 6.x con Node 20, plan a 7.x documentado); `providerCatalog.ts`, `providerRegistry.ts` reescrito (placeholders no cuentan; sin lectura de credentials desde cliente), `providerCredentials.server.ts`; `pricingService`, `aiCostService` (RPC antes del proveedor, reembolso), `aiCreditsService` con RPC atómico; endpoints /api/crm/config/{providers, providers/test, credits}; UI `CrmConfigTabs` (General | Proveedores e IA | Créditos y sistema con JobsMonitor); `src/config/crmNav.ts` consumido por AppLayout/moduleConfig; .env.example; Dockerfile ws con lockfile; código muerto eliminado (voiceAgent/{realtimeSession,elevenLabsTTS,deepgramSTT,voiceAgentService}, EmailNotifications.*, AutomationSettings). 56 tests. tsc 230→228.
- Pendientes que deja: columnas cost_amount en ai_usage_logs/comm_usage_logs, RPC refund_ai_credits (DB); guardrails.test.ts:469 TS1501 y svix ESM en jest (SEC); PR Node 22 + openai 7.

### Ola 2 — arranque — 2026-09-08
- Interrupción por límite de sesión (2026-09-08 tarde): F3, F4, F7, F9, F16, JOBS r2 y los testers de SEC/REG quedaron a medias con archivos parcialmente escritos; relanzados en modo "inspeccionar lo existente y completar, no rehacer".
- 2026-09-08 noche: segundo corte por límite de modelo (Fable agotado → sesión cambiada a Opus 5). Estado del árbol medido: `tsc` 244 errores (baseline 230 → 14 nuevos en 9 archivos de trabajo a medias) y jest 20/23 suites verdes (6 tests rojos). Se creó `scratchpad/shared-files-protocol.md` con propiedad exclusiva por agente y lista de archivos compartidos que solo integra el orquestador (`jobs/handlers/index.ts`, `CrmConfigTabs.tsx`, `crm/index.ts`, `crmNav.ts`, `middleware.ts`, `vercel.json`, `package.json`, `guardrails.test.ts`, `.env.example`), porque F7 había sobrescrito cambios de F3.
- Relanzados en modo "inspeccionar y completar": F9, F3, F4, F7, F16 y JOBS r2. F4 ya había logrado un ciclo real transcribe→done contra la BD antes del corte.
- Lanzados builders F9 (timeline unificado, QuickActionsBar, drawer con tabs, KanbanBoardV2), F4 (STT ElevenLabs/Gemini/OpenAI + análisis + actividad automática + modo manual), F7 (email backend: bloques, variables, render, dominios Resend, envío, webhook, inbound, IA, página de plantillas), F3 (softphone global, TwiML client-originated, dial-complete, grabación → job recording_fetch, entrantes, créditos, Telefonía tab) y F16 (WhatsApp outbound por messages + trg_channel_dispatch, plantillas HSM, ventana 24h, campañas + campaign_batch, Edge Function, compose y campañas UI). Testers SEC/REG/DB-r2/JOBS-r2 en curso.


### Fase: F0-DB — Ronda 1 — 2026-09-08
- Calificación QA: pendiente
- Calificación Tester: 8/10 (62 casos, 58 pasan; 4 fallos: `noop` en código y no en CHECK [alto], `fn_can_contact` fail-open con canal inválido [medio], `auth_rls_initplan` en 15 políticas [medio], grants de escritura en vistas [bajo])
- Qué se hizo: 11 migraciones `crm_v4_f00_01..11` en producción: CHECKs reconciliados (activities +sms/meeting/ai_call/task, sentiment +mixed, purpose_type +sell_product/book_meeting), columnas (activities.call_id/email_message_id/message_id/conversation_id, messages.related_opportunity_id, customers.timezone, templates.blocks_json/engine/version/preheader, conversations.last_inbound_at con backfill 20 465 filas, call_recordings.updated_at), bucket privado `crm-call-recordings` + políticas (también para `crm-documents`, que no tenía), tablas outbound_jobs/crm_events/contact_consents/provider_pricing/user_comm_preferences con RLS, RPCs fn_enqueue_job/fn_claim_jobs/fn_complete_job/fn_fail_job/fn_emit_crm_event/fn_can_contact/fn_seed_provider_configs/fn_crm_cron_post/fn_unit_cost, triggers de outbox en opportunities, privilegios de provider_configs/comm_settings, seeds (pricing 29 filas; provider_configs 372 filas/31 orgs), realtime en 7 tablas, 3 jobs pg_cron inactivos, secretos en Vault. Verificación funcional completa en rollback.
- Qué falta / feedback: P1–P8 (noop, fn_can_contact, initplan, grants vistas, límites bucket documentos, cron diario, fn_release_job, crm_events.attempts/last_error).
- Próxima acción: DB ronda 2 en curso con P1–P8.

### Fase: F0-DB — Ronda 2 — 2026-09-08
- Qué se hizo: migraciones `crm_v4_f00_12..16`: `noop` en el CHECK, `fn_can_contact` fail-closed por canal, `(select auth.uid())` en 21 políticas (advisors initplan de F0: 21→0), vistas solo lectura, límites del bucket `crm-documents` (25 MB, 28 MIME incl. octet-stream porque la UI no fija `accept`), `fn_crm_cron_post(p_path, p_body)` y jobs 18/19 con body de kinds, `fn_release_job`, `crm_events.attempts/last_error`. Verificado en rollback.
- Próxima acción: qa-reviewer de F0-DB cuando termine JOBS r2; activar pg_cron tras desplegar el runner.

### Fase: F0-JOBS — Ronda 1 — 2026-09-08
- Calificación QA: pendiente · Tester: en curso
- Qué se hizo: src/lib/jobs/** (types, registry, enqueue, runner con deadline/timeout/AbortSignal, handlers noop/crm_event/maintenance + placeholders recording_cleanup/campaign_batch, eventDispatcher + listener stageChangedActivity), /api/crm/jobs/run (fail-closed, maxDuration 60), /api/crm/jobs + [id]/retry, jobsService, JobsMonitor.tsx, vercel.json (+3 crons), middleware (exclusión de la ruta), scripts/crm-jobs-smoke.ts, 11 tests + guardarraíles (15/15). Smoke real OK contra BD y localhost.
- Calificación Tester (ronda 1): 6/10 (50 casos; 10 fallos: maintenance/recording_cleanup sin productor [alto], kind inválido drena toda la cola, liberación por deadline quema intentos, `noop` fuera del CHECK, guardarraíles 5/7 rojos por archivos ajenos, admin check divergente, payload_preview sin redacción, retención incompleta, docs desactualizadas, JobsMonitor etiquetas). Tester añadió 14 tests (handlers, timeout).
- Próxima acción: JOBS ronda 2 con F-1…F-10 (en curso); DB ronda 2 añade noop y fn_release_job.

### Fase: PLAN-V4 / ANEXO-A / ANEXO-B / ANEXO-C — Ronda 2 — 2026-09-08
- Qué se hizo (builder DOCS): ANEXO-C-RECONCILIACION-2026-09.md (518 L, conteos reales, 10 tablas de una política, H1–H6, reconciliación F01/F02/F10–F15, seeds concretos), PLAN.md §7.2 olas de ejecución + riesgos, ANEXO-B corregido (10 puntos del tester), FASE-00 fe de erratas, ANEXO-A 267→656 L, cabeceras "Estado V4" en FASE-01/02/10/11/12/13.
- Hallazgos nuevos verificados: `messages` tiene 255 144 filas (no 4 344); `comm_usage_logs` solo tiene política SELECT; la UI de configuración de F1/F2/F12/F13 sí existe en `configuracion/panels/crm/sections/*` (4 047 L); 6 componentes V3 sin importadores (ObjecionesList, DiscoveryWizard, ProposalBuilderDialog, OnboardingChecklist, HoyView, FunnelView); `forecastService.ts` no existe aunque F14 lo marca ✅; `opportunity_stage_history` con 0 filas pese al trigger.
- Próxima acción: QA de documentación al cierre de la Ola 1.


### Fase: Documentación V4 (11 documentos) — Ronda 1 — 2026-09-08
- Calificación QA: pendiente (testers parciales por límite de sesión)
- Calificación Tester: FASE-00 6/10 (78 casos, 22 fallos: outbox sin consumidor, M6 vaciaba channel_credentials, privilegios de provider_configs, dedupe_key, fn_fail_job sin guardas, org E2E sin miembros…); ANEXO-B 7/10 (108 casos, 10 fallos: env vars mal marcadas, snippet Resend camelCase, answerOnBridge no verificado…); F3/F5, F4/F9, F7/F16 testers interrumpidos (se relanzan en ronda 2).
- Qué se hizo: 7 builders escribieron PLAN.md (921 L), ANEXO-A (267 L), ANEXO-B (1081 L), FASE-00 (1099), FASE-03 (912), FASE-04 (999), FASE-05 (637), FASE-06 (1073), FASE-07 (1082), FASE-08 (843), FASE-09 (890), FASE-16 (1062, nuevo). Hallazgos nuevos verificados por builders: callManagementService.ts:307/:322 (status 'queued', duration_source null), callAnalysisService.ts:691-692 (priority 'medium', status 'pending' inválidos), whatsappCloudService.ts:413-423 (inbound inserta columnas inexistentes en messages → el inbound Cloud no puede funcionar), pg_cron job 4 con JWT service_role en claro, bucket crm-documents sin políticas.
- Qué falta / feedback: correcciones de tester-F00-r1 y tester-ANEXO-B-r1 (en scratchpad) → las aplica DOCS en ronda 2 y los builders de implementación las incorporan directamente.
- Próxima acción: el dueño pidió pasar a EJECUCIÓN. Ola 1 de implementación = F0 en 4 partes paralelas (DB, SEC, JOBS, REG) + DOCS (PLAN v4 ejecución, ANEXO-C reconciliación, correcciones).


### Fase: Análisis previo V4 — Ronda 0 — 2026-09-08
- Calificación QA: n/a (análisis, sin código)
- Calificación Tester: n/a
- Qué se hizo:
  - Cuatro auditorías de código en paralelo (UI del CRM, telefonía/voz, email/WhatsApp/SMS, IA/agentes/automatizaciones) verificadas contra el schema live de Supabase (`jgmgphmzusbluqhuqihj`).
  - Siete investigaciones de documentación oficial (sep-2026): Twilio Voice, Twilio Messaging, ElevenLabs, OpenAI, Gemini, Resend, Meta WhatsApp + Cal.com/Google Calendar.
  - Consolidación en un brief con decisiones de arquitectura D1–D9 y estructura obligatoria de 13 secciones por documento de fase.
- Hallazgos críticos (resumen; detalle en `ANEXO-A-INVENTARIO-ACTUAL.md`):
  1. [crítico] 30+ tablas del plan V3 existen con 0 filas: nada del flujo de llamadas/agentes/secuencias ha operado nunca.
  2. [crítico] `resolveOrgFromExternal` (src/lib/utils/orgContext.ts:85-93) crashea en todos los webhooks de Twilio → ninguna llamada puede registrarse.
  3. [crítico] Softphone nunca registra (faltan API Key/Secret/TwiML App SID; `provider_configs` vacío); montado solo en `/app/crm/llamadas`, sin entrada en el nav.
  4. [crítico] Inserts en `calls`/`call_recordings` violan los CHECK de la BD; bucket `crm-call-recordings` no existe; transcripción busca `status='available'`.
  5. [crítico] Ningún cron (Vercel ni pg_cron) ejecuta secuencias, seguimientos ni campañas de agentes IA.
  6. [crítico] Seguridad: endpoints IA sin auth con `organizationId` del body, `twilio/verify/*` sin auth (SMS pumping), IDOR en `whatsapp/send` y `twilio/send-*`, webhook WhatsApp sin firma, `followup/run` fail-open, fallback "primera org activa" en 3 sitios.
  7. [alto] Botones del pipeline: click-to-call llama a ruta inexistente; WhatsApp falla 400/401; plantillas de email a ruta inexistente.
  8. [alto] Agente de voz: config de `voice_agents` nunca se lee; handler es un recepcionista de hotel; tool-calls rotos; sin voz ElevenLabs; tools CRM muertos.
  9. [alto] Timeline unificado (`timelineService`, 6 fuentes) con cero consumidores; llamada nunca genera `activities`.
  10. [alto] Cuatro motores de automatización paralelos y desconectados.
- Próxima acción: ronda 1 de documentación con 7 builders en paralelo → tester (verificación de archivo:línea, columnas, APIs) → qa-reviewer → iterar hasta ≥ 9.5.

---

# (Histórico V3)

# PROGRESS — CRM Revenue OS

## 2026-09 — Plantillas preestablecidas en "Crear Nuevo Pipeline" + provisión automática

**Decisión:** cuando el usuario abre "Crear Nuevo Pipeline" en el dropdown del
`PipelineHeader`, ahora ve un selector de plantillas preestablecidas además del
campo de nombre. Ambos campos son independientes: el usuario elige una plantilla
(que define las etapas) y escribe el nombre que quiera.

**Plantillas disponibles** (`src/lib/services/crm/pipelineTemplates.ts`):

| Key | Label | `pipeline_type` | Etapas |
|---|---|---|---|
| `blank` | Pipeline en blanco | `null` | 0 — etapas manuales |
| `sales` | Ventas | `sales` | 9 — Lead nuevo → ... → Contrato/pago → Perdido |
| `onboarding` | Onboarding | `onboarding` | 7 — Kickoff → ... → Business Review 30d |
| `renewal` | Renovación | `renewal` | 6 — Renovacion pendiente → ... → No renovado |

**Función compartida:** `createPipelineFromTemplate(supabaseClient, orgId, templateKey, customName?)`
- Reutilizable server-side (service role) y client-side (anon).
- Idempotente: si ya existe un pipeline con ese `pipeline_type` para la org, retorna su ID sin duplicar.
- Inserta el pipeline y luego las etapas en batch.

**Provisión automática al activar CRM:**
- `src/app/api/modules/route.ts` — al activar el módulo `crm`, llama
  `createPipelineFromTemplate` para `onboarding` y `renewal` automáticamente.
- Toda organización que active CRM tiene sus pipelines de Onboarding y Renovación
  disponibles sin pasos manuales.

**Diálogo "Crear Nuevo Pipeline" (PipelineHeader.tsx):**
- Selector de botones con las 4 plantillas (descripción + badge de tipo + secuencia de etapas).
- Input de texto libre para el nombre (independiente de la plantilla).
- "Pipeline en blanco" → crea solo el pipeline sin etapas.
- "Ventas"/"Onboarding"/"Renovación" → crea pipeline con el nombre ingresado + etapas preestablecidas.
- Al cerrar se resetean ambos campos. Después de crear se recargan los pipelines y se selecciona el nuevo.

**Archivos modificados:**
- `src/lib/services/crm/pipelineTemplates.ts` (nuevo) — constantes + `createPipelineFromTemplate`.
- `src/components/crm/pipeline/PipelineHeader.tsx` — import de plantillas, estado `selectedTemplate`, diálogo con selector + nombre, `handleCreatePipeline` refactorizado.
- `src/app/api/modules/route.ts` — provisión automática de pipelines onboarding/renewal al activar CRM.

---

## 2026-09 — Onboarding y Renovaciones desde el Pipeline existente

**Decisión:** no se crean páginas separadas ni tabs nuevos para onboarding/renovaciones.
Se reutiliza el `PipelineView` existente en `/app/crm/pipeline` con su selector de pipeline.

**Cómo funciona:**
- `PipelineHeader.tsx` carga TODOS los pipelines de la organización (sin filtrar por
  `pipeline_type`) y muestra badges visuales en el dropdown:
  - "Por defecto" (azul) para `is_default=true`
  - "Onboarding" (morado) para `pipeline_type='onboarding'`
  - "Renovación" (morado) para `pipeline_type='renewal'`
- Al seleccionar "Onboarding" o "Renovación", `PipelineStages` filtra las oportunidades
  por ese `pipeline_id` y el kanban las muestra.
- `PipelineView` sigue cargando `is_default=true` (Ventas) al inicio.

**Flujo de onboarding:** al ganar una venta, `WonCloseModal` ejecuta la action
"onboarding" → `onboardingService` busca/crea el pipeline `pipeline_type='onboarding'`
(7 etapas: Kickoff → Configuración → Importación → Capacitación → Uso asistido →
Revisión 14d → Business Review 30d), crea la oportunidad hija (`parent_opportunity_id`)
en la primera etapa. El usuario la ve seleccionando "Onboarding" en el dropdown.

**Flujo de renovaciones:** `WonCloseModal` crea hitos 120/90/60/30/15/7 días antes del
vencimiento; `renewalService.syncRenewals()` crea oportunidades en pipeline
`pipeline_type='renewal'`. El usuario las ve seleccionando "Renovación" en el dropdown.

**Archivos modificados:**
- `src/components/crm/pipeline/PipelineHeader.tsx`: interface `Pipeline` con
  `pipeline_type: string | null`, query con `pipeline_type` en el select, badge morado
  en el dropdown.

**Archivos NO modificados (ya funcionaban):**
- `PipelineView.tsx`, `PipelineStages.tsx`, `onboardingService.ts`,
  `renewalService.ts`, `WonCloseModal.tsx`.

**Páginas eliminadas (no necesarias):** `OnboardingTab.tsx`, `RenovacionesTab.tsx`.

**Docs actualizadas:** FASE-11-POSTVENTA.md (§4.1 rutas, §4.2 componentes, §7 DoD,
§8 archivos), FASE-02-PIPELINE-PROFESIONAL.md (§2.4 nota sobre selector de pipeline).
