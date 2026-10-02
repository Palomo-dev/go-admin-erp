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

| Comprobación | Evidencia al redactar este cierre |
| --- | --- |
| Jest global | 18.527 pruebas / 1.077 suites aprobadas; una suite y ocho casos omitidos existentes. |
| Último delta de Plantillas | 58 pruebas / cuatro suites aprobadas después del ajuste Graph 190 y de tipos; incluye seis casos nuevos de errores y permisos. |
| Fechas y zonas horarias | Seis zonas: 809 pruebas / 26 suites aprobadas por zona. |
| TypeScript global | **Aprobado, salida 0.** Los dos errores finales de Plantillas fueron corregidos y la nueva ejecución terminó sin errores. |
| Lint | 901 archivos comprobados, cero errores y cero advertencias. |
| Build de producción | **Aprobado, salida 0; 367 páginas estáticas**, optimización y trazas completadas. Next 15.5.9 con Node 20.20.2. Tipos y lint comprobados por separado, como en CI. |
| Servidor de voz local | Node 20, `/health` respondió 200 y 98 dependencias comprobadas. No equivale a una llamada telefónica real. |
| Base de datos | 69 migraciones propias aplicadas por MCP, con SQL exacto y reversión versionados. Los candidatos pendientes no se cuentan como aplicados. |

La batería global corresponde a la instantánea previa al último delta de presentación Graph 190; después se repitieron las cuatro suites afectadas de Plantillas. La corrección posterior de los tipos del cargador dinámico conserva JavaScript emitido idéntico. El build, TypeScript y lint finales incluyen las fuentes corregidas. El build conserva avisos previos sobre `swcMinify`, el `runtime` reexportado del webhook de contratos y el parche opcional del lockfile SWC; ninguno impidió completar el artefacto y no se modificaron las dependencias para ocultarlos.

Los gates SQL de los módulos verificaron sus contratos, permisos, tenant, referencias, fallos tardíos y reversiones con fixtures acotados. No se presume un resultado global limpio de los asesores: el último delta tuvo cero ERROR, con avisos existentes de seguridad y rendimiento. No se ejecutaron cargas ni pruebas generales de base después de la pausa; la recuperación incluyó únicamente los diagnósticos y el gate puntual para el conflicto SQLSTATE.

## Incidentes comprobados

**Supabase:** las pruebas de API de Actividades de la fase 59 provocaron 52.811 errores `40001` entre el 1 de octubre, 20:40:47.325 y 20:49:35.511 en America/Bogota. Una colisión deliberada de clave se había clasificado como serialización transitoria y PostgREST multiplicó las transacciones. Los scripts eran finitos; la inspección local posterior encontró cero procesos vivos ejecutándolos. La corrección inicial permitió devolver 409. La revisión posterior encontró otros **17 RAISE deterministas en nueve RPC** y los cambió a `P0001`, mapeado por la API a 409.

Ese delta está aplicado por MCP como **`20261002131611`**, SQL MD5 `f1761fc00b6173ad2696f340d1d38618`, rollback `89ef8a680f9246785838b7ee85539902`. Pasó 98 aserciones acotadas en 1,9 segundos, sin invocar RPC comerciales ni HTTP. Conserva cuerpos salvo SQLSTATE, permisos, propietario, search_path y defaults; sólo normaliza posiciones del parser al comparar el AST de defaults. El guardrail estático impide nuevos RAISE manuales de serialización y admite las migraciones históricas únicamente por hash exacto. Su rollback técnico reintroduce el defecto y no sirve como recuperación de producción.

La prueba pesada de historial con agregaciones globales y locks a las 04:14 UTC precedió a errores de Realtime desde las 04:16 UTC. Puede haber contribuido a la carga o los bloqueos; faltan métricas históricas para demostrar causalidad. Se retiraron las agregaciones globales. El detalle y la atribución parcial de los errores posteriores constan en `INCIDENTE-SUPABASE-2026-10-02.md`.

**Railway:** el despliegue de `master`, commit `edba4148`, falló el 1 de octubre a las 18:54 de Bogotá: el servidor de voz no pudo cargar `resend` y no superó `/health`. El commit fallido no incluía esa dependencia en `ws-server/package.json`. Railway acredita un despliegue posterior **SUCCESS**, commit `e892e819`, creado a las 19:25 de Bogotá; su mensaje indica la incorporación de ese paquete. La consulta fue sólo de lectura, con una recuperación acotada de logs. Sin el correo original no se asegura que ese fallo sea exactamente el aviso recibido. El historial no acredita un despliegue de los cambios finales locales de este PR.

## Límites y orden de activación

- **Secuencias:** `propuestas/secuencias_permiso_sucursal.sql` es un candidato sin aplicar. La comparación local confirma que agrega únicamente guardas de permiso, actor, organización y sucursal al engine nativo. Su gate Postgres está pendiente y la carrera de referencias/sucursales sin locks no se probó. Las API comprueban el permiso, pero la RPC autenticada existente aún permite omitir esa comprobación mediante acceso directo. No se presenta ese endurecimiento como instalado; debe cerrarse antes de acreditar el control completo de permisos de Secuencias.
- **Runtime coordinado:** publicar Next/API y WS desde el mismo cambio, utilizando el package y lockfile propios de WS. Conservar los secretos existentes: `WS_SESSION_SECRET` firma/verifica sesiones entre Next y WS; `VOICE_CALLBACK_SECRET` protege los callbacks y actas y es una variable distinta. No se rotan ni se crean secretos durante este cierre. Mantener las rutas RPC de Calls/PHONE habilitadas y comprobar sus orígenes públicos HTTPS antes de endurecer las policies.
- **POSTDEPLOY:** las nueve policies restrictivas de Calendario y los candidatos de acceso directo a llamadas, derivados y Storage permanecen sin aplicar. Primero debe desplegarse el runtime con writers canónicos; después se validan y activan sus bytes finales. Activarlos antes rompería caminos legítimos del runtime publicado. El gate final de la ampliación de sucursales/derivados sigue pendiente.
- **Verificación externa:** no se acreditan llamadas, transferencias, grabaciones, OTP, correos, mensajes, cobros o entregabilidad con proveedores reales; tampoco hardware de audio ni un recorrido completo de navegador autenticado. Las pruebas simuladas y `/health` no sustituyen esas verificaciones.
- **Publicación:** el cierre acredita la verificación local del artefacto; no acredita merge, despliegue ni activación de cambios staged en Railway. La PR se conserva como borrador por los gates de permisos y activación pendientes.

La propuesta revisable conserva las correcciones aplicadas y distingue los endurecimientos pendientes de las funciones presentes. Las páginas implementadas no se presentan como un recorrido completo de producción ni como una certificación de fidelidad de las 135 pantallas de Figma.
