# Campañas de voz: RNE opcional y topes coherentes

Estado: **aplicado por MCP como `20261004164119`** el 4 de octubre de 2026.
Ninguna llamada, campaña, saldo o fila comercial se modificó al instalar estas
cuatro funciones. La eliminación del panel y de la condición RNE en `main` no
había eliminado las comprobaciones dentro de PostgreSQL.

## Delta verificado

Cuatro funciones vigentes exigen una constancia RNE en el guardado, reclamación,
reserva o envío. `fn_claim_voice_agent_calls` ya delega al guard privado y no
necesita otro motor ni otra modificación. El candidato sólo modifica:

| Función | MD5 del cuerpo previo | MD5 del cuerpo propuesto |
| --- | --- | --- |
| `crm_voice_campaign_save(integer,uuid,timestamptz,uuid,jsonb)` | `bef7609d5e20d8e549a720243e216c49` | `7d4c4de0098deb3df63f62d30bfac4dd` |
| `crm_voice_call_claim_gate(integer,uuid)` | `3df817b3d239cf71921d2b1eab27313f` | `9bc16f16567fcc425047b9a24d394297` |
| `crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb)` | `c80e1e48133988ea6a6be46727e29177` | `46830191e7c178e88cf508677e76eede` |
| `crm_voice_dispatch_begin(integer,uuid)` | `42cd5945aab2b81adaabcd513fa58b51` | `4041ad4a30521d84a5b14504f8ba1013` |

La RPC de guardado propone 120 llamadas/día, 40/hora y 5 simultáneas cuando
faltan esos campos al crear. Son los defaults de las columnas actuales;
`comm_settings.voice_max_concurrent_calls` también tiene default 5. Los agentes
mantienen sus propios defaults 50/20. No se modifican cuotas guardadas,
campañas anteriores ni configuración de organizaciones. Los límites existentes
siguen verificándose; si una organización permite menos de 5 llamadas
simultáneas, el formulario debe enviar una elección dentro de su límite.

RNE deja de ser una condición de activación o despacho. Se conservan los datos
de verificaciones/importaciones existentes y la restricción de cambiar una
audiencia con historia. `fn_can_contact` conserva bajas voluntarias y
consentimiento. Se respeta el contrato explícito del commit `26293` de `main`:
la lista de números RNE/excluidos tampoco bloquea la marcación. No se introduce
otra clasificación de esa lista ni otra barrera contradictoria con el runtime.
La organización elige sus contactos y topes; las bajas voluntarias y las
franjas del motor actual siguen vigentes.

Se mantienen pertenencia, referencias del tenant, canal, política de datos,
agente activo, teléfono y zona del cliente esperados, estado de campaña y
parada de emergencia, topes por agente/campaña/cliente, concurrencia,
idempotencia, locks y evidencia del intento. Las franjas y la normalización
siguen en el motor actual del servidor; este SQL no sustituye ese evaluador.

## Aplicación y reversión

Los dos archivos contienen cuerpos completos y guardas de hashes, propietario,
`SECURITY DEFINER`, `search_path` y ACL. Sólo `postgres` ejecuta el guard de
reclamación; las otras tres RPC siguen limitadas a `postgres`/`service_role`.
La aplicación y la reversión aceptan exclusivamente la versión previa o la
propuesta y comprueban el resultado esperado. Ningún permiso se amplía.

| Candidato | Bytes | SHA-256 |
| --- | ---: | --- |
| `voz_campanas_rne_opcional.sql` | 31.924 | `6d35fe8cf495adb39f316d208ec56e3a3778273606544427d99d70b127573d10` |
| `voz_campanas_rne_opcional.rollback.sql` | 33.852 | `ebbd6f1b7178a77ad0eb85584845122315442c5d93991670e159ec7eccaf05b4` |

El coordinador contrastó el catálogo, probó los bytes finales con doble
aplicación y reversión acotadas dentro de `BEGIN/ROLLBACK` y verificó después
los cuatro hashes originales restaurados. Una revisión independiente de
campañas confirmó el contrato compatible con `main`. El MCP aplicó
posteriormente el delta y el catálogo confirmó los cuatro cuerpos propuestos
y las ACL originales. Se archivaron los bytes exactos en
`supabase/migrations/20261004164119_crm_voz_campanas_rne_opcional_topes.sql` y
su rollback en `supabase/rollbacks` con la misma versión; MD5 local/remoto del
SQL aplicado `9228baef1837c54945feab106181a3d0`. No se activaron las 59 policies
restrictivas pendientes.

El rollback restaura las cuatro definiciones anteriores completas y sus ACL;
reintroduce RNE obligatorio y los defaults 50/20/3 de la RPC. No deshace datos ni
cobra/reembolsa créditos. Requiere coordinar también el runtime y revisar las
campañas creadas mientras RNE era opcional; no es una recuperación unilateral.

Verificado: cuerpos/ACL/defaults reales, comparación del delta, doble aplicación
y rollback de los bytes finales, hashes originales posteriores al rollback y
los cuatro hashes/ACL posteriores a la aplicación persistente. **No se
invocaron RPC comerciales, no se escribió ninguna fila de clientes/campañas ni
se enviaron llamadas.** El recorrido con sesión y proveedores es evidencia
separada, todavía pendiente; la instalación SQL no lo acredita.
