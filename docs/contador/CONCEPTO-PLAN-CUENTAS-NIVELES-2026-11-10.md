# Concepto del Contador: crear cuentas en cualquier nivel del plan (2026-11-10)

Pedido del dueño el 2026-11-10: crear desde la tabla del plan de cuentas cuentas, subcuentas,
auxiliares y subauxiliares, no solo auxiliares (decisión del 2026-11-06). El Contador respondió
«sí a los tres, con estos ajustes». El dueño dio su OK para aplicar el mismo día.

## Lo que pidió el Contador y cómo quedó

| # | Pedido | Cómo quedó | Dónde |
|---|---|---|---|
| 1a | Traslado desde cuentas de 4 dígitos (1110 → 111005) con las mismas reglas | Sí. Mismo mecanismo en todos los niveles | `fn_plan_crear_cuenta_hija` |
| 1b | Trasladar por tercero y por centro de costo, no como un total | Ya era así: una línea por sede, tercero y centro de costo. Probado con dos terceros: 4 líneas, una por tercero | migración `20261110210000` |
| 1c | La cuenta de arriba deja de recibir movimientos; lo que apunte a ella pasa a la nueva o queda bloqueado con aviso; ningún asiento automático cae en la de arriba | Se mueven: cuentas bancarias, reglas contables, mapeos por sede, mapeos de impuestos, categorías de tesorería, categorías, productos, configuración contable (disparador), y ahora también cajas abiertas, anticipos vigentes y plantillas de asiento. Para cualquier otro origen (documentos ya emitidos), `plan_cuentas_sucesoras` + `fn_puc_linea_solo_movimiento` llevan la línea a la cuenta nueva. Una cuenta de título sin sucesora sigue rechazando la línea (queda en asientos pendientes con aviso) | `20261110210000` |
| 1d | La cuenta de arriba queda en cero; los informes de periodos anteriores no cambian | Se verifica al final del traslado: si no queda en cero, se deshace todo (`TRASLADO_INCOMPLETO`). Los asientos históricos no se tocan | `20261110210000` |
| 2a | Cuentas y subcuentas de 5 en 5 | Sí, en servidor y pantalla | `20261110190000` |
| 2b | Sugerir primero el código que el PUC tiene para el concepto; avisar si el código no está en el catálogo | Catálogo nuevo `puc_catalogo` (Decreto 2650 de 1993: 9 clases, 52 grupos, 340 cuentas, 2.102 subcuentas). Al abrir el alta se propone el primer concepto del PUC que la empresa no tiene, con su nombre; escribir el nombre de otro concepto cambia el código al suyo; si el código no está en el catálogo, o tiene otro nombre en el PUC, se avisa sin bloquear | `20261110220000`–`220020`, `PlanCuentasPage` |
| 2c | Auxiliares y subauxiliares de 1 en 1 | Sí; no usan catálogo | — |
| 3a | Subauxiliares de 10 dígitos; solo el último nivel recibe movimientos | Sí. Al crear el subauxiliar, el auxiliar pasa a título con el mismo traslado | `20261110210000` |
| 3b | Reportes, balance de prueba y exógena suman bien desde 10 dígitos | Todos los niveles suman bien. Se corrigieron el libro mayor y balances, el libro de inventarios y balances y el resumen del auxiliar por tercero, que no aceptaban 10 dígitos como fila propia, y los selectores de nivel. La exógena **no existe todavía** como reporte: cuando se construya, debe leer `concepto_exogena` de la cuenta de movimiento (la de 10 lo hereda del padre) | `20261110230000`, `nivelesPuc.ts` |
| 3c | No pasar de 10 dígitos | Tope en servidor y pantalla: el subauxiliar no tiene «+» | `20261110210000`, `planCuentasAlta.ts` |

## Hallazgos para el Contador

- `puc_plantilla`, que siembra el plan de las organizaciones nuevas, tiene diferencias con el
  Decreto: los grupos de contrapartida de orden van corridos (usa 84, 86, 88 y 94, 96, 98; el
  Decreto define 84, 85, 86 y 94, 95, 96), y 25 nombres distintos, entre ellos 1598, 8305, 9305 y
  539595 («Ajuste al peso» cuando el oficial es 429581). No se tocó: requiere su concepto.
- El catálogo no incluye 171072, 3110, 311005 y 311010, eliminados por el Decreto 2894 de 1994, e
  incluye 939520 «Pedidos colocados», que puc.com.co omite.
