# Conexión Directa con DIAN - Proveedor Tecnológico de Facturación Electrónica

> **Fecha de investigación:** 2026-08-14
> **Módulos afectados:** Finanzas (facturación electrónica), CRM (clientes), Inventario (proveedores)
> **Proyecto Supabase:** `jgmgphmzusbluqhuqihj`
> **Estado:** Investigación - No implementado

---

## 1. Objetivo

Documentar a fondo el proceso, requisitos, costos, APIs y alternativas para que **go-admin-erp** se conecte directamente con la DIAN (Dirección de Impuestos y Aduanas Nacionales de Colombia), ya sea:

1. **Habilitándose como Proveedor Tecnológico (PT)** autorizado por la DIAN
2. **Integrándose con un PT ya autorizado** (white-label / API de terceros)
3. **Consultando APIs públicas** de DIAN y RUES

Este documento es la base para decidir la estrategia de integración con facturación electrónica y consulta de datos tributarios de terceros.

---

## 2. Contexto y marco normativo

### 2.1 Normativa vigente (2024-2026)

| Norma | Fecha | Descripción | Estado |
|---|---|---|---|
| **Resolución 000165 de 2023** | 01 nov 2023 | Norma principal. Desarrolla el sistema de facturación, proveedores tecnológicos, adopta **Anexo Técnico 1.9** | **VIGENTE** |
| Resolución 000008 de 2024 | 31 ene 2024 | Modifica arts. 23 y 62 de la Res. 165. Amplía plazo del anexo 1.9 al 1 de mayo 2024 | VIGENTE |
| Resolución 000119 de 2024 | 30 jul 2024 | Modifica Res. 165. Aplaza documentos equivalentes al 1 de nov 2024 | VIGENTE |
| Resolución 000202 de 2025 | 2025 | Implementa servicio de consulta de adquirientes (`GetAcquirer`) | VIGENTE |
| Resolución 000042 de 2020 | 05 may 2020 | Norma anterior, parcialmente sustituida por Res. 165 | Derogada parcialmente |
| Decreto 358 de 2020 | 05 mar 2020 | Reglamenta arts. 511, 615, 616-1 a 619 del Estatuto Tributario | VIGENTE |
| Ley 2277 de 2022 | 13 dic 2022 | Reforma tributaria. "Impuestos Saludables" (arts. 513-1 al 513-13) | VIGENTE |
| Resolución 000187 de 2023 | 28 nov 2023 | Fija UVT 2024: **$47.065** | VIGENTE |
| Resolución 000193 de 2024 | 2024 | Fija UVT 2025: **$49.799** | VIGENTE |

### 2.2 Anexos técnicos

- **Anexo Técnico de Factura Electrónica de Venta Versión 1.9**: vigente desde 1 de mayo 2024
- **Anexo Técnico de Documento Equivalente Electrónico Versión 1.0**: expedido con Res. 165
- Estándar XML: **UBL 2.1** (OASIS)
- Firma: **XAdES-EPES**
- Hash CUFE/CUDE: **SHA-384**

### 2.3 Fuentes oficiales

- [Normatividad DIAN](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/normatividad/)
- [Resolución 165 de 2023 - PDF](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000165%20de%2001-11-2023.pdf)
- [Resolución 008 de 2024 - PDF](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000008%20de%2031-01-2024.pdf)
- [Resolución 119 de 2024 - PDF](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000119%20de%2030-07-2024.Pdf)
- [Compilación Jurídica - Res. 165](https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0165_2023.htm)

---

## 3. Modalidades de operación

La DIAN reconoce cuatro modalidades para emitir factura electrónica:

| Modalidad | Descripción | Responsable | ¿Requiere habilitación PT? |
|---|---|---|---|
| **Software Propio / Desarrollo Propio** | Sistema creado internamente o adquirido, opera bajo el NIT del facturador | El facturador responde directamente | No (solo registro + pruebas) |
| **Software Adquirido** | Software comprado a terceros con licencia de uso, opera bajo NIT del facturador | El facturador responde directamente | No |
| **Proveedor Tecnológico (PT)** | Tercero habilitado por DIAN que factura a nombre de sus clientes bajo su propio NIT | El PT responde por generación/transmisión; el cliente por la expedición | **Sí** (proceso completo) |
| **Facturación Gratuita DIAN** | Servicio gratuito de DIAN | DIAN provee todo | No |

### 3.1 Diferencia clave (Concepto DIAN 1889 de 2025)

- **Desarrollo Propio**: sistema que opera **exclusivamente bajo la identificación del facturador**, bajo su cuenta y riesgo.
- **Proveedor Tecnológico**: tercero habilitado que ejecuta con su software la generación, transmisión y entrega de documentos electrónicos **bajo su NIT**.

**Lo que revisa la DIAN**: aspectos técnicos (XML, CUFE, firma), correspondencia ID software ↔ NIT facturador, superación de pruebas.

**Lo que NO revisa**: propiedad intelectual del software, licencias, disputas contractuales.

Fuentes: [Concepto 1889 - CIJUF](https://cijuf.org.co/normatividad/concepto/2025/concepto-concepto-1889015968.html) · [CR Consultores](https://crconsultorescolombia.com/delimitacion-de-responsabilidades-software-propio-frente-a-proveedor-tecnologico-dian-concepto-1889015968.php) · [DIAN - Cómo facturar](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/como-puedes-facturar-electronicamente/)

---

## 4. Requisitos para ser Proveedor Tecnológico

### 4.1 Requisitos legales (Art. 55 Resolución 165 de 2023)

#### 4.1.1 Constitución societaria
- Estar constituido como **sociedad en Colombia** (SAS) o sucursal de sociedad extranjera
- Inscrito en el RUT

#### 4.1.2 Objeto social
Debe incluir explícitamente las actividades de:
- Generación
- Transmisión
- Expedición
- Entrega
- Recepción de factura electrónica de venta
- Notas débito
- Notas crédito
- Instrumentos electrónicos derivados de la factura

> Este requisito debe conservarse durante toda la vigencia de la habilitación.

#### 4.1.3 Patrimonio mínimo

| Concepto | Requisito | Valor 2024 (UVT $47.065) | Valor 2025 (UVT $49.799) |
|---|---|---|---|
| Patrimonio contable | ≥ 20.000 UVT | **$941.300.000 COP** | **$995.980.000 COP** |
| Propiedad, planta y equipo | ≥ 10.000 UVT (dentro del patrimonio) | **$470.650.000 COP** | **$497.990.000 COP** |

- PPE debe estar **localizado en Colombia**
- Se acredita con estados financieros firmados por representante legal + contador/revisor fiscal
- Debe mantenerse durante toda la vigencia (5 años)

#### 4.1.4 Certificación ISO 27001
- Certificación sobre sistemas de gestión de seguridad de la información
- Si no se tiene al solicitar: **carta compromiso de obtenerla en máximo 18 meses** desde la notificación de habilitación

#### 4.1.5 Plan de contingencia
Acreditar plan para garantizar continuidad de:
- Generación, transmisión, expedición de factura electrónica
- Recepción de factura, ND, NC y documentos derivados

#### 4.1.6 Infraestructura física y técnica
- Documentación de la infraestructura física
- Capacidad técnica para operar los servicios

#### 4.1.7 Actualización RUT
- Registrar **responsabilidad 39** (Proveedor de Servicios Tecnológicos - PST)

### 4.2 Requisitos técnicos

- Certificado digital de firma (PKCS#12, .p12/.pfx) de entidad ONAC
- Integración con Web Services SOAP de DIAN
- Sistema de gestión de seguridad de la información
- Infraestructura de servidores en Colombia
- Plan de recuperación de desastres
- Cumplimiento del Anexo Técnico versión 1.9 (UBL 2.1, XAdES-EPES)

Fuentes: [Preguntas y Respuestas PT - PDF](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Preguntas-y-respuestas-Proveedores-Tecnologicos-FE.pdf) · [Actualicese](https://actualicese.com/archivo/requisitos-para-que-proveedores-tecnologicos-sean-autorizados-por-la-dian/)

---

## 5. Proceso paso a paso de habilitación

### 5.1 Plataforma de registro

- **Portal:** https://www.dian.gov.co
- **Ruta:** Temas de interés → Factura Electrónica → Habilitación
- **Ambiente de habilitación:** https://catalogo-vpfe-hab.dian.gov.co/User/Login
- **Correo de contacto:** proveedorestecnologicosfe@dian.gov.co

### 5.2 Pasos detallados

#### Paso 1: Registro como facturador electrónico
1. Ingresar a www.dian.gov.co
2. Seleccionar "Empresa" y completar datos del representante legal
3. Ir a Temas de interés → Factura Electrónica → Habilitación
4. Generar TOKEN de acceso (llega al correo del representante legal registrado en RUT)
5. Clic en "Registrar"
6. Salir del sistema para actualización
7. Volver a ingresar y generar nuevo TOKEN

#### Paso 2: Asociación de modo de operación
1. Menú "Registro y habilitación"
2. "Documentos Electrónicos" → "Factura electrónica"
3. Seleccionar modo "**Software Propio**"
4. Clic en "Asociar"
5. El sistema genera rangos de prueba automáticamente

#### Paso 3: Set de pruebas técnicas

| Documento | Cantidad |
|---|---|
| Facturas electrónicas | 60 |
| Notas crédito | 20 |
| Notas débito | 20 |
| **Total** | **100 documentos** |

Requisitos de las pruebas:
- Enviarse vía Web Service SOAP según Anexo Técnico
- Firmarse con certificado digital propio
- Validarse exitosamente en ambiente de habilitación
- Ser consecutivas (sin errores)

#### Paso 4: Confirmación como Proveedor Tecnológico
1. Al superar las pruebas, el estado cambia a "Aceptado"
2. Aparece ventana emergente para confirmar intención de operar como PT
3. Clic en "Operar como proveedor"

#### Paso 5: Carga de documentos
Documentos a cargar / enviar a `proveedorestecnologicosfe@dian.gov.co`:
- Estados financieros (patrimonio ≥ 20.000 UVT, PPE ≥ 10.000 UVT)
- Certificación ISO 27001 o carta compromiso (18 meses)
- Plan de contingencia
- Documentación de infraestructura física
- Certificado de existencia y representación legal
- Cámara de comercio

#### Paso 6: Visita de verificación
- DIAN programa visita de verificación in situ
- Se verifica infraestructura física, áreas, seguridad
- Se diligencia formato **FT-CAC-2745** (lista de chequeo)
- Si hay hallazgos: máximo **7 días hábiles** para corregir

#### Paso 7: Emisión de resolución
- DIAN dispone de **2 meses** desde la recepción de la solicitud para resolver
- Si se aprueba: resolución de habilitación por **5 años**
- Se actualiza el RUT con responsabilidad 39
- Se incluye en el Catálogo de Participantes

### 5.3 Tiempos estimados

| Fase | Duración |
|---|---|
| Preparación documental (constitución, estados financieros) | 1-2 meses |
| Registro en sistema DIAN | 1-2 semanas |
| Desarrollo del software | 2-6 meses |
| Set de pruebas técnicas | 2-4 semanas |
| Carga de documentos | 1-2 semanas |
| Programación visita de verificación | 2-4 semanas |
| Análisis y emisión de resolución | hasta 2 meses (plazo legal) |
| **Total desde cero** | **8-12 meses** |
| **Total si ya hay sociedad + ISO 27001** | **4-6 meses** |

### 5.4 Costo del trámite

- **Trámite DIAN: GRATUITO** (no cobra por la habilitación)
- Costos reales son de constitución, certificaciones, infraestructura y personal (ver sección 7)

Fuentes: [Proceso Habilitación PT - PDF](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Proceso-de-habilitacion-como-proveedor-tecnologico.pdf) · [Procedimiento PR-CAC-0466](https://www.dian.gov.co/atencionciudadano/LMDP/Cercania-al-Ciudadano/Factura-Electronica-Servicios-Digitales/Procedimientos/PR-CAC-0466.pdf) · [Instructivo Visitas IN-CAC-0260](https://www.dian.gov.co/atencionciudadano/LMDP/Cercania-al-Ciudadano/Factura-Electronica-Servicios-Digitales/Instructivos/IN-CAC-0260.pdf)

---

## 6. APIs y endpoints de DIAN para PT autorizados

### 6.1 Autenticación (STS - Security Token Service)

#### Endpoints

```
POST https://api.dian.gov.co/identidad/sts/v1/tokens/login           (producción)
POST https://apipruebasexternas.dian.gov.co/identidad/sts/v1/tokens/login  (pruebas)
```

#### Obtención de credenciales (client_id, client_secret, EncryptionKey)

1. Ingresar a la plataforma DIAN con usuario y clave del representante legal
2. Menú "Autogestión" → "Administrador de Aplicaciones"
3. Agregar la aplicación a registrar
4. DIAN entrega:
   - **Client ID** (50 caracteres alfanuméricos)
   - **Client Secret** (50 caracteres)
   - **EncryptionKey** (16 caracteres, para AES-128)

#### Parámetros de la petición de token

| Parámetro | Tipo | Long. | Descripción |
|---|---|---|---|
| `client_id` | String | 50 | Identificación de la aplicación |
| `client_secret` | String | 150 | Resultado de cifrar el client_secret con AES-128 |
| `grant-type` | String | 15 | Siempre `"password"` (literal) |
| `tipoDocumento` | String | 3 | Generalmente `"US"` para sistemas externos |
| `nroDocumento` | String | 15 | Identificación del usuario |
| `nit` | String | 15 | Identificación de la empresa |
| `password` | String | 150 | Resultado de cifrar el password con AES-128 |

#### Encriptación AES-128 CBC

**Procedimiento:**

1. Concatenar el valor con la fecha del sistema (sincronizada con hora colombiana, ISO 8601):
   ```
   [ClientSecret]-[2018-08-13T09:30:47]
   [Password]-[2018-08-13T09:30:47]
   ```
2. Cifrar con AES-128 CBC usando el EncryptionKey (16 caracteres)
   - Ejemplo EncryptionKey: `"68BD795F133F0132"`
3. DIAN descifra y valida que la fecha no sea menor a 1 minuto ni mayor a 5 minutos de la hora actual

**Ejemplo:**
```
clientSecret = "SHKSDHA4654HFKH+//*+5dñljkdflñ"
key          = "1SDGDSGF5454LKL"
pass         = "ABCGFTE6740/&%&$"

client_secret encriptado:
GfuRcWPJoykTGzaejS8RpLcD09voMjI475Q5vPZvmvoxkqFDfwu/FMK7URhKxzPjoxIN0QoneRa85GVJJ8UhzQ==

password encriptado:
N1VUd3CEuQxU/jELJXL6s/aG+/M+x6z+DxgOIbWRxCF8kf9mVeL+Idsb8K9gatQi
```

#### Headers requeridos

```
Authorization: Bearer {Token obtenido}
ClientId: {ClientId de la aplicación}
```

#### Respuesta

```json
{
  "clientId": "...",
  "accessToken": "JWT...",
  "expiresIn": 3600
}
```

Fuente: [Esquema Autenticación PDF](https://www.dian.gov.co/aduanas/Documents/Esquema-de-Autenticacion-de-Sistemas-Externos-para-Interoperabilidad-v1_4_1-FINAL.pdf)

### 6.2 Web Service SOAP (facturación electrónica)

#### WSDL

```
Producción:  https://vpfe.dian.gov.co/WcfDianCustomerServices.svc?wsdl
Pruebas:     https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc?wsdl
```

#### Métodos disponibles

| Método | Descripción | Cuándo usar |
|---|---|---|
| **SendBillSync** | Envío síncrono con respuesta inmediata | Volúmenes bajos |
| **SendBillAsync** | Envío asíncrono (devuelve ID de petición) | Volúmenes altos |
| **GetStatus** | Consulta estado de documento por CUFE/CUDE | Después de SendBillAsync |
| **GetStatusZip** | Consulta estado de lote ZIP | Lotes |
| **GetXmlByDocumentKey** | Descarga XML firmado por CUFE/CUDE | Recepción |
| **GetNumberingRange** | Rangos de numeración + clave técnica | Inicialización |
| **GetAcquirer** | Consulta de adquiriente (nombre + email) | Al facturar |

#### Documentos electrónicos soportados

- Factura Electrónica de Venta (FE)
- Nota Crédito Electrónica (NC)
- Nota Débito Electrónica (ND)
- Documento Equivalente Electrónico (DEE)
- Documento Soporte (DS)
- Nómina Electrónica
- Documentos POS (tiquetes, peajes, espectáculos)

#### Estándar de nombres de archivo

```
ws_fnnnnnnnnnnhhhhhhhhhh.zip
```
- `ws`: webService de recepción
- `f`: factura de venta
- `nnnnnnnnnn`: NIT del facturador
- `hhhhhhhhhh`: consecutivo del documento

### 6.3 ⚠️ Consulta de RUT de terceros - LIMITADA

Esta es la parte más importante para el caso de uso de go-admin-erp (autocompletado de clientes/proveedores).

#### Servicio GetAcquirer (Resolución 202 de 2025)

**Campos que retorna:**

| Campo | Descripción |
|---|---|
| Tipo de documento | CC, NIT, CE, etc. |
| Número de documento | NIT/cédula |
| Nombre o razón social | Nombre completo |
| Correo electrónico | Email registrado |

**Campos que NO retorna:**

| Campo | ¿Disponible? |
|---|---|
| Responsabilidades fiscales (O-13, O-15, O-47) | ❌ NO |
| Dirección física | ❌ NO |
| Teléfono | ❌ NO |
| Actividad económica (CIIU) | ❌ NO |
| Régimen tributario | ❌ NO |
| Estado del RUT | ❌ NO |
| Establecimientos de comercio | ❌ NO |
| Representantes legales | ❌ NO |

#### Restricción crítica de uso

> **`GetAcquirer` SOLO se puede usar al momento de emitir una factura electrónica.**

- DIAN valida el timing entre la consulta y la emisión de la factura
- **Penaliza el uso masivo** para CRM o actualización de bases de datos
- No puede usarse para validación general de terceros

#### Conclusión sobre consulta de RUT

**Ni siquiera siendo PT autorizado se obtienen los códigos O-xx de responsabilidades fiscales ni teléfono/dirección de terceros.** Solo se obtiene nombre y email, y solo al facturar.

Para información completa del RUT de terceros, las opciones son:
1. **Consulta pública MUISCA** (`muisca.dian.gov.co` → Servicios sin autenticación → Consulta de RUT): muestra responsabilidades, actividad y régimen, pero **no tiene API oficial** (es web con CAPTCHA)
2. **APIs de terceros** (CoreSoft, Verifik, Dataico) que hacen scraping de la consulta pública y exponen REST
3. **Scraping directo** de MUISCA/registronit.com (frágil, no recomendado para producción)

Fuentes: [Guía Web Services PDF](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Guia-Herramienta-para-el-Consumo-de-Web-Services.pdf) · [Documentación técnica DIAN](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/documentacion-tecnica/) · [Caja de Herramientas](https://facturaelectronica.dian.gov.co/documentacion-normatividad-16.html)

### 6.4 Documentación técnica oficial

| Documento | URL |
|---|---|
| Anexo Técnico 1.9 | [micrositio documentación](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/documentacion-tecnica/) |
| Caja de Herramientas (XSD, XSLT, esquemas) | [facturaelectronica.dian.gov.co](https://facturaelectronica.dian.gov.co/documentacion-normatividad-16.html) |
| Guía Web Services | [PDF](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Guia-Herramienta-para-el-Consumo-de-Web-Services.pdf) |
| Esquema Autenticación v1.4.1 | [PDF](https://www.dian.gov.co/aduanas/Documents/Esquema-de-Autenticacion-de-Sistemas-Externos-para-Interoperabilidad-v1_4_1-FINAL.pdf) |
| Especificaciones Interoperabilidad v1.2 | [PDF](https://www.dian.gov.co/aduanas/Documents/Especificaciones-tecnicas-de-Interoperabilidad-v1-2-20200918.pdf) |

> **Nota:** DIAN no publica Swagger/OpenAPI público. Los endpoints SOAP están documentados vía WSDL.

### 6.5 SDKs y librerías disponibles

| SDK | Lenguaje | Repo | Características |
|---|---|---|---|
| **dian-kit** | TypeScript/Node.js | [github.com/sergioarojasm98/dian-kit](https://github.com/sergioarojasm98/dian-kit) | XML UBL 2.1, XAdES-EPES, CUFE SHA-384, WS-Security, 215 tests |
| **ubl21dian** | Node.js/TS | [github.com/lopezsoft/ubl21dian](https://github.com/lopezsoft/ubl21dian) | Firma XAdES, SOAP WS-Security, patrones de diseño |
| Coderic gateway | Java | [github.com/Coderic/org.coderic.dian.gateway](https://github.com/Coderic/org.coderic.dian.gateway) | Gateway completo, Maven, Tomcat |
| signer-with-xades4j | Java | [github.com/jorgcastellano/signer-with-xades4j-col](https://github.com/jorgcastellano/signer-with-xades4j-col) | Firmador XAdES-EPES |

**Ejemplo con dian-kit (TypeScript):**

```typescript
import { DianKit } from "@dian-kit/sdk-node";

const kit = new DianKit({
  certificate: readFileSync("./certificado.p12"),
  certificatePassword: "password",
  environment: "2", // "1" = Producción, "2" = Sandbox
  supplier: {
    name: "GO ADMIN ERP SAS",
    identification: { number: "900123456", type: "31", dv: "7" },
  },
  software: {
    id: "software-id",
    pin: "software-pin",
  },
});
```

---

## 7. Costos de habilitación propia

### 7.1 Costos de constitución societaria (SAS)

| Concepto | Costo COP |
|---|---|
| Constitución SAS (documento privado) | $700.000 - $2.200.000 |
| Constitución SAS (escritura pública) | $1.500.000 - $4.300.000 |
| Derechos de matrícula mercantil | $46.000 - $500.000 |
| Impuesto de registro (0.7% capital suscrito) | variable |
| Autenticación de firmas | $15.000 - $30.000 c/u |
| Inscripción RUT/NIT | GRATUITO |
| Honorarios abogado | $500.000 - $2.000.000 |
| **Subtotal** | **$1.000.000 - $5.000.000** |

### 7.2 Certificación ISO 27001 (obligatoria)

| Concepto | Costo COP |
|---|---|
| Consultoría e implementación | desde $5.000.000 |
| Auditoría y certificación | $10.000.000 - $40.000.000 |
| Mantenimiento anual | $3.000.000 - $10.000.000/año |
| Tiempo estimado | 6-18 meses |
| **Subtotal primer año** | **$15.000.000 - $55.000.000** |

> DIAN permite carta compromiso de obtener ISO 27001 en 18 meses desde la habilitación.

### 7.3 Certificados digitales (firma electrónica)

| Proveedor | Costo anual |
|---|---|
| Sensiyo | $130.000 - $210.000 COP |
| Concertificado | $195.000 COP |
| Rango de mercado | $250.000 - $400.000 COP |
| **Estimación** | **$130.000 - $400.000 COP/año por NIT** |

### 7.4 Infraestructura de servidores y seguridad

| Concepto | Costo mensual COP |
|---|---|
| Servidor cloud (4 vCPU, 16GB RAM) | $400.000 - $540.000 |
| CloudHSM / Dedicated HSM | $800.000 - $2.000.000 |
| Almacenamiento, backup, monitoreo | $200.000 - $400.000 |
| WAF, balanceador, seguridad | $400.000 - $1.200.000 |
| **Subtotal mensual** | **$1.800.000 - $4.200.000** |
| **Subtotal anual** | **$21.600.000 - $50.400.000** |

### 7.5 Personal mínimo requerido

| Rol | Costo mensual COP |
|---|---|
| Abogado especialista (asesoría inicial) | $2.000.000 - $5.000.000 |
| Contador / revisor fiscal | $1.000.000 - $3.000.000/mes |
| Ingeniero de seguridad / DevOps | $5.000.000 - $10.000.000/mes |
| Desarrollador especialista DIAN | $4.000.000 - $8.000.000/mes |
| **Subtotal mensual (2-3 personas)** | **$11.000.000 - $26.000.000** |
| **Subtotal anual** | **$132.000.000 - $312.000.000** |

### 7.6 Estimación total primer año

| Concepto | Costo COP |
|---|---|
| Constitución SAS | $1.000.000 - $5.000.000 |
| ISO 27001 (primer año) | $15.000.000 - $55.000.000 |
| Certificado digital | $130.000 - $400.000 |
| Infraestructura (12 meses) | $21.600.000 - $50.400.000 |
| Personal (12 meses) | $132.000.000 - $312.000.000 |
| Auditorías adicionales | $5.000.000 - $10.000.000 |
| **TOTAL AÑO 1** | **$174.730.000 - $432.800.000 COP** |
| **En USD (TRM ~$4.000)** | **$43.683 - $108.200 USD** |

### 7.7 Mantenimiento anual (años 2-5)

| Concepto | Costo anual COP |
|---|---|
| Renovación ISO 27001 | $3.000.000 - $10.000.000 |
| Certificado digital | $130.000 - $400.000 |
| Infraestructura | $21.600.000 - $50.400.000 |
| Personal mínimo | $24.000.000 - $72.000.000 |
| Renovación habilitación (prorrateado) | $1.000.000 - $2.000.000 |
| **TOTAL MANTENIMIENTO ANUAL** | **$49.730.000 - $134.800.000 COP** |

Fuentes: [Costos facturación electrónica](https://www.apiparafacturar.com/posts/col-costos-integracion-facturacion-colombia) · [ISO 27001 Colombia](https://27001.com.co/certificacion/) · [Costo SAS](https://snlegal.co/blog/cuanto-cuesta-crear-empresa-sas-colombia) · [Certificado digital Sensiyo](https://sensiyo.co/certificados-digitales/)

---

## 8. Obligaciones continuas y mantenimiento

### 8.1 Obligaciones permanentes

| Obligación | Frecuencia |
|---|---|
| Mantener patrimonio ≥ 20.000 UVT | Permanente |
| Mantener PPE ≥ 10.000 UVT en Colombia | Permanente |
| ISO 27001 vigente | Permanente (auditorías anuales) |
| Certificado digital vigente | Anual |
| Visitas de verificación DIAN | Periódicas |
| Reportes a DIAN | Según requerimiento |

### 8.2 Vigencia y renovación

- **Vigencia de la habilitación:** 5 años
- **Renovación:** solicitar con mínimo 3 meses de anticipación
- **Proceso de renovación:** similar al de habilitación inicial

### 8.3 SLA y disponibilidad

DIAN no especifica un SLA numérico explícito, pero los PTs comerciales anuncian **99% de disponibilidad**. Debe soportar modo contingencia cuando hay fallas de DIAN.

---

## 9. Operaciones de contingencia

### 9.1 Tipo 04 - Inconvenientes tecnológicos DIAN

Cuando el sistema de validación previa de DIAN cae:

1. Verificar caída del sistema DIAN (4 intentos con intervalo de 20 segundos)
2. Almacenar evidencia del error del servidor
3. Expedir factura electrónica sin validación previa (el negocio es válido)
4. Reintentar a los 30 minutos
5. **Máximo 48 horas**: transmitir las facturas en XML con marca **TIPO 04**
6. Las facturas deben ir firmadas con certificado digital

### 9.2 Tipo 03 - Inconvenientes del facturador

1. Solicitar previamente autorización de numeración de talonario/papel de contingencia
2. Expedir facturas de talonario o papel (Art. 617 ET)
3. Superada la contingencia: transmitir a DIAN dentro de **48 horas**
4. Marcar factura como **TIPO 03** y relacionar consecutivos de papel

### 9.3 Códigos de error HTTP DIAN

| Código | Descripción |
|---|---|
| 200 | Petición recibida exitosamente |
| 204 | Sin contenido (GET) |
| 400 | Petición inválida |
| 401 | Error de autenticación |
| 415 | Error de content-type |
| 500 | Error interno servidor DIAN |

Fuente: [Contingencia FE T3 T4 - PDF](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Contingencia_FE_T3_T4.PDF)

---

## 10. Lista oficial de Proveedores Tecnológicos autorizados

### 10.1 Dónde consultar

- URL: https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/proveedores-tecnologicos/
- Formato: tabla con ID, NIT, Razón Social
- Información pública y libre

### 10.2 Cantidad actual

- **+80 proveedores tecnológicos** habilitados
- Distribuidos en: Bogotá, Medellín, Bucaramanga, Cúcuta, Ibagué, Popayán, Barranquilla, Manizales
- **No hay límite** para nuevos proveedores

### 10.3 Muestra de PTs autorizados

| NIT | Razón Social |
|---|---|
| 901020203 | ACEPTA S.A.S |
| 830099008 | ALIADDO SAS |
| 890321151 | CARVAJAL TECNOLOGIA Y SERVICIOS S.A.S. BIC |
| 900875062 | FACTURA 1 S.A.S |
| 900399741 | FACTURE S.A.S |
| 860028581 | DELCOP COLOMBIA SAS |

---

## 11. Alternativa: integrarse con un PT ya autorizado

Para go-admin-erp, esta es la opción recomendada por costo, tiempo y riesgo.

### 11.1 Comparativa de proveedores API

| Proveedor | Modelo | Costo por documento | Costo mensual/anual | White-label | Consulta RUT terceros |
|---|---|---|---|---|---|
| **MATIAS API** | Paquetes anuales (Casa de Software) | $12 - $44 COP | $220K - $6M/año | ✅ | ❌ no documentado |
| **Data Invoice** | Pay-as-you-go | $20 - $30 COP | según consumo | ✅ | ✅ |
| **DonPedro** | Plan mensual ilimitado | ilimitado | $99K/mes + $290K token/año | ✅ | ❌ |
| **LaFactura.co** | Por volumen | máx $50 COP | según volumen | ✅ | ❌ |
| **Alegra** | Plan SaaS | incluido en plan | $17.900 - $179.900/mes | ✅ | ❌ |
| **Factus** | Cotización | no público | según volumen | ✅ | ✅ |
| **Alanube** | Pay-as-you-go | según volumen | según consumo | ✅ BaaS | ❌ |
| **Bsale** | Plan SaaS | incluido | $57 - $108 USD/mes | ✅ | ❌ |
| **Siigo** | Por documento | según plan | $90K - $870K/año | ✅ | ❌ |

### 11.2 MATIAS API - Modelo Casa de Software (el más detallado)

Cada cliente se habilita como "Software Propio" ante DIAN; MATIAS actúa como intermediario. Sin responsabilidad legal ante DIAN para la casa de software.

| Paquete | Documentos/año | Costo anual COP | Costo/doc COP |
|---|---|---|---|
| Mini | 500 | $196.000 | $392 |
| Básico | 1.200 | $265.000 | $221 |
| Emprendedor | 3.000 | $365.000 | $122 |
| PYME Pro | 8.000 | $560.000 | $70 |
| **Casa de Software 5K** | 5.000 | $220.000 | **$44** |
| **Casa de Software 10K** | 10.000 | $400.000 | **$40** |
| **Casa de Software 30K** | 30.000 | $630.000 | **$21** |
| **Casa de Software 50K** | 50.000 | $850.000 | **$17** |
| Enterprise 150K | 150.000 | $2.250.000 | $15 |
| Enterprise 300K | 300.000 | $3.900.000 | $13 |
| Enterprise 500K | 500.000 | $6.000.000 | $12 |

**Certificado digital adicional:** $104.000 COP/NIT/año

**Ventajas:**
- Distribuir documentos entre múltiples clientes
- Cada cliente se habilita como "Software Propio" ante DIAN
- Sin responsabilidad legal ante DIAN para la casa de software
- Una sola integración para todos los clientes
- Integración en 1-2 semanas

### 11.3 Tiempos de integración

| Proveedor | Tiempo |
|---|---|
| MATIAS API | 1-2 semanas |
| Majim-e | 1-2 semanas |
| DonPedro | minutos (Postman) |
| Alegra / Alanube | rápido |

Fuentes: [MATIAS API](https://matias-api.com/casas-de-software/) · [Data Invoice](https://datainvoicecolombia.com/) · [DonPedro](https://posdonpedro.com/api-dian-factura-electronica-colombia/) · [Alegra](https://www.alegra.com/colombia/api/facturacion-electronica/) · [Factus](https://www.factus.com.co/) · [Bsale](https://www.bsale.com.co/) · [Siigo](https://developers.siigo.com/docs/siigoapi/)

---

## 12. Comparativa financiera: TCO a 3 años

### 12.1 Escenario go-admin-erp

**Supuestos:**
- 50 clientes PYMES
- Promedio 200 facturas/mes por cliente = 10.000 facturas/mes
- 120.000 facturas/año totales
- Equipo de 2 desarrolladores para mantenimiento

### 12.2 Opción A: Habilitación propia como PT

| Año | Costo inicial | Mantenimiento | Total acumulado |
|---|---|---|---|
| Año 1 | $175M - $433M | $50M - $135M | $225M - $568M |
| Año 2 | - | $50M - $135M | $275M - $703M |
| Año 3 | - | $50M - $135M | $325M - $838M |

**TCO 3 años:** $325M - $838M COP (~$81K - $210K USD)

### 12.3 Opción B: MATIAS Casa de Software

| Año | Integración | Operativo (120K docs) | Certificados (50 NITs) | Total acumulado |
|---|---|---|---|---|
| Año 1 | $2M | $3.9M (paquete 300K) | $5.2M (50 × $104K) | $11.1M |
| Año 2 | - | $3.9M | $5.2M | $20.2M |
| Año 3 | - | $3.9M | $5.2M | $29.3M |

**TCO 3 años:** $29.3M COP (~$7.3K USD)

### 12.4 Opción C: Data Invoice pay-as-you-go

| Año | Integración | Operativo (120K × $25) | Total acumulado |
|---|---|---|---|
| Año 1 | $2M | $3M | $5M |
| Año 2 | - | $3M | $8M |
| Año 3 | - | $3M | $11M |

**TCO 3 años:** $11M COP (~$2.8K USD)

### 12.5 Resumen comparativo

| Opción | TCO 3 años | USD | Ahorro vs propio |
|---|---|---|---|
| Habilitación propia | $325M - $838M | $81K - $210K | — |
| MATIAS Casa de Software | $29M | $7.3K | **91-97%** |
| Data Invoice pay-as-you-go | $11M | $2.8K | **97-99%** |

---

## 13. Casos reales y experiencias

### 13.1 Problemas comunes reportados

| Problema | Descripción |
|---|---|
| Intermitencias DIAN | Enero 2025: fallas en Azure causaron caídas nationwide |
| Trazabilidad rota | Errores por desconexión entre ERP y PT, inconsistencias ante DIAN |
| Actualizaciones normativas | Cambios en Res. 202/2025 y 165/2023 requieren adaptaciones |
| Visitas de verificación | Pueden generar suspensiones si no se cumplen requisitos |

### 13.2 Recomendaciones de expertos

- **Actualicese.com**: "Los PT deben cumplir requisitos estrictos de patrimonio e ISO 27001"
- **API para Facturar**: "El costo real no es solo la tarifa por documento, sino certificado, desarrollo, almacenamiento y mantenimiento normativo"
- **Sovos Saphety**: "Sin trazabilidad entre ERP y PT, hay riesgo de sanciones. La DIAN ha intensificado verificaciones"

### 13.3 Volumen de operación del mercado

- World Office: +137 millones de facturas electrónicas expedidas
- Siigo: Proveedor #1 de facturación electrónica en Colombia
- Alegra: ISO 27001:2022 e ISO 9001:2015, 99% disponibilidad

---

## 14. Recomendaciones técnicas para integración

### 14.1 Para integración directa con DIAN

1. **TLS 1.2 mínimo** (suites: ECDHE-ECDSA-AES256-GCM-SHA384, etc.)
2. **Certificado de comunicación:** ECDSA o RSA con llave mínima 2048 bits
3. **Sincronización de hora crítica** para AES-128 (tolerancia ±5 minutos)
4. **Validar esquema XSD** antes de firmar documentos
5. **Implementar logs** de cada paso del flujo
6. **Separar ambientes** de pruebas y producción

### 14.2 Para consulta de terceros

1. **Usar `GetAcquirer`** solo para completar datos al momento de facturar
2. **NO usar** para CRM masivo o validación general de base de datos
3. **Validar timing** entre consulta y emisión de factura (DIAN penaliza)
4. Para información completa del RUT, usar **consulta pública MUISCA** o APIs de terceros (CoreSoft, Verifik)

### 14.3 Para selección de SDK

- **Node.js/TypeScript:** dian-kit o lopezsoft/ubl21dian
- **Java:** Coderic gateway o signer-with-xades4j-col
- **Proveedores:** evaluar MATIAS, Factus, Alegra según necesidades

### 14.4 Para contingencia

1. Implementar lógica de **4 intentos con 20 segundos** antes de decretar contingencia
2. Almacenar **evidencia de errores** del servidor DIAN
3. Tener **numeración de contingencia** preautorizada
4. Implementar proceso de **retransmisión a 48 horas**

---

## 15. Conclusión y decisión para go-admin-erp

### 15.1 ¿Conviene habilitarse propio o usar proveedor?

| Factor | Habilitación propia | Proveedor API |
|---|---|---|
| Costo inicial | $175M - $433M COP | $2M - $5M COP |
| Costo mensual | $9M - $24M COP | $300K - $1M COP |
| Tiempo de inicio | 8-18 meses | 1-4 semanas |
| Riesgo regulatorio | Alto (responsabilidad directa) | Bajo (responsabilidad PT) |
| Escalabilidad | Ilimitada | según paquete |
| Control técnico | Total | Parcial |
| Mantenimiento normativo | Propio | Incluido |

### 15.2 Recomendación

**USAR PROVEEDOR API** para volúmenes hasta 500.000 documentos/año.

**Considerar habilitación propia solo si:**
- Volumen proyectado > 1 millón documentos/año
- Se tiene capital y patrimonio disponible (> $1.000M COP)
- Se requiere control total de la infraestructura
- Se tiene equipo técnico especializado disponible
- El modelo de negocio incluye revender el servicio a terceros a gran escala

### 15.3 Decisión específica para go-admin-erp

**Habilitarse como PT propio NO conviene** para go-admin-erp por:

1. Requiere **$996M COP** de patrimonio mínimo (2025)
2. 8-12 meses de proceso
3. ISO 27001 obligatoria
4. Responsabilidad legal directa ante DIAN
5. Costo anual $50M-$135M solo en mantenimiento
6. **Y lo más crítico**: ni siquiera siendo PT autorizado se obtienen los códigos O-xx de responsabilidades fiscales ni teléfono/dirección de terceros — solo nombre y email vía `GetAcquirer`, y solo al facturar.

### 15.4 Estrategia recomendada

| Caso de uso | Solución | Documentación |
|---|---|---|
| **Facturación electrónica** | Integrar con MATIAS API o Data Invoice | (pendiente de implementar) |
| **Autocompletado de clientes/proveedores** | CoreSoft (régimen texto) + Verifik (rues-complete) | `dian-rues-autocompletado.md` |
| **Códigos O-xx de responsabilidades** | Mapeo del texto del régimen (CoreSoft) a códigos DIAN | `dianLookupService.ts` |
| **Contactos persona natural** | CoreSoft `/api/cedula` (dirección, teléfono, email) | `dian-rues-autocompletado.md` |
| **Contactos empresa** | Verifik `/v3/co/rues-complete` (con nulls frecuentes) | `dian-rues-autocompletado.md` |

---

## 16. Próximos pasos sugeridos

1. **Documentar MATIAS API / Data Invoice** como integración para facturación electrónica del ERP
2. **Actualizar `dianLookupService.ts`** y `dian-rues-autocompletado.md` para reflejar que los códigos O-xx se derivan por mapeo del texto del régimen (CoreSoft) y no vienen literal de ninguna API
3. **Evaluar MATIAS API** con una prueba de integración (paquete Casa de Software 5K a $220K/año)
4. **Mantener Verifik + CoreSoft** para autocompletado de clientes/proveedores (ya implementado)

---

## 17. Fuentes consultadas

### Oficiales DIAN
- [Proceso Habilitación PT - PDF](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Proceso-de-habilitacion-como-proveedor-tecnologico.pdf)
- [Preguntas y Respuestas PT - PDF](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Preguntas-y-respuestas-Proveedores-Tecnologicos-FE.pdf)
- [Catálogo PT](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/proveedores-tecnologicos/)
- [Normatividad](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/normatividad/)
- [Resolución 165 de 2023 - PDF](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000165%20de%2001-11-2023.pdf)
- [Resolución 008 de 2024 - PDF](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000008%20de%2031-01-2024.pdf)
- [Resolución 119 de 2024 - PDF](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000119%20de%2030-07-2024.Pdf)
- [Compilación Jurídica](https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0165_2023.htm)
- [Esquema Autenticación - PDF](https://www.dian.gov.co/aduanas/Documents/Esquema-de-Autenticacion-de-Sistemas-Externos-para-Interoperabilidad-v1_4_1-FINAL.pdf)
- [Especificaciones Interoperabilidad - PDF](https://www.dian.gov.co/aduanas/Documents/Especificaciones-tecnicas-de-Interoperabilidad-v1-2-20200918.pdf)
- [Guía Web Services - PDF](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Guia-Herramienta-para-el-Consumo-de-Web-Services.pdf)
- [Documentación técnica](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/documentacion-tecnica/)
- [Caja de Herramientas](https://facturaelectronica.dian.gov.co/documentacion-normatividad-16.html)
- [Contingencia FE T3 T4 - PDF](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Contingencia_FE_T3_T4.PDF)
- [Procedimiento PR-CAC-0466](https://www.dian.gov.co/atencionciudadano/LMDP/Cercania-al-Ciudadano/Factura-Electronica-Servicios-Digitales/Procedimientos/PR-CAC-0466.pdf)
- [Instructivo Visitas IN-CAC-0260](https://www.dian.gov.co/atencionciudadano/LMDP/Cercania-al-Ciudadano/Factura-Electronica-Servicios-Digitales/Instructivos/IN-CAC-0260.pdf)

### Especialistas
- [Actualicese - Requisitos PT](https://actualicese.com/archivo/requisitos-para-que-proveedores-tecnologicos-sean-autorizados-por-la-dian/)
- [Actualicese - Comparativo Res. 119/2024](https://actualicese.com/comparativo-de-normas-de-la-resolucion-000165-de-2023-sobre-facturacion-electronica-modificadas-con-la-resolucion-000119-de-2024/)
- [Gerencie - Facturación Electrónica](https://www.gerencie.com/factura-electronica.html)
- [CR Consultores - Responsabilidades](https://crconsultorescolombia.com/delimitacion-de-responsabilidades-software-propio-frente-a-proveedor-tecnologico-dian-concepto-1889015968.php)
- [Concepto 1889 - CIJUF](https://cijuf.org.co/normatividad/concepto/2025/concepto-concepto-1889015968.html)
- [Sovos Saphety - Problemas integración](https://saphety.co/blog/tu-proveedor-tecnologico-esta-fallando-con-la-facturacion-electronica-dian/)

### Costos
- [Costos facturación electrónica](https://www.apiparafacturar.com/posts/col-costos-integracion-facturacion-colombia)
- [ISO 27001 Colombia](https://27001.com.co/certificacion/)
- [Costo SAS](https://snlegal.co/blog/cuanto-cuesta-crear-empresa-sas-colombia)
- [Certificado digital Sensiyo](https://sensiyo.co/certificados-digitales/)
- [Cloud Computing Colombia](https://rootstack.com/en/blog/cost-cloud-computing-colombia)

### Proveedores API
- [MATIAS API](https://matias-api.com/casas-de-software/)
- [Data Invoice](https://datainvoicecolombia.com/)
- [DonPedro](https://posdonpedro.com/api-dian-factura-electronica-colombia/)
- [Alegra](https://www.alegra.com/colombia/api/facturacion-electronica/)
- [Factus](https://www.factus.com.co/)
- [Alanube](https://www.alanube.co/colombia/)
- [Bsale](https://www.bsale.com.co/)
- [Siigo](https://developers.siigo.com/docs/siigoapi/)
- [LaFactura.co](https://lafactura.co/precios)

### SDKs
- [dian-kit (TypeScript)](https://github.com/sergioarojasm98/dian-kit)
- [ubl21dian (Node.js)](https://github.com/lopezsoft/ubl21dian)
- [Coderic gateway (Java)](https://github.com/Coderic/org.coderic.dian.gateway)
- [signer-with-xades4j (Java)](https://github.com/jorgcastellano/signer-with-xades4j-col)

### Consulta de terceros
- [Dataico API](https://portaldelcliente.dataico.com/es/knowledge/documentaci%C3%B3n-t%C3%A9cnica-de-la-api-de-dataico-consulta-dian-terceros)
- [Kontalid](https://www.kontalid.com/consulta-de-terceros-para-exogena/)

### Prensa
- [El País - Intermitencias FE](https://www.elpais.com.co/economia/servicio-de-facturacion-electronica-de-la-dian-presenta-intermitencias-esto-es-lo-que-debe-saber-1048.html)
- [El Tiempo - Fallas FE](https://www.eltiempo.com/economia/finanzas-personales/dian-anuncio-fallos-e-intermitencias-en-el-servicio-de-facturacion-electronica-que-deben-hacer-los-comerciantes-para-no-ser-multados-3416376)
- [La República - Facture S.A.S](https://www.larepublica.co/economia/facture-s-a-s-sera-uno-de-los-proveedores-de-factura-electronica-2498506)
