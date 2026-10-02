# Candidatos y activaciones SQL del CRM

Los archivos de esta carpeta conservan candidatos revisables; la copia exacta aplicada vive en supabase/migrations con su reversión en supabase/rollbacks. Un comentario original «propuesta» no sustituye la versión real documentada.

- Historial legado: aplicado como `20261002052625`, documentado en fase 61; dos reuniones reparadas, cuatro historiales coherentes. Los candidatos finales se conservan como referencia de revisión.
- Expansión compatible de calendario: aplicada como `20261002054023`, MD5 `2c7724a3b0cc6b0d606134a701631bd9`; rollback `ccf934719428a71c1ee360bc92d03bc9`. Las nueve policies de calendario_reuniones_rls siguen pendientes de desplegar los escritores canónicos. [Pruebas y orden](calendario_reuniones_rls.md).
- Trigger duplicado de oportunidades: aplicado como `20261002054026`, MD5 `ea9c37aef78b76f770ef085b57514472`; rollback `3017edf0ad3044aeaba23b9c1f361a75`. Se conserva el trigger canónico.
- Llamadas atómicas y acceso directo: candidato en validación final. [Gate de activación](llamadas_atomicas.md). La variable CRM_CALL_ATOMIC_RPC_ENABLED sigue apagada mientras no esté aplicada y verificada la expansión.
- Conexiones desde factura/cotización/Chat: candidato pendiente de batería SQL real y aplicación; no acredita una versión viva.
- Equipo, telefonía y Salud: propuestas en elaboración, sin aplicación acreditada.

La conexión se recuperó el 2026-10-02. La evidencia y versiones están en [PLAN-FIGMA-A-CODIGO.md](../PLAN-FIGMA-A-CODIGO.md). Todas las aplicaciones se realizan únicamente por MCP y dejan SQL exacto, rollback, MD5 y versión real conforme a [POLITICA-MIGRACIONES.md](../../POLITICA-MIGRACIONES.md). Las activaciones restrictivas se separan del cambio compatible para preservar el runtime actualmente publicado.
