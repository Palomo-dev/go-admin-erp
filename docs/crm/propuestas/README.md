# Candidatos y activaciones SQL del CRM

Los archivos de esta carpeta conservan candidatos revisables; la copia exacta aplicada vive en supabase/migrations con su reversión en supabase/rollbacks. Un comentario original «propuesta» no sustituye la versión real documentada.

- Historial legado: aplicado como `20261002052625`, documentado en fase 61; dos reuniones reparadas, cuatro historiales coherentes. Los candidatos finales se conservan como referencia de revisión.
- Expansión compatible de calendario: aplicada como `20261002054023`, MD5 `2c7724a3b0cc6b0d606134a701631bd9`; rollback `ccf934719428a71c1ee360bc92d03bc9`. Las nueve policies de calendario_reuniones_rls siguen pendientes de desplegar los escritores canónicos. [Pruebas y orden](calendario_reuniones_rls.md).
- Trigger duplicado de oportunidades: aplicado como `20261002054026`, MD5 `ea9c37aef78b76f770ef085b57514472`; rollback `3017edf0ad3044aeaba23b9c1f361a75`. Se conserva el trigger canónico.
- Llamadas atómicas: expansión aplicada como `20261002054759`, MD5 `00b68ec23425460998276951fd02ad24`, rollback `aa67c80b9257a0d589278ca9d34831f1`. [Pruebas y activación](llamadas_atomicas.md). El runtime canónico se activa después de sus gates. El acceso directo restrictivo sigue diferido hasta desplegar los escritores nuevos.
- Conexiones desde factura/cotización/Chat: aplicadas como `20261002060251`, SQL MD5 `7926ca899d230b0058f2313e564ef282`, rollback `cfdbaa57c5a899012a48ec0ec41802de`. [75 comprobaciones reales y límites](conexiones_origen.md).
- Equipo: expansión aplicada como `20261002061535`, SQL MD5 `2162882cdff02a683bb7d909b4f23564`, rollback `cd3a1dfb0096da118b2cd62b3ea5b442`. Guardas de sucursal y actor, 23 comprobaciones SQL y reversión lógica que conserva prioridades.
- Salud: aplicada como `20261002062052`, SQL `96ef176efd86e55dac83032e91ae1f4e`, rollback `6abe027da8e241dda10f6487dcbae322`; [84 comprobaciones reales, cola y snapshots](salud_atomica.md).
- Telefonía, métricas de agentes y Objeciones: propuestas en elaboración o gate, sin aplicación acreditada.

La conexión se recuperó el 2026-10-02. La evidencia y versiones están en [PLAN-FIGMA-A-CODIGO.md](../PLAN-FIGMA-A-CODIGO.md). Todas las aplicaciones se realizan únicamente por MCP y dejan SQL exacto, rollback, MD5 y versión real conforme a [POLITICA-MIGRACIONES.md](../../POLITICA-MIGRACIONES.md). Las activaciones restrictivas se separan del cambio compatible para preservar el runtime actualmente publicado.
