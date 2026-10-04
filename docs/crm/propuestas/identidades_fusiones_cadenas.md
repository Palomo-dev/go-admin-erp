# Identidades: fusión de tipos distintos y cadenas

Estado: aplicada por MCP, versión `20261002124400`, con los bytes y contratos validados. Modifica únicamente los dos núcleos nativos `crm_merge_customers` y `crm_unmerge_customer`; conserva sus parámetros, permisos, auditoría y movimientos transaccionales. No agrega columnas ni un segundo servicio de fusión.

La fusión puede comparar una persona y una empresa. El principal conserva su clasificación y recibe sólo los campos seleccionados por el usuario dentro de la lista nativa. Los originales completos permanecen en el snapshot; los valores únicos transferidos se liberan en el archivado como ya hace el núcleo actual.

Cada recibo nuevo guarda `snapshot.depends_on` con las fusiones activas que afectan a ambos clientes, dentro del lock de organización existente. Una cadena puede continuar sobre el principal o moverlo a otro principal. Para deshacer una fusión primero deben deshacerse sus descendientes activos; una fusión de clientes independientes no impide deshacer otra. La dependencia explícita funciona también cuando las fechas de varias fusiones coinciden en una sola transacción y protege los recibos antiguos que no tenían ese campo.

Se conservan las comprobaciones de facturas emitidas, filas movidas, campos posteriores, metadata del archivado, administrador y plazo de 30 días. Los recibos nuevos incluyen la clasificación del cliente en la comprobación de campos antes de deshacer. Ambos clientes se validan con el helper nativo `app_branch_access`, además de organización y permisos.

`snapshot.reason` registra `document`, `email`, `phone` o `manual` a partir de los valores originales. Documento y correo admiten su normalización textual; el teléfono se compara como valor persistido y no reproduce el normalizador del CRM por país. El historial puede seleccionar únicamente `reason:snapshot->reason`; nunca debe devolver el snapshot completo ni los identificadores de filas movidas.

La reversión conserva todos los clientes y recibos y devuelve exactamente los cuerpos anteriores, con MD5 `52675285e61567443e5724b65f3ee39a` y `6092e725201ee3b51c3d36247ec3f11f`, y sus ACL de propietario, sesión y servicio. Se niega a retirar la protección mientras haya descendientes activos: primero deben deshacerse siguiendo sus dependencias.

El 2 de octubre de 2026 pasaron **42 aserciones SQL reales** dentro de `BEGIN/ROLLBACK`, con aplicación doble, reversión doble y reaplicación. Se compararon los dos cuerpos, ACL y configuración exactos; se movieron y restauraron las siete clases de referencias nativas; se probaron tres fusiones encadenadas, componentes independientes, auditorías antiguas, los cuatro motivos, cambios posteriores, permisos, sucursales y fallos tardíos tanto al fusionar como al deshacer. La factura de prueba permaneció como borrador con total y saldo cero; no se emitieron documentos ni se llamó a proveedores.

La lectura externa confirmó los cuerpos y permisos originales restaurados, cero fixtures en los dominios modificados, cero auditorías de prueba y cero constraints temporales. SQL validado: 15.176 bytes, MD5 `fb78c399c0af2f09aaa5cc1d72f6972b`; reversión: 13.886 bytes, MD5 `9fe8c28c3f859004b129297d910c7fb8`. Los cuerpos nuevos tienen MD5 `8d8b5b730d163fa9562bef0bd4dd311c` y `6d3c50aa98c5dd45a5346bc2576573a4`. Los scripts de prueba son temporales y no se incluyen en el repositorio.
