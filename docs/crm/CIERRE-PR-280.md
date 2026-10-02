# Cierre de revisión del PR 280 — CRM Go Admin

Fecha: 2 de octubre de 2026. [PR 280](https://github.com/Palomo-dev/go-admin-erp/pull/280). Este documento resume el cambio para revisión; las fases, evidencias SQL y versiones exactas están en `PLAN-FIGMA-A-CODIGO.md` y `propuestas/README.md`.

El trabajo sigue la prioridad acordada: corregir integridad y cifras, completar la ficha y sus conexiones comerciales y adaptar las áreas nuevas al sistema visual de Figma. El código conserva los servicios, permisos y motores nativos. Usa **`stages.probability`**, la tabla existente aprobada por el usuario; no introduce `pipeline_stages`.

## Comportamiento resultante

- **Cifras y pronóstico:** la probabilidad se interpreta como porcentaje de 0 a 100; una oportunidad de 1.000 al 50 % pondera 500. Los cierres usan el estado y las banderas reales de las etapas: una etapa abierta al 100 % no se registra como venta ganada. Las lecturas fallidas no se publican como cifras vacías válidas.
- **Reuniones y actividades:** evento, actividad relacionada y seguimiento se escriben mediante núcleos transaccionales. El último contacto corresponde a una interacción realizada y conserva el más reciente; agendar una reunión futura no cuenta como contacto efectuado. El formulario distingue sesión vencida de falta de permiso, conserva sus datos y usa el criterio canónico de administración.
- **Ficha y conexiones comerciales:** los lectores validan la organización de sesión y sus alias, permisos y referencias. La ficha reúne historial y relaciones comerciales, utiliza folios/navegación nativos y descarta respuestas obsoletas al cambiar de cliente u organización. Facturas, cotizaciones, Chat, referidos y partners reutilizan los núcleos existentes para crear o enlazar entidades.
- **Llamadas y PHONE:** CAS de 20 campos, vínculo comercial, consentimiento, historial y contacto se actualizan de forma coherente. Las sesiones privadas coordinan espera, consulta, cancelación y transferencia; conservan al iniciador como autor del historial y asignan control a la pata actual. Un resultado incierto del proveedor se reconcilia antes de permitir otra intención. Las reservas de grabación protegen el retiro del consentimiento y requieren evidencia verificada.
- **Identidades:** la fusión permite tipos de cliente distintos y cadenas de fusiones, conserva auditoría y clasificación del principal y obliga a deshacer dependencias activas en orden. El historial expone el motivo seguro y no el snapshot privado completo.
- **Áreas y presentación:** Equipo/territorios, Salud, Objeciones, Agentes IA, Automatizaciones, Plantillas y Secuencias usan las conexiones nativas y el kit visual compartido, con estados de carga/error y traducciones en español, inglés, francés y portugués. Las vistas previas y pruebas locales no acreditan entrega ni ejecución real de un proveedor.

## Verificación registrada

| Comprobación | Evidencia del cierre actual |
| --- | --- |
| Jest global | 18.608 pruebas / 1.084 suites aprobadas; una suite y ocho casos omitidos existentes. Incluye acciones móviles y KPI; el último ajuste de la carrera en llamada pasó después 137 pruebas afectadas en UTC y tres diferidas en Bogotá. |
| TypeScript global | Aprobado, salida 0 tras la congelación de todos los ajustes móviles y de la carrera en llamada. |
| Lint del delta | 37 archivos TypeScript modificados comprobados, cero errores y advertencias después de la congelación final. |
| Fechas y zonas horarias | 809 pruebas / 26 suites aprobadas por cada una de seis zonas en el cierre actual; las suites afectadas se comprobaron además en UTC y Bogotá. |
| Build final | Aprobado, salida 0; 367 páginas estáticas. Copia filtrada como Vercel, Node 24.19.0, heap 6144. Incluye el último ajuste móvil y de la carrera en llamada; tipos y lint se verificaron por separado, como en CI. |
| Servidor de voz local | Node 20, /health 200, 98 dependencias y diez casos del cierre de imports aprobados. No equivale a una llamada real. |
| Base de datos | 73 migraciones propias aplicadas exclusivamente por MCP, con SQL exacto y reversión versionados. Los candidatos restrictivos pendientes no se cuentan como aplicados. |
| Figma | [135 referencias con dimensiones y hashes](VERIFICACION-VISUAL-135.md); 12 estados de componentes renderizados localmente con fixtures; cero pantallas CRM autenticadas acreditadas. |

Los deltas SQL finales usan simulación PostgreSQL exclusivamente en pg_temp para negocio y gates separados de catálogo: llamadas 12+103, miembro activo 8+129, Secuencias 26+47 y métricas 18+53. El gate de las 35 policies de llamadas, derivados, tags y Storage pasó 31 aserciones de aplicación/reversión en una transacción que terminó en rollback. No se escribieron filas comerciales, se invocaron proveedores ni se reanudaron cargas generales de base.

Las advertencias previas del build sobre swcMinify, runtime reexportado y parche opcional SWC se registran sin ocultarlas. Los asesores Supabase mantienen nueve categorías de seguridad y siete de rendimiento, cero ERROR; esto no acredita un resultado global sin advertencias. Los contratos authenticated SECURITY DEFINER conservan autorización interna explícita.

## Incidentes comprobados

**Supabase:** las pruebas de API de Actividades de la fase 59 provocaron 52.811 errores `40001` entre el 1 de octubre, 20:40:47.325 y 20:49:35.511 en America/Bogota. Una colisión deliberada de clave se había clasificado como serialización transitoria y PostgREST multiplicó las transacciones. Los scripts eran finitos; la inspección local posterior encontró cero procesos vivos ejecutándolos. La corrección inicial permitió devolver 409. La revisión posterior encontró otros **17 RAISE deterministas en nueve RPC** y los cambió a `P0001`, mapeado por la API a 409.

Ese delta está aplicado por MCP como **`20261002131611`**, SQL MD5 `f1761fc00b6173ad2696f340d1d38618`, rollback `89ef8a680f9246785838b7ee85539902`. Pasó 98 aserciones acotadas en 1,9 segundos, sin invocar RPC comerciales ni HTTP. Conserva cuerpos salvo SQLSTATE, permisos, propietario, search_path y defaults; sólo normaliza posiciones del parser al comparar el AST de defaults. El guardrail estático impide nuevos RAISE manuales de serialización y admite las migraciones históricas únicamente por hash exacto. Su rollback técnico reintroduce el defecto y no sirve como recuperación de producción.

La prueba pesada de historial con agregaciones globales y locks a las 04:14 UTC precedió a errores de Realtime desde las 04:16 UTC. Puede haber contribuido a la carga o los bloqueos; faltan métricas históricas para demostrar causalidad. Se retiraron las agregaciones globales. El detalle y la atribución parcial de los errores posteriores constan en `INCIDENTE-SUPABASE-2026-10-02.md`.

**Railway:** el despliegue de `master`, commit `edba4148`, falló el 1 de octubre a las 18:54 de Bogotá: el servidor de voz no pudo cargar `resend` y no superó `/health`. El commit fallido no incluía esa dependencia en `ws-server/package.json`. Railway acredita un despliegue posterior **SUCCESS**, commit `e892e819`, creado a las 19:25 de Bogotá; su mensaje indica la incorporación de ese paquete. La consulta fue sólo de lectura, con una recuperación acotada de logs. Sin el correo original no se asegura que ese fallo sea exactamente el aviso recibido. El historial no acredita un despliegue de los cambios finales locales de este PR.

## Estado funcional y activación pendiente

- **Secuencias:** aplicada `20261002152713`. Inscripción y reanudación exigen el permiso canónico, actor de sesión y referencias/sucursales coherentes bajo locks sin espera. La salida usa una RPC transaccional que guarda exited y omite solamente pasos pendientes. Las 15 policies que cierran CRUD directo todavía requieren publicar el writer nuevo. No se puede retirar un envío que un proveedor ya inició.
- **Llamadas:** los escritores comprueban ambas referencias y sucursales antes de subir archivos, encolar trabajos o mutar etiquetas. El permiso edit_any conserva la gestión legítima sin conceder view_all para listas/audio; el servidor resuelve el registro internamente con organización validada. Los lectores de listado, frecuencia, agentes y campañas filtran el mismo alcance en filas y cifras.
- **Objeciones y Equipo:** catálogo con cuatro indicadores, filtros/orden/CSV, detalle de página y editor compartido; las alternativas se agregan a un borrador que requiere Guardar. Las acciones móviles del shell y las pestañas de Equipo se corrigen sin otro motor de negocio ni rediseñar las páginas previas. El indicador de categoría suma detecciones de su categoría, sin afirmar llamadas únicas.
- **Runtime coordinado:** publicar Next/API y WS desde el mismo cambio y comprobar /health y callbacks. Conservar WS_SESSION_SECRET; VOICE_CALLBACK_SECRET es distinto y debe coincidir en ambos consumidores. Railway registra `master` 9300b396 como SUCCESS, sin los writers de este cierre. Hay seis variables staged de correo/callbacks; el usuario identifica su cambio manual como VOICE_CALLBACK_SECRET. El diff de resource.update sigue sin exponer su contenido en el conector. La publicación coordinada espera acceso al equipo Vercel y comprobación del secreto en ambos consumidores.
- **Acceso de Vercel:** el conector devuelve 403 porque está vinculado a otro alcance de equipo; requiere reconectar al equipo/proyecto correctos. No es el permiso del usuario administrador dentro del ERP. No se acredita configuración ni despliegue de producción del último commit. El preview anterior 7edb9fe5 sí obtuvo SUCCESS después de corregir el filtro de archivos de telefonía.
- **POSTDEPLOY:** 59 policies restrictivas pendientes: Secuencias15, Calendario9 y llamadas/derivados/tags/Storage35. Primero se acredita Next+WS compatibles, se retiran réplicas/clientes anteriores y después se activan sólo los bytes revisados. Las simulaciones no prueban una solicitud real de Storage ni revocan inmediatamente una URL firmada ya emitida (TTL600s).
- **Verificación externa:** faltan organización elegida y sesión válida para el recorrido real; no se acreditan entregas de correo/WhatsApp, llamadas, transferencias, grabaciones, OTP, cobros ni hardware móvil/Electron. El dominio de correo está verificado, pero la configuración del proveedor no prueba envío desde el CRM. Los destinatarios autorizados permanecen privados.
- **135 pantallas:** la auditoría identifica cada referencia; los renders simulados no sustituyen el contraste con navegador autenticado ni dispositivos nativos. No se presenta la exportación de referencias como aprobación visual completa.

La PR reúne cambios compatibles y candidatos revisables con sus reversiones. Publicar el código y comprobar CI es independiente de acreditar el despliegue coordinado y activar las policies; este documento conserva esa distinción.

## Revisión visual solicitada después de la congelación

El usuario comprobó una descarga de la rama feat/crm-flujo-completo y señaló diferencias con Figma y el manual de marca. Se abre una revisión concreta de fundamentos, componentes y áreas nuevas; el build y las pruebas anteriores acreditan funcionamiento local, no aprobación de fidelidad. Los ajustes visuales siguientes se registrarán con sus referencias y renders correspondientes.
