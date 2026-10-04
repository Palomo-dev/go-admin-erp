# Referidos y partners: escrituras atómicas

Propuesta de expansión compatible verificada en Supabase MCP (`jgmgphmzusbluqhuqihj`) el 2026-10-02. Aplicada por el agente principal: migración `20261002064612`, con los bytes SQL y rollback indicados abajo. Catálogo confirmó funciones service-only/helper privado; asesores sin aviso nuevo de Red.

- SQL: `red_comercial_atomica.sql`, MD5 `2af7b0e5dd2bb57358faa6f4523fc331`.
- Rollback: `red_comercial_atomica.rollback.sql`, MD5 `d4b2d0e0f923843291a7230c00479a0a`.
- Cuatro funciones de contexto/escritura `SECURITY DEFINER`, acceso exclusivo `service_role`; helper de actor/sucursal privado. El navegador no puede enviar comisiones, tiers o scores preparados directamente.
- Conversión: permiso nativo `crm.leads.create`; ficha + enlace del referido en una transacción. Reutiliza normalizador, preparación de ficha, núcleo de inserción, asignación e ICP existentes. La oportunidad sigue naciendo al calificar.
- Deal: permiso nativo `crm.opportunities.edit`; comisión y promoción en una transacción. El cálculo usa los motores TS existentes. CAS compara el contexto JSONb devuelto por la BD, con filas de cliente/origen, catálogos y tasas; no compara hashes JSON de JavaScript.
- Sucursales: `app_branch_access` se evalúa con el actor humano validado. El contexto temporal se restaura ante éxito y error. El índice parcial evita duplicados de oportunidad activos también en el SDK previo; un deal rechazado admite reemplazo. Lectura previa: cero grupos duplicados existentes.

El gate real pasó **89 assertions distintas**: montaje completo, ACL exacta, anon/authenticated rechazados, actor/cargo personalizado/inactivo, sucursales, restauración JWT, CAS de ficha/ICP/tier/monto/tasa, alta nueva/existente sin oportunidad, conservación de lifecycle/metadata/owner, origen inmutable, errores tardíos de enlace/ficha/promoción con rollback, duplicado y reemplazo, doble aplicación, doble rollback y reaplicación con fixtures conservados. No se ejecutaron proveedores, mensajes ni movimientos de dinero.

La lectura externa posterior verificó 12 resultados verdaderos: funciones/índice restaurados; fixtures de fichas, referidos, partners, tiers, oportunidades, sucursales, roles, tasas y triggers ausentes; checksum del catálogo ICP igual al original. El primer montaje detectó una colisión del fixture con `UNIQUE (organization_id, band)`; se reutilizó el perfil existente dentro del rollback y se repitió el gate completo sin cambiar el SQL propuesto.

Validación de código: **164 tests / 9 suites** pasan tanto en UTC como en America/Bogota; lint del backend propio sin errores. Incluye más de 1.000 registros, cifras multimoneda, tasas futuras/ausentes, períodos de organización, permisos personalizados y fallo tardío de promoción. Los totales se leen en páginas de 500, sin límite silencioso de 1.000; los conteos paginados deben ser exactos.

Límites explícitos: el contexto transaccional de registro rechaza más de 10.000 deals de un partner, con error visible; no calcula una promoción parcial. Si falta moneda/tasa, se registra la comisión válida en su moneda y se informa que la promoción no pudo evaluarse. Pendientes de partners son globales; pagadas y deals corresponden al período. Las recompensas cash/credit se valoran en moneda base; descuentos porcentuales y regalos no se suman como dinero.

El cambio de políticas directas de tablas queda separado para después del despliegue de las rutas nuevas. Esta expansión no revoca escrituras que aún pueda necesitar el código desplegado anterior.
