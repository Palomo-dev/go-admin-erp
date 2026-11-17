# Nómina electrónica con Factus

Fecha: 2026-11-17. Fuente: documentación pública de Factus
(<https://developers.factus.com.co/nomina/descripcion-de-campos/> y páginas hermanas), leída ese día.

## Decisión

- **Factus sí emite nómina electrónica.** Lo confirmó el dueño el 2026-11-17.
- Se usa como la facturación electrónica: **un servicio de la plataforma** con las credenciales de GO Admin. Las
  credenciales propias del cliente son una opción avanzada.
- Es la fase 4 del módulo de Recursos humanos. Pasa por Figma y por la aprobación del dueño antes del código.

## Lo que expone Factus

| Acción | Método y ruta (sandbox `https://api-sandbox.factus.com.co`, producción `https://api.factus.com.co`) |
|---|---|
| Validar el cuerpo sin emitir | `POST /v2/payroll/validate` |
| Crear y enviar a la DIAN | `POST /v2/payrolls` |
| Eliminar, ver, listar, PDF, XML, respuesta de la DIAN | `/nomina/eliminar`, `/ver`, `/listar`, `/descargar-pdf`, `/descargar-xml`, `/descargar-application-response` (ver la documentación) |
| Nota de ajuste (reemplazar o eliminar) | Sección `nota-ajuste-nomina` (crear y validar, eliminar, ver, listar, descargas) |
| Tablas de códigos | `tablas-de-referencia/tablas-referencia-nomina` |

- Autenticación: `Authorization: Bearer <token>`. El token caduca cada hora.
- La respuesta trae el número (`data.number`, con el prefijo del rango de numeración), los datos de la empresa y los
  devengados y deducciones ya codificados.

## Puntos que condicionan el diseño

1. **Un documento por trabajador y por mes.** Si se paga quincenal o semanal, se envía un solo documento en el mes con
   todas las fechas de pago en `payment.payment_dates`. El motor liquida por período: hay que **sumar los períodos del
   mes** antes de enviar.
2. **`reference_code` único** por documento: evita duplicados. Sirve de clave de idempotencia (organización, vínculo,
   año y mes, versión).
3. **`numbering_range_id`** es obligatorio si la organización tiene más de un rango activo.
4. Datos del trabajador que hoy pueden faltar:
   - nombres y apellidos por separado;
   - dirección y municipio (código DANE) **del mes reportado**;
   - tipo y subtipo de trabajador, tipo de contrato y alto riesgo (Decreto 2090 de 2003).
5. Los objetos opcionales, una vez enviados, **no pueden ir vacíos**: no se envía la clave si no hay valor.
6. **Horas extra y recargos** (`accruals.hora`): cantidad con máximo dos decimales, porcentaje, valor y, de forma
   opcional, inicio y fin con hora. El motor de horas ya tiene esos datos.
7. **Fondo de solidaridad** (`deductions.dedu`): obligatorio desde 4 salarios mínimos, con su código de tipo de fondo.
   Encaja con el reparto en dos campos de la ronda 3 del Contador.

## Correspondencia con el catálogo de conceptos

| Factus | Conceptos del motor (`src/lib/hrm/nomina/conceptos.ts`) |
|---|---|
| `accruals.suel` | Salario básico |
| `accruals.tra` | Auxilio de transporte (o de conectividad) |
| `accruals.hora` | Horas extra y recargos, uno por tipo |
| `accruals.vaca`, `accruals.inca`, `accruals.lice` | Vacaciones, incapacidades (común, laboral), licencias (remunerada, no remunerada, maternidad, paternidad) |
| `accruals.prim`, `accruals.cesa` | Prima; cesantías e intereses (con `percentage`) |
| `accruals.comi`, `accruals.boni`, `accruals.auxi`, `accruals.otro` | Comisiones, bonificaciones salariales y no salariales, auxilios, otros |
| `accruals.inde`, `accruals.reti` | Indemnización y bonificación por retiro (liquidación de contrato) |
| `deductions.salu`, `deductions.pens`, `deductions.dedu` | Salud, pensión y fondo de solidaridad del trabajador |
| `deductions.rete` | Retención en la fuente |
| `deductions.libr`, `deductions.emba`, `deductions.coop`, `deductions.afco`, `deductions.pevo`, `deductions.otra` | Libranzas, embargos, cooperativas, AFC, pensión voluntaria, otras |

La tabla exacta de códigos (`accrual_type_code`, `deduction_type_code`, tipos de trabajador y de contrato) se carga
desde las tablas de referencia de Factus en la fase 4. No se escribe a mano.
