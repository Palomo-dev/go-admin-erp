# Equipo comercial y territorios — evidencia del cierre

Frames: 1411:837770, 1411:838455, 1412:837868, 1412:838392 y 1413:1051.

El flujo usa la sesión canónica, permisos en servidor y una RPC transaccional auditada para equipos, miembros, territorios y configuración. Las fachadas de Configuración comercial usan esas mismas rutas. La simulación comparte el motor real, usa una rotación virtual y no escribe; conserva los responsables existentes porque los datos históricos no permiten distinguir una asignación manual de una automática.

Los territorios nuevos usan el DSL de Segmentos y toman el primer territorio coincidente por orden. Se preservan expresamente las reglas ICP históricas. El guardado consulta los solapamientos reales antes de confirmar. Un error de consulta se presenta con reintento; nunca se convierte en una simulación vacía ni en cifras cero.

Cuotas mensuales, cierre y conversión histórica usan la zona y la moneda de la organización. Se conserva 105 % como cifra y se limita únicamente la barra visual. Una tasa ausente produce un importe no disponible. El vendedor recibe su desempeño y porcentajes del ranking; otros importes individuales se ocultan. El ranking respeta la desactivación de la organización. Las reuniones cuentan eventos confirmados, como exige la anotación 1412:839049; no representan únicamente reuniones realizadas.

## Pruebas

- 147 pruebas en seis suites: motor real y simulación, privacidad, divisas históricas, formularios/estados en cuatro idiomas, fachadas de Configuración y rechazo de las cuatro variantes de organización ajena. Último pase completo en TZ UTC; el pase focal en TZ America/Bogota cubrió 106 pruebas, incluidos todos los cambios de Equipo.
- ESLint limpio en los archivos tocados. TypeScript focal de UI y servicios de Equipo: cero errores, incluyendo la declaración Desktop global.
- Harness SQL con los bytes exactos de propuesta y rollback, todo dentro de BEGIN/ROLLBACK: 23 aserciones. Incluye doble aplicación, doble rollback y reaplicación conservando los mismos datos; referencias ajenas, actor falso, falta de membresía, versión obsoleta, cascada de desactivación y auditoría atómica; ACL de cada rol y ejecución denegada del snapshot privado por authenticated.
- El snapshot privado liga temporalmente el actor humano validado, reutiliza app_branch_access y restaura la identidad. Se verificó con un actor real de rol distinto de administrador que tiene restricciones de sucursal. Ganado, conteos, ciclo y calendario respetan ese alcance; las llamadas resuelven la sucursal mediante su oportunidad o cliente.
- Dos territorios creados en el harness SQL se evaluaron con el helper TypeScript compartido: dos coincidencias y orden 1 antes de 2. Ningún cliente de prueba creado ni modificado.
- Comprobación MCP posterior al rollback: funciones nuevas 0, columna sort_order originalmente ausente, fixtures de equipos 0, territorios 0 y eventos 0. La propuesta se aplicó posteriormente por el coordinador con versión 20261002061535.

MD5 de propuesta: 2162882cdff02a683bb7d909b4f23564. MD5 de rollback: cd3a1dfb0096da118b2cd62b3ea5b442. El rollback lógico conserva la columna aditiva de prioridad para no borrar ordenaciones del usuario; el rollback externo del harness restaura íntegramente el esquema inicial.

No acredita una verificación visual E2E de las 135 pantallas. La expansión no cambia las políticas RLS de escritura de clientes todavía desplegados; la UI nueva escribe exclusivamente mediante servidor/RPC.
