# Presencia real en una página

El contador de personas viendo utiliza sesiones anónimas activas en la misma página y organización durante los últimos 90 segundos. Es una aproximación por pestaña, no una identificación de personas. Se actualiza cada 30 segundos solo mientras la pestaña está visible y la opción está activa. No utiliza visitas históricas ni números aleatorios; ante un error se oculta.

La API resuelve la organización desde el host y rechaza otra organización en el cuerpo. El middleware descarta todas las cabeceras entrantes de tenant y reenvía únicamente las que deriva del host; la simulación localhost solo funciona fuera de producción. Solo devuelve el total. La sesión aleatoria se guarda como SHA-256 ligado a la organización; no se guardan IP, correo, parámetros de URL ni el token privado de vista previa. La tabla no admite acceso directo de anon/authenticated; el servidor llama una RPC SECURITY INVOKER concedida únicamente a service_role. Hay límite de solicitudes por IP.

## Migración ejecutada

Aplicada por MCP al proyecto compartido: `20261024193026_presencia_web_pagina`. SQL exacto en `supabase/migrations/20261024193026_presencia_web_pagina.sql`; MD5 registrado `88d01756de96ed93504cb3d8dc935464`. Crea una tabla vacía, índice por organización/página/fecha, RPC e inspección RLS; programa `website-presencia-expirada` a los 17 minutos de cada hora para eliminar filas de más de un día. No se modificaron documentos existentes ni se ejecutaron backfills.

Antes se inspeccionaron esquema, extensiones y asesores. El intento de preparar el smoke DDL en transacción por execute_sql devolvió requestState expirado y no creó la tabla. Se aplicó con apply_migration y se verificaron siete invariantes dentro de una transacción revertida: primer registro, deduplicación, dos sesiones, caducidad, cambio de página, otra organización y permisos. La comprobación posterior confirmó RLS y falta de permisos públicos. Los asesores de seguridad se volvieron a consultar.

El CLI para generar el archivo falló al intentar crear `/home/agent/.supabase` en un sistema de archivos de solo lectura, incluso solicitando el permiso acotado. El SQL se escribió primero como artefacto de trabajo y el nombre definitivo utiliza la versión real devuelta por la historia de migraciones, sin inventarla.

## Orden y reversión

Base aplicada → desplegar tienda con API/hook → habilitar controles del editor. Sin la opción activada, el hook no hace solicitudes ni añade elementos visuales.

Para revertir: apagar personas viendo y retirar el consumidor/API; ejecutar por MCP `supabase/rollbacks/20261024193026_presencia_web_pagina_rollback.sql`. El rollback retira job, RPC y tabla. Se pierden únicamente las sesiones efímeras de presencia; las visitas históricas, ventas, inventario y documentos permanecen intactos. No se ejecutó el rollback en producción.

## Validación de código

En tienda: `node scripts/verify-presencia-pagina.cjs` (32 casos de validación, aislamiento, hash, respuesta agregada, límite y errores); `node scripts/verify-presencia-hook.cjs` (18 casos del efecto, pestaña visible, errores y limpieza); `node scripts/verify-tenant-middleware.cjs` (47 casos con middleware y NextResponse reales). La prueba de la base se ejecutó por MCP, no mediante credenciales embebidas en scripts. La revisión independiente calificó el código local con 9,5/10; queda pendiente la verificación desplegada.
