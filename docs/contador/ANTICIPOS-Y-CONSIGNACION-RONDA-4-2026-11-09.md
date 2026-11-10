# Anticipos y consignación — correcciones de la ronda 4 del Contador (2026-11-09)

Respuesta punto por punto a las secciones **Anticipos** y **Consignación** de
`RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md`. IVA y perfil van en `IVA-Y-PERFIL-RONDA-4-2026-11-09.md` (otro equipo).

**Estado: nada aplicado.** Las tres migraciones siguen *SIN APLICAR* en el proyecto `taqjemqjtumhwptchcxk`; anticipos
no se activó; no se reclasificaron históricos, no se presentaron declaraciones ni se hicieron pagos. Toda la evidencia
sale de corridas en seco: una transacción que termina en excepción (rollback), con escrituras solo en la org 374.

| Archivo | md5 final |
|---|---|
| `supabase/migrations/20261108120500_organization_links.sql` (sin cambios en esta ronda) | `6a5a3ead2fe311fdde4b7d5c0376c12b` |
| `supabase/migrations/20261108121000_consignaciones.sql` | `d2a58b49b6016488ba3287a48511d4d5` |
| `supabase/migrations/20261108170000_anticipos_proveedores_contador.sql` | `ca6171f8dfbc5cb11ec40a831ea589df` |
| `supabase/rollbacks/20261108121000_consignaciones_rollback.sql` | `bce951a78267eaf3e01ae2458248cc73` |
| `supabase/rollbacks/20261108170000_anticipos_proveedores_contador_rollback.sql` | `1c08321be89257fcab178dcb9194d57e` |

## Evidencia

| Prueba (`docs/contador/pruebas/`) | md5 del archivo | Resultado |
|---|---|---|
| `20_anticipos_consignacion_integrada_completa.sql` — **integrada**, archivos completos y exactos | `f2d1317144f81d385a740a0b4483793b` (ejecutado `628002461a66b5998f68b664a7091066`) | **247/247** (carga 7 · 11: 53 · 21: 54 · 15: 73 · 22: 39 · 20: 21) |
| `21_anticipos_ronda4_aiu_ica_devoluciones.sql` | `e03fb5424b8bcd949d15c50b3f721faa` | 54/54 |
| `22_consignacion_ronda4_retenciones_y_comision.sql` | `41d4044f81b93c982ca73975d27f789c` | 39/39 |
| `11_anticipos_correcciones_contador.sql` (re-corrida) | `36401b7e40230aa0d203995b6fbdca0b` | 53/53 |
| `14_consignaciones_ronda2_punta_a_punta.sql` (re-corrida) | `7f06eafd193b481ab1d285e42982f0ee` | 52/52 |
| `15_consignaciones_ronda3_comision_y_retenciones.sql` (re-corrida) | `673d6320a7f1130c5579b8574d0fb2d1` | 73/73 |

Cada `.resultado.txt` lleva la fecha, el md5 de cada migración cargada y los conteos. La integrada carga **dentro de la
misma transacción** las 7 migraciones en orden de versión (las dos de este trabajo y las 4 de perfil/tarifas del otro
equipo, tal como están en disco), comprueba el md5 de cada archivo completo contra el del repositorio y luego corre, sobre
el mismo estado, los cuerpos completos de 11 → 21 → 15 → 22 → 20. Cubre retenciones, certificados, devoluciones y
anulaciones **entre períodos** (octubre ↔ noviembre ↔ diciembre de 2026) y **entre años** (diciembre de 2025 ↔ enero
de 2026). No se cargaron las migraciones de IVA (140000, 150000, 150500, 151000, 152000, 161000, 161500): ninguna
función de anticipos o consignación las llama.

## Anticipos

### 1. AIU: dos regímenes, fundamento estructurado y validación

| Qué pidió | Qué cambió | Dónde | Prueba |
|---|---|---|---|
| La regla «solo utilidad» no basta; fundamento con operación, contrato, norma, base y condiciones | Se retiró `reteiva_aiu_reglas`. Nueva tabla `aiu_contratos`: régimen, servicio, número/fecha/archivo/valor del contrato, norma, `condiciones` (jsonb), base de retefuente y reteICA, estado `pendiente_validacion`/`validado`/`rechazado` | 170000 §AIU, `fn_aiu_contrato_registrar` | 21 A1–A2 |
| 462-1: base = A + I + U, nunca menor al 10 % del contrato, solo servicios comprendidos | Régimen `servicios_462_1`: el IVA va sobre A+I+U con piso del 10 %; exige servicio de la lista y sus condiciones | `fn_anticipo_proveedor_evaluar_retenciones` | 21 A1a, A3, A4 (mínimo aplicado) |
| Construcción (DUR 1.3.1.7.9): honorarios o, si no se pactan, utilidad; sin el 10 % | Régimen `construccion_inmuebles` con licencia en las condiciones; base honorarios o utilidad, sin piso | idem | 21 A1c, A5, A6 |
| Mantenimiento no es construcción | Se rechaza (`aiu_mantenimiento_no_es_construccion`) | `fn_aiu_contrato_registrar` | 21 A1b |
| Nada opera sin validar | El evaluador deja la retención *pendiente* con el contrato sin validar, rechazado o no vigente; valida un usuario con `finance.approve` distinto de quien registró, con concepto ≥ 20 caracteres | `fn_tributario_regla_validar` | 21 A2b–A2e |

Las líneas AIU ya no se ofrecen en el formulario del anticipo (`contrato.ts`: `TRATAMIENTOS_COMPONENTE` sin `aiu_*`); la
base rechaza la operación sin contrato (`aiu_contrato_obligatorio`).

### 2. ReteICA excesiva: procedimiento por municipio

- Nueva tabla `reteica_procedimientos` por municipio y vigencia: norma, solicitud, pruebas, reintegro, certificado,
  período de descuento (`periodo_del_reintegro` · `periodo_siguiente_al_reintegro` · `periodo_del_hecho`), tratamiento de
  excedentes, y la misma validación por un segundo usuario.
- `fn_reteica_procedimiento_exigir` busca el procedimiento **validado y vigente del municipio de la regla con que se
  practicó**; sin él, `reteica_sin_procedimiento_municipal` (bloqueado). No se traslada el de otro municipio. Con él,
  exige cada prueba que ese municipio pide (`reteica_pruebas_incompletas`).
- Evidencia: 21 B1–B5 (B3: procedimiento validado de otro municipio → bloqueado; B4c: ICA en el período que fija su
  procedimiento; B5d: reintegro del exceso de reteICA).

### 3. Devoluciones

| Qué pidió | Qué cambió | Prueba |
|---|---|---|
| La solicitud del proveedor sola no prueba la anulación | El procedimiento exige el **soporte del hecho** (`hecho.tipo` entre resolución de mutuo acuerdo, resciliación, sentencia o laudo, nota crédito, anulación aceptada o acta de devolución; documento y fecha). `solicitud_proveedor` se rechaza con `solicitud_no_prueba_el_hecho` | 21 C1a, C1b |
| La devolución total no impide una resolución parcial | Nueva causa `resolucion_parcial` además de `operacion_anulada` y `devolucion_parcial`; no exige agotar el anticipo | 21 C1g (saldo queda en 595.000) |
| Proporción por líneas y retenciones realmente afectadas | Las devoluciones parciales llevan **líneas** (`componente`, base, IVA). Cada retención guarda su `cobertura` por línea y se revierte solo sobre lo que cubrió, con su base y su tarifa. Nunca prorrata ciega | 21 C1c–C1e, C1g (excluido: retefuente 8.000, reteICA 1.932, reteIVA 0; la prorrata habría dado 3.585) |
| El período no es de libre elección | `fn_retencion_periodo_descuento`: renta, período del hecho (DUR 1.2.4.17) y en exceso el del reintegro (1.2.4.16); reteIVA, el mismo criterio (*artículo por confirmar*); ICA, el que fije el procedimiento validado. Si el usuario manda un período distinto: `periodo_descuento_no_es_de_libre_eleccion`. Si no alcanza el período, queda pendiente `descuento_retencion_siguientes_periodos`; si cruza de año, `retencion_revertida_otro_anio` | 21 B4c, B5c, C1f, C2, C3a–C3c; 20 A1–A4 |
| Quitar la dependencia de «amortizar con factura» | Nueva `fn_anticipo_proveedor_convertir_en_pago` (tabla `supplier_advance_conversions`): la financiación se reevalúa cuando se convierte en pago o abono, con su soporte, sus líneas y sus retenciones (D anticipo / C retenciones) | 21 D1–D4, E1–E3 |

### Cifras

Se conservan las que el Contador encontró coherentes: 59.500 = 55.592 + 3.908 y 595.000 − 300.000 − 119.000 = 176.000
(prueba 11).

## Consignación

| # | Qué pidió | Qué cambió (20261108121000) | Prueba |
|---|---|---|---|
| 1 | No esperar el certificado; distinguir la estimada de la practicada | Estados `estimada` (nunca se asienta) y `practicada` (con asiento). Nueva `fn_consignacion_retencion_practicada` reconoce el hecho en su fecha (no anterior a la venta, no futura) | 22 Q2, Q3, R3; 20 C1, C3 |
| 2 | Explicar el asiento al conciliar, sin duplicar | **Operación** (la practica el comprador): D 281510 del dueño / C cartera del cliente, y queda el pendiente `consignacion_cartera_retencion_por_aplicar` para aplicarla a la factura. **Remuneración** (la practica el dueño): D 1355 retención sufrida / C cuenta por cobrar al dueño hasta su saldo, y el resto C 281510. **Conciliar** ya no asienta: compara el certificado con lo practicado (`retencion_no_reconocida` si no hay practicada; la diferencia queda como pendiente visible). Una misma retención no se registra dos veces (`retencion_ya_practicada`) | 22 R1–R8, Z1–Z4; 20 C7 |
| 3 | Anular una liquidación no cierra pendientes de hechos vigentes | `anular` ya no cierra pendientes de ventas o comisiones vigentes; guarda las asignaciones anuladas y la siguiente liquidación trae las practicadas (`carried_from`). Los pendientes se cierran como `reliquidada:<id>` cuando sus ventas quedan cubiertas, o como `venta_revertida` cuando se anula el **hecho** (la factura) | 22 A1–A3, C5–C6; 20 C4–C6 |
| 4 | O-15 no excluye sin verificar; agentes de reteIVA no solo 09/13; mismos criterios que anticipos | Consignación llama en tiempo de ejecución a los **mismos** criterios de anticipos (`fn_tributario_calidades_tercero`, `fn_tributario_evaluar_retencion`, `fn_tributario_retencion_practicar`), por comprador y por dueño. O-15 sin resolución y alcance verificados → `pendiente/autorretencion_sin_verificar`; agente de reteIVA acreditado por otro numeral (fundamento obligatorio) aunque no tenga 09 ni 13. Sin los criterios instalados: `pendiente/criterios_tributarios_no_instalados`, nunca se presume. Se retiraron `fn_consignacion_tiene_resp` y `fn_consignacion_aplicar_regla` | 22 Q1–Q6 |
| 5 | Comisión contra la 281510 solo con obligación real y compensación procedente | Nuevo término obligatorio en la recibida de intermediación: `compensacion_remuneracion` (si el contrato pacta compensar). Con pacto y **saldo exigible** (libros menos lo facturado «al cobro» y no cobrado) se descuenta de la 281510; sin pacto o sin saldo, D cuenta por cobrar al dueño (cuenta `cobro` obligatoria). Compensación posterior con `fn_consignacion_compensar_remuneracion` | 22 K1–K8, C1–C9, Z0 |
| — | Lado del mandante | **Sigue pendiente**, como dice el Contador: no se diseñó ni se construyó el circuito bilateral | — |

Error de la migración que encontró la prueba 22 y se corrigió: en una nota con obligación «al cobro», la devolución de
una factura no cobrada entraba sola a la liquidación y la dejaba en negativo. Ahora una devolución entra solo si su venta
ya se liquidó o ya se cobró (22 C9).

ReteICA de consignación usa la **regla municipal** de anticipos (`reteica_reglas`), no un impuesto de la organización
(22 K5–K6).

## Pantallas y código (`src/`)

- Anticipos: `SeccionRetencionesDevolucion.tsx` reescrita (causa, soporte del hecho, líneas afectadas con lo pendiente
  de cada una, vista previa, pruebas del procedimiento de ReteICA, sin campo de período: se explica la regla);
  `CamposPruebasIca.tsx` nuevo; `ExcesoRetencionDialog.tsx` pide solicitud y pruebas; el listado del servidor trae las
  líneas (giro y conversiones, con lo devuelto) y las pruebas del procedimiento validado del municipio. Las rutas
  `devolver` y `retencion-exceso` traducen los nuevos códigos.
- Consignación: el contrato recibido pregunta si se pacta compensar la remuneración; las retenciones muestran *Estimada*
  y *Practicada*; acción «Registrar practicada» (ruta nueva `POST /api/consignaciones/recibidas/retenciones/[id]/practicada`);
  la regla de reteICA se elige entre las municipales.
- Textos en es/en/fr/pt (`finanzasTercerosR4`, `consignacionesR4`). Jest de anticipos y consignación en verde.

## Lo que NO se hizo o sigue pendiente

1. **Ninguna migración aplicada** y anticipos sin activar; tampoco el resto del conjunto (el Contador no dio el visto
   bueno para activarlo).
2. **Lado del mandante** de la consignación (circuito bilateral): pendiente.
3. **Aplicar la retención a la cartera del cliente** (operación): la consignación deja el pendiente
   `consignacion_cartera_retencion_por_aplicar`; el abono por retención en el módulo de cuentas por cobrar no existe aún.
4. **Pantallas sin construir** (van primero a Figma): registro y validación de contratos AIU, registro y validación de
   procedimientos de ReteICA por municipio, conversión de financiación en pago o abono, compensación posterior de la
   comisión y configuración de las cuentas `cobro` y de retención sufrida. Hoy se operan por las RPC.
5. **Artículo del DUR para el período de reteIVA** en reversiones: se aplicó el mismo criterio que renta y quedó marcado
   «por confirmar».
6. **Autorretención de la propia organización** sin alcance registrado → la retención queda pendiente.
7. **Inter-organización** (I1–I6 de la prueba 14 con dos organizaciones): no se re-corrió; todas las escrituras de esta
   ronda fueron solo en la org 374.
8. **IVA** (140000–152000, 161000, 161500) no se cargó en estas corridas; ver el informe del otro equipo.

## Preguntas para el Contador

1. **reteIVA en reversiones**: ¿qué artículo del DUR fija el período de descuento? Hoy se usa el del hecho, como renta.
2. **Retención de la operación en consignación**: ¿confirma D 281510 del dueño / C cartera del cliente, con la
   aplicación a la factura como paso aparte, o prefiere que la retención del comprador se registre directamente como
   abono a la factura?
3. **Saldo exigible del dueño**: con obligación «al cobro», ¿es correcto excluir lo facturado y no cobrado al decidir
   si la comisión es compensable?
4. **Excedentes de ReteICA** cuando el período no alcanza: ¿basta el pendiente `descuento_retencion_siguientes_periodos`
   o cada municipio exige además solicitud de devolución?
5. **462-1, piso del 10 %**: ¿el 10 % se calcula sobre el valor total del contrato o sobre el valor de cada pago o abono
   (hoy, sobre el valor de la operación que se registra)?
