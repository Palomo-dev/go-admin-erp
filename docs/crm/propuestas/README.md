# Candidatos y activaciones SQL del CRM

Los archivos de esta carpeta conservan candidatos revisables; la copia exacta aplicada vive en supabase/migrations con su reversión en supabase/rollbacks. Un comentario original «propuesta» no sustituye la versión real documentada.

- Historial legado: aplicado como `20261002052625`, documentado en fase 61; dos reuniones reparadas, cuatro historiales coherentes. Los candidatos finales se conservan como referencia de revisión.
- Expansión compatible de calendario: aplicada como `20261002054023`, MD5 `2c7724a3b0cc6b0d606134a701631bd9`; rollback `ccf934719428a71c1ee360bc92d03bc9`. Las nueve policies de calendario_reuniones_rls siguen pendientes de desplegar los escritores canónicos. [Pruebas y orden](calendario_reuniones_rls.md).
- Trigger duplicado de oportunidades: aplicado como `20261002054026`, MD5 `ea9c37aef78b76f770ef085b57514472`; rollback `3017edf0ad3044aeaba23b9c1f361a75`. Se conserva el trigger canónico.
- Llamadas atómicas: expansión aplicada como `20261002054759`, MD5 `00b68ec23425460998276951fd02ad24`, rollback `aa67c80b9257a0d589278ca9d34831f1`. [Pruebas y activación](llamadas_atomicas.md). El runtime canónico se activa después de sus gates. El acceso directo restrictivo sigue diferido hasta desplegar los escritores nuevos.
- Conexiones desde factura/cotización/Chat: aplicadas como `20261002060251`, SQL MD5 `7926ca899d230b0058f2313e564ef282`, rollback `cfdbaa57c5a899012a48ec0ec41802de`. [75 comprobaciones reales y límites](conexiones_origen.md).
- Equipo: expansión aplicada como `20261002061535`, SQL MD5 `2162882cdff02a683bb7d909b4f23564`, rollback `cd3a1dfb0096da118b2cd62b3ea5b442`. Guardas de sucursal y actor, 23 comprobaciones SQL y reversión lógica que conserva prioridades.
- Salud: aplicada como `20261002062052`, SQL `96ef176efd86e55dac83032e91ae1f4e`, rollback `6abe027da8e241dda10f6487dcbae322`; [84 comprobaciones reales, cola y snapshots](salud_atomica.md).

La conexión se recuperó el 2026-10-02. La evidencia y versiones están en [PLAN-FIGMA-A-CODIGO.md](../PLAN-FIGMA-A-CODIGO.md). Todas las aplicaciones se realizan únicamente por MCP y dejan SQL exacto, rollback, MD5 y versión real conforme a [POLITICA-MIGRACIONES.md](../../POLITICA-MIGRACIONES.md). Las activaciones restrictivas se separan del cambio compatible para preservar el runtime actualmente publicado.

- Agentes IA / métricas: aplicada `20261002062822` (archivo `20261002064500_crm_agentes_ia_metricas.sql`), SQL MD5 `8da542d01f41446666ad67a6748de532`; rollback `70cf95c5d3c036f0ab36c44eb8138551`. Gate real de ledger y permisos, asesor WARN0029 intencional; [evidencia](agentes_ia.md).


## Aplicaciones posteriores verificadas

Las copias de `supabase/migrations` y `supabase/rollbacks` conservan los bytes exactos, contrastados con los MD5 de la aplicación real por MCP. El prefijo de un archivo documental no sustituye la versión real de Supabase indicada aquí. Los comentarios originales de candidato se conservan dentro del SQL aplicado para no cambiar sus bytes.

| Fase | Cambio y archivo aplicado | Versión MCP real | MD5 SQL | MD5 rollback | Gate SQL real |
| --- | --- | --- | --- | --- | --- |
| 68 | [Red comercial atómica](../../../supabase/migrations/20261002065000_crm_red_comercial_atomica.sql) | `20261002064612` | `2af7b0e5dd2bb57358faa6f4523fc331` | `d4b2d0e0f923843291a7230c00479a0a` | 89 |
| 69 | [Objeciones: frecuencia y respuestas](../../../supabase/migrations/20261002065500_crm_objeciones_frecuencia_respuestas.sql) | `20261002064622` | `78d20664c9e42004a312b492d3b5eca6` | `fae7fb979b4fcd40214c57da7d847ca8` | 26 |
| 70 | [PHONE: conferencias](../../../supabase/migrations/20261002070000_crm_phone_conferencias.sql) | `20261002064625` | `9633854316961420dc9ccdd324bb7f56` | `68231f385815cd0dc9fba74a496adf26` | 100 |
| 71 | [Agentes IA: omisiones](../../../supabase/migrations/20261002070500_crm_agentes_ia_metricas_omisiones.sql) | `20261002064940` | `a6032bd276f289fb9d7f92c73d6ac2f1` | `630731cccff049326ba2aa1877cffb4c` | 58 |
| 72 | [Identidades: cadenas de fusión](../../../supabase/migrations/20261002071000_crm_identidades_fusiones_cadenas.sql) | `20261002124400` | `fb78c399c0af2f09aaa5cc1d72f6972b` | `9fe8c28c3f859004b129297d910c7fb8` | 42 |
| 73 | [Objeciones: policy auth.uid](../../../supabase/migrations/20261002071500_crm_objeciones_rls_uid.sql) | `20261002124402` | `933debc96eee1b948a8dbafec140dcca` | `dea1f56d65513fe85d6f20ce743ab6aa` | 6 |

Cada gate comprobó doble aplicación, doble rollback, reaplicación, roles/ACL y retirada de fixtures; los detalles y límites constan en las fases 68–73 de [PLAN-FIGMA-A-CODIGO.md](../PLAN-FIGMA-A-CODIGO.md). Son 68 migraciones propias aplicadas; los harness temporales no cuentan como migraciones ni se versionan. Las reversiones correspondientes están en [supabase/rollbacks](../../../supabase/rollbacks/).

Red no añadió avisos. Los WARN0029 de contratos authenticated SECURITY DEFINER son intencionales con sesión, permisos, organización y referencias probadas. PHONE mantiene seis tablas privadas con RLS y sin grants API directos: los INFO0008 por ausencia de policies son esperados. La fase 73 elimina el WARN auth_rls_initplan de Objeciones; tres INFO de claves foráneas sin índice permanecen. No se afirma un asesor global sin avisos.

Las activaciones restrictivas de calendario, llamadas y derivados continúan **POSTDEPLOY, sin aplicar**, hasta desplegar los escritores canónicos. No se hicieron llamadas, envíos o cobros reales, merge ni despliegue. El cierre documental local no ejecuta nuevas consultas/pruebas Supabase y no sustituye los gates generales del artefacto final.


El delta de recurrencia `crm_conflictos_sqlstate.sql` está aplicado (MCP `20261002131611`, fase 74): 17 conflictos deterministas de nueve RPC ahora usan P0001. Gate acotado 98 aserciones, sin filas comerciales/HTTP.

### Cierre compatible de permisos (fase 77)

| Cambio | Versión MCP real | MD5 SQL | MD5 rollback | Verificación |
| --- | --- | --- | --- | --- |
| [Llamadas: tenant, sucursales y referencias](llamadas_sucursal_rpc.md) | `20261002151347` | `54c8693f9f9c175da826951dc06b9752` | `b27955513f6bb619ca95b8614b3e6845` | 12 aserciones de catálogo + 103 de simulación PostgreSQL temporal |
| [Llamadas: membresía activa](llamadas_listado_miembro_activo.md) | `20261002152633` | `223eb889558c9db5f689acd418e6221f` | `fc97069310ac51fed7b12d22756969ec` | 8 de catálogo + 129 de simulación temporal ampliada |
| [Secuencias: permisos y salida atómica](secuencias_permiso_sucursal.md) | `20261002152713` | `0563701aa3b8ed9ab71766662fddc19b` | `630f9b20eab65fa7fc1e90dba3b2dbcf` | 26 de catálogo + 47 de simulación temporal |

### Métricas de llamadas por alcance (fase 78)

Los tres lectores nativos de frecuencia de Objeciones, Agentes IA y detalle de campañas comprueban membresía activa, autor/ver-todas, tenant y ambas sucursales. Los objetivos sin llamada conservan su permiso nativo de lectura; las llamadas ocultas no reaparecen como pendientes. El saldo global y el ledger privado mantienen su significado y no se modifican.

| Cambio | Versión MCP real | MD5 SQL | MD5 rollback | Verificación |
| --- | --- | --- | --- | --- |
| [Métricas por sucursal y referencias](llamadas_metricas_sucursal.md) | `20261002154537` | `4a19621ed70885561cce11475c68b732` | `c0d98f6a4725b8f206e0277a871fc126` | 18 aserciones de catálogo + 53 de simulación PostgreSQL temporal |

Son 73 migraciones propias aplicadas. Las copias exactas y reversiones usan la versión MCP real; los gates temporales no se versionan. Las simulaciones no acreditan sesión, proveedor o Storage API reales. Las 15 restricciones RLS de Secuencias y las políticas POSTDEPLOY de Calendario, llamadas, derivados y Storage siguen **sin aplicar** hasta comprobar el despliegue compatible de Next y WS.
