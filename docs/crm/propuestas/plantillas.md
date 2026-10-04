# Cierre de Plantillas — Figma y flujos nativos

Referencias revisadas: `1404:831575` (biblioteca), `1404:832164` (correo), `1405:118336` (aprobación WhatsApp), `1405:832049` (vacío), `1405:832447` (carga) y `1405:832838` (error del proveedor).

## Comportamiento

- La biblioteca reutiliza PageHeader, DataTable y controles del kit; incluye búsqueda, páginas reales, carga, vacío, error y reintento. Las fechas usan la zona de la organización. Los componentes de este cierre tienen menos de 300 líneas.
- Los GET de plantillas son lecturas. Restaurar bases requiere el POST nativo explícito. Las APIs mantienen sesión y organización canónicas, validación de UUID y los cuatro alias existentes de organización. `can_manage` del servidor controla las mutaciones; el permiso de configurar canales no se reutiliza para decidir quién puede administrar plantillas.
- Correo mantiene los motores nativos de bloques y HTML. Consultar, actualizar, duplicar, eliminar y enviar una prueba exigen canal `email`. Guardar incrementa la versión; compara la versión leída y filtra la escritura por organización, ID, canal y versión. Un conflicto devuelve 409 y conserva el borrador local.
- La vista previa usa variables y renderizado nativos con IDs reales de cliente y oportunidad. Sin referencias, muestra explícitamente el contexto de ejemplo. Un error de contexto permanece visible con reintento; nunca sustituye datos fallidos por ejemplos. Cambiar referencias invalida respuestas previas y cierra la carga pendiente.
- WhatsApp permite editar borradores. PENDING mantiene el original completo en lectura. APPROVED ofrece consultar y duplicar como un borrador nuevo. REJECTED permite corregir una copia y reenviarla; conserva el motivo real. Duplicar no copia IDs externos y exige un nombre válido.
- Aprobar exige ejemplos para todas las variables, tanto en UI como en el servicio nativo, antes de acceder al proveedor. El ID creado se guarda antes de solicitar aprobación; reintentar tras un fallo utiliza ese borrador y no crea otro. El historial muestra sólo estado y fechas disponibles del proveedor, con esa limitación visible. La burbuja es una vista previa y no presenta un envío como entregado.
- Los errores de sincronización conservan las tarjetas disponibles. El transporte nativo conserva `details`: para `PROVIDER`, el cliente reconoce Graph 190 numérico o texto dentro de un objeto validado, además de 401 y código 190 de primer nivel. Ofrece reconectar sólo a quien puede configurar canales. Los fallos propios 500/403 y otros códigos ofrecen reintento; el botón vuelve a ejecutar la sincronización fallida sin eliminar las tarjetas.

## Verificación local

- Backend: 35 casos en tres suites, incluidos CAS por versión/canal y los flujos estables de correo y WhatsApp.
- UI y hooks: 23 casos con NextIntl real en español, inglés, francés y portugués; permisos de lectura, contexto fallido y respuesta obsoleta, borrador preservado ante 409, estados de aprobación, ejemplos obligatorios y reintento con el mismo ID. Incluye Graph 190 numérico/texto, fallos propios 500/403, detalles inválidos y falta de permiso para configurar. Verificación final tras ese delta y los ajustes de tipos: 58 casos en cuatro suites, todos aprobados; ESLint de los cuatro archivos revisados sin incidencias.
- Catálogo: 215 claves de presentación por idioma. Los literales `{{...}}` se escapan para ICU conservando los tokens del contenido. ESLint focal y `git diff --check` sin incidencias. Los recuentos finales y hashes se registran en el manifiesto de cierre.

Estas comprobaciones usan proveedores y almacenamiento simulados localmente. No enviaron correos ni mensajes, no ejecutaron SQL ni migraciones y no prueban aprobación o entregabilidad del proveedor real. SMS permanece como categoría del catálogo nativo; este cierre no introduce un motor de SMS. El envío de pruebas reutiliza el servicio configurado y requiere los cambios guardados.
