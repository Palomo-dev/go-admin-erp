# Lista del Contador contra el sistema real

Fecha: 2026-11-06. Base: `main` y proyecto `taqjemqjtumhwptchcxk`.

El Contador no auditó el código. Esta comparación sí: lee las funciones y las pantallas, y mide la base.
La base se restauró el 2026-11-03: 439 asientos, 0 cuentas bancarias, 0 activos fijos, 0 nóminas.
**Un cero aquí no prueba que el flujo funcione ni que falle.** Nada de esto se recorrió con una sesión real.

Estados: **Existe**, **Incompleto**, **Falta**, **Por confirmar** (depende de una norma o versión que el
Contador debe fijar: no se implementa por suposición).

## Las 8 brechas por riesgo

Las cifras de las brechas 1, 2, 3 y 6 se volvieron a medir por separado el mismo día.

| # | Brecha | Evidencia | Quién decide |
|---|---|---|---|
| 1 | Los cobros en línea entran brutos al banco | 123 asientos debitan 1110 por $ 9.801.451, sin línea de comisión. El banco no cuadrará con el desembolso | Contador: cuenta puente |
| 2 | La propina va a gasto | Las 33 empresas tienen la regla D 5105 / C 1105. Debería ser dinero de terceros. Su reparto no deja asiento | Contador: cuenta destino |
| 3 | La nómina no contabilizaría bien | `fn_auto_journal_payroll` usa 5195, que es título en las 33 empresas. Hay doble costo patronal y retención en 0. Sale de leer el código: 0 nóminas corridas | Desarrollo |
| 4 | Tercero incompleto en el libro | 123 de 246 líneas de 1305 sin NIT. La reversa de 5 argumentos no copia el tercero. El auxiliar por tercero y la exógena heredan el problema | Desarrollo |
| 5 | Sin depreciación ni deterioro | Sin proceso mensual ni asiento. Balance y EBITDA quedan sobrestimados | Desarrollo y Contador |
| 6 | Perfil tributario vacío y sin vigencias | 0 de 33 empresas con responsabilidades. Hoy no se puede saber qué obligaciones tiene cada una | Producto y Contador |
| 7 | Estados NIIF ausentes de `main` | Están en los PR #460 y #463, atrasados más de 350 commits y sin sus migraciones en la base nueva | Desarrollo |
| 8 | La bandeja de fallos no tiene salida | Se ve y bloquea el cierre, pero no se reintenta desde pantalla ni por cron | Desarrollo |

## 1. Atributos contables y fiscales

| Punto | Estado | Qué hay y qué falta |
|---|---|---|
| Perfil tributario de empresa por vigencia | Falta | Campos planos sin fechas ni pantalla de responsabilidades |
| Perfil tributario de terceros por vigencia | Falta | Campos sin fechas, y el cálculo de impuestos no los usa |
| NIIF corriente y no corriente | Existe | `presentacion_niif`, con pantalla |
| NIIF efectivo o equivalente | Falta | Sin atributo por cuenta |
| NIIF categoría de flujo | Falta | Sin atributo. `fn_reporte_flujo_efectivo` fija inversión y financiación en 0 |
| Dimensiones obligatorias | Incompleto | Aplican en asiento manual y documentos, sin barrera en todas las rutas |
| Mapeo fiscal, columna exógena | Incompleto | `concepto_exogena` en 0 cuentas. Ya tiene campo en el panel nuevo |
| Mapeo fiscal, formatos | Por confirmar | Formatos y versión vigente |

## 2. Control contable

| Punto | Estado | Qué hay y qué falta |
|---|---|---|
| Asientos cuadrados | Existe | Lo garantiza un disparador de la base |
| Reversas sin duplicados | Existe | Índice único por `fact_key` |
| Reversas exactas | Incompleto | Una de las dos versiones pierde el NIT |
| Bandeja de pendientes | Incompleto | Solo lectura, sin reintento |
| Salud contable | Incompleto | `v_salud_contable` existe, sin pantalla |
| Trazabilidad | Incompleto | `created_by` nulo en 85 % de los asientos. Solo compras enlaza al documento |
| Soportes | Incompleto | Sin adjuntos en asiento manual ni compras |
| Configuración no altera históricos | Incompleto | Ninguna función lo hace por configuración. Falta permiso en `fn_puc_migracion_aplicar`. El caso de cuenta con saldo quedó resuelto con el alta nueva, salvo en «Nueva cuenta» e importación |

## 3. Tesorería

| Punto | Estado | Qué hay y qué falta |
|---|---|---|
| Cartera y proveedores por documento y cuota | Existe | Sin prueba de uso real |
| Vencimientos | Incompleto | `days_overdue` guardado, no calculado al corte. Los procesos diarios no están en cron |
| Anticipos de clientes | Existe | Sin prueba de uso real |
| Anticipos a proveedores | Falta | Ninguna regla usa 1330 |
| Propinas | Incompleto | Ver brecha 2 |
| Recaudos y mandatos | Falta | 2815 existe y nadie la usa. Por confirmar qué casos aplican. Aquí encaja la consignación |
| Conciliación bancaria | Incompleto | Separa GMF, comisión e interés. Falta prueba con extracto real |
| Billeteras y pasarelas | Falta | Sin cuenta puente |
| Bruto, comisión y neto | Falta | Ver brecha 1 |

## 4. Estados financieros

Los PR #460 y #463 hacen lo mismo dos veces. **Conviene partir de #460**: lee por servidor y trae más pruebas.
#463 depende de una tabla que solo crea #460. Ninguno aplica tal cual sobre `main`.

| Punto | Estado | Qué hay y qué falta |
|---|---|---|
| Flujo indirecto | Falta | Solo en PR. Transferencias internas se anulan solas; las operaciones sin efectivo no se excluyen. Compara contra el saldo de la 11, no contra extractos |
| Flujo directo (opcional) | Incompleto | Solo `payments`. No bloquea |
| Cambios en el patrimonio | Falta | Solo en PR |
| Notas | Falta | Solo en PR |
| Certificación | Falta | Solo en PR |
| Libros tributarios | Incompleto | Diario y balance de prueba. Faltan inventarios y balances, y mayor consolidado |

## 5. Analíticas

| Punto | Estado | Qué hay y qué falta |
|---|---|---|
| Cartera y proveedores por edades | Incompleto | Falta calcular al corte y cuadrar con el mayor |
| Tablero de errores contables | Incompleto | Solo avisos |
| Liquidez, endeudamiento, rotaciones | Falta | Solo en PR |
| Ciclo de caja | Falta | Tampoco en los PR |
| Márgenes y rentabilidad | Incompleto | Margen neto. Faltan operacional, ROA y ROE |
| Presupuesto contra real | Incompleto | Suma sin filtrar estado |
| Horizontal y vertical | Incompleto | Comparativo y % de ingresos |
| EBITDA | Falta | Depende de la depreciación |
| Indicadores hoteleros | Incompleto | Cuenta reservas, no noches. Puede pasar de 100 % |
| Proyección de caja | Incompleto | Ignora vencidos, nómina e impuestos |

## 6. Otros procesos

| Punto | Estado | ¿Asiento? | Qué falta |
|---|---|---|---|
| Activos fijos | Incompleto | No | Alta y baja contables |
| Depreciación | Falta | No | Proceso mensual |
| Deterioros y provisiones | Falta | Solo manual | Definir con el Contador |
| Kárdex integrado | Incompleto | Sí | 40 de 233 movimientos sin asiento ni fallo (costo 0) |
| Producción | Incompleto | No | Decidir el asiento |
| Valoración de inventarios | Incompleto | Sí | Promedio por sede, sin valor neto de realización |
| Recetas | Existe | Sí | Prueba con datos reales |
| Mermas | Existe | Sí | Prueba con datos reales |
| Nómina | Incompleto | Con defectos | Ver brecha 3 |

## 7. Tributario

| Punto | Estado | Qué hay y qué falta |
|---|---|---|
| IVA | Incompleto | El reporte mezcla IVA e INC. Borrador 300 solo en PR |
| INC | Incompleto | Asiento separado, reporte mezclado |
| Retenciones practicadas | Existe | Sin prueba de uso real |
| Retenciones sufridas | Incompleto | Ningún asiento automático usa 1355 |
| Renta | Por confirmar | Norma y tarifa |
| SIMPLE | Por confirmar | Norma y tarifa |
| Exógena | Por confirmar | Formatos y topes del año |
| Conciliación fiscal | Por confirmar | Versión vigente de los formatos |
| Certificados | Incompleto | Proveedores sí. Formato 220 solo en PR |
| Obligaciones por empresa | Incompleto | Campo vacío que no gobierna ninguna lógica |
