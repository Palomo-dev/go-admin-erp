# Auditoría de BD del cierre de PR 280

Inspección inicial del 4 de octubre de 2026: consultas acotadas y de sólo lectura
a catálogos por MCP, más revisión de los artefactos versionados. Las expansiones
compatibles instaladas después por el coordinador se registran al final.
No se hicieron tests comerciales, conexiones directas ni pruebas de carga.

## Tablas con RLS y sin políticas

El catálogo confirma **41 tablas de `public` con RLS y cero políticas**.
En **37** no hay permisos SELECT/INSERT/UPDATE/DELETE para `authenticated` ni
`anon`; las otras cuatro son `platform_admins` y las tres tablas
`seller_bank_accounts`, `seller_payout_requests`, `seller_payout_settings`,
cuyo acceso sigue denegado por RLS al faltar policies. Estas últimas corresponden
a administración/marketplace y requieren evaluar sus consumidores por separado.
El conteo no significa 41 tablas expuestas ni justifica conceder acceso.

Las **12 tablas CRM** de ese grupo son deliberadamente privadas:

- `crm_call_disposition_receipts`, `crm_call_link_receipts`,
  `crm_message_dispatch_receipts`, `crm_partner_deal_receipts`.
- `crm_contact_time_repairs`, `crm_meeting_history_repairs`.
- `crm_phone_invites`, `crm_phone_mobile_proofs`, `crm_phone_operations`,
  `crm_phone_presence`, `crm_phone_sessions`, `crm_phone_verified_mobiles`.

Todas revocan acceso directo a `authenticated` y `anon`. Sólo
`crm_message_dispatch_receipts` concede acceso de tabla a `service_role`;
las otras once sólo al propietario `postgres`, con acceso operativo a través
de funciones autorizadas. No añadir policies permisivas a estas tablas para
silenciar un asesor. El aviso `rls_enabled_no_policy` es INFO y Supabase reconoce
el cierre intencionado: [documentación del asesor](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0008_rls_enabled_no_policy).

Las tablas internas de `storage` sin policies no se cuentan como pendientes de
CRM ni se alteran. La propuesta del CRM afecta exclusivamente a
`storage.objects` para el bucket de grabaciones y preserva los otros buckets.

## Las 59 restricciones pendientes sí son otra deuda

La inspección actual confirmó **cero** policies restrictivas de las tres tandas:

| Tanda | Pendientes | Artefactos |
| --- | ---: | --- |
| Secuencias | 15 | `propuestas/secuencias_permiso_sucursal.rls.sql` y rollback |
| Calendario/reuniones CRM | 9 | `propuestas/calendario_reuniones_rls.sql` y rollback |
| Llamadas, derivados, etiquetas y Storage | 35 | `propuestas/llamadas_acceso_directo.sql`, `propuestas/llamadas_derivados_acceso.sql` y rollbacks |

Las policies permisivas originales permanecen. Las guardas compatibles de
Secuencias están instaladas: los cuerpos de inscripción, reanudación y salida
conservan respectivamente MD5 `08144f2f020143d8185ecdc6103a29da`,
`4a215017a83271e5d49a0fdeb138b305`, `c74c86363c61614c7d73fa22ec3fc97e`.
Los wrappers de Calendario también conservan cuerpos y ACL documentados:
`fn_crm_guardar_reunion` permite `authenticated`; `fn_crm_agendar_reunion_voz`
permite exclusivamente `postgres`/`service_role`.

Orden de cierre: publicar los escritores canónicos de Next y llamadas; acreditar
las revisiones servidas y retirar réplicas/clientes anteriores; aplicar por MCP
las restricciones exactas con su rollback; comprobar catálogo, sesión del autor,
administrador y otra sucursal/tenant. Para llamadas se requiere además verificar
subida y URL firmada de Storage. Revertir sólo la tanda restrictiva ante un
fallo, conservando las expansiones compatibles y la evidencia. Esta auditoría
no acredita esos despliegues ni esa sesión real y **no activa las 59 policies**.

## Rollbacks: distinguir restauración de desactivación

El diff inicial auditado respecto de `origin/main` contenía 77 rollbacks de CRM;
**30 tenían de
2 a 19 líneas**. La longitud no demuestra un defecto. Retirar una función/vista
nueva, revocar el único GRANT de columna añadido o conservar expresamente un
índice aditivo puede ser correcto. Por ejemplo, los rollbacks de métricas de
agentes, vistas de historial y `comm_settings.data_policy_url` revierten
precisamente esas adiciones. Los dos rollbacks de índices explican que los
conservan para soportar FK y no cambian datos.

Varios archivos son **desactivaciones funcionales** y preservan cuerpos,
estructura, reservas o evidencia; no restauran íntegramente el esquema previo.
La advertencia está presente, pero hace falta una matriz de compatibilidad del
runtime y un orden de recuperación para poder usarlos en producción:

| Familia | Artefacto de ejemplo | Limitación concreta |
| --- | --- | --- |
| Listado/consulta nueva | `20260930220920_crm_llamadas_busqueda_y_cifras.sql` | Retira EXECUTE y conserva función/índices; requiere consumidor anterior. |
| Pronóstico | `20260930225439_crm_pronostico_categorias_y_ajustes.sql` | Desactiva APIs y trigger; conserva categorías/historial. |
| Consentimiento | `20261001034200_crm_consentimiento_atomico_entrante_rollback.sql` | Deshabilita trigger y funciones nuevas; no deshace bajas/importaciones. |
| Lotes/despacho WhatsApp | `20261001054500_crm_lotes_con_estados_y_reservas_reales_rollback.sql` | Cierra consumidores; el lote anterior no es recuperación segura. |
| Reservas de voz | `20261001165504_crm_voz_reservas_y_conciliacion_atomicas_rollback.sql` | Aborta si hay evidencia financiera; no admite volver al cobro anterior. |

Los artefactos nuevos que sustituyan cuerpos deberán guardar definición previa
completa, ACL, defaults, owner, `search_path`, hashes esperados y las condiciones
de coordinación, como el [candidato RNE opcional](propuestas/voz_campanas_rne_opcional.md).
No se deben reconstruir cuerpos antiguos por suposiciones ni modificar los bytes
de migraciones ya aplicadas. La ausencia de reversión de datos debe quedar
explícita conforme a `docs/POLITICA-MIGRACIONES.md`.

Se corrigió el rollback especialmente peligroso
`supabase/rollbacks/20260930233500_crm_pronostico_acceso_e_indices.sql`: la
versión anterior devolvía SELECT sobre `mv_crm_forecast` a
`anon`/`authenticated`, sin aislamiento. El archivo ahora aborta explícitamente
con `P0001 reversion_insegura_mv_crm_forecast` y no concede esos permisos.
La recuperación conserva la vista privada y usa la RPC autorizada; reabrir
esos grants no es requisito para volver a una versión anterior del código.
Las reversiones de guardas de sucursal o
SQLSTATE también pueden reabrir bugs de seguridad/reintentos: hay que priorizar
corrección hacia delante con el contrato actual.

## Alineación RNE aplicada en PostgreSQL

El runtime de `main` quitó RNE como requisito de campaña, pero cuatro funciones
vigentes todavía lo exigían al guardar, reclamar, preparar o iniciar. Los
defaults de las columnas actuales ya eran 120/40/5; la RPC de guardado conservaba
50/20/3. El [delta aplicado](propuestas/voz_campanas_rne_opcional.md) alinea
los defaults y elimina la obligatoriedad de constancia y de lista, conservando
bajas voluntarias, consentimiento, topes, cuotas, reservas y estados. El
coordinador lo aplicó como `20261004164119` después de doble aplicación/reversión
acotadas y revisión independiente; confirmó los cuatro hashes y ACL posteriores.
El rollback restaura cuerpos completos. No se activaron las 59 policies ni se
acreditó un recorrido con sesión/proveedores al instalar estas funciones.

## Configuración de Secuencias aplicada sin activar RLS

El coordinador instaló `20261004164911` con dos RPC aditivas: creación de padre
y pasos en una transacción y eliminación exclusiva de configuración sin
inscripciones ni runs. Las filas con historial, también terminal, se conservan
y pueden desactivarse. Confirmó los hashes de ambos cuerpos y ACL de ejecución
limitadas a `postgres` y `authenticated`, tras el dry run con doble aplicación
y doble reversión dentro de BEGIN/ROLLBACK. El
[registro de configuración atómica](propuestas/secuencias_configuracion_atomica.md)
separa esta instalación de la activación de 15 políticas: esas restricciones,
y las otras 44 de Calendario/llamadas/Storage, siguen pendientes.
La candidatura actualizada de Secuencias pasó además 17 comprobaciones de
catálogo en doble aplicación/reversión dentro de BEGIN/ROLLBACK. El postcheck
confirmó cero restricciones instaladas y helper candidato ausente. Esto
acredita el DDL y su reversión, sin probar filas bajo RLS ni una sesión real.
