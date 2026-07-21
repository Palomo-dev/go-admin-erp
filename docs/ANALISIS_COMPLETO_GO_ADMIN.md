# Análisis Completo de Go Admin ERP

## Índice

1. [¿Qué es Go Admin?](#qué-es-go-admin)
2. [Modelo de Negocio](#modelo-de-negocio)
3. [Tipos de Negocios que Atiende](#tipos-de-negocios-que-atiende)
4. [Planes de Suscripción](#planes-de-suscripción)
5. [Arquitectura Técnica](#arquitectura-técnica)
6. [Análisis de Módulos y Páginas](#análisis-de-módulos-y-páginas)
   - [Autenticación (Auth)](#autenticación-auth)
   - [Admin](#admin)
   - [Organización](#organización)
   - [Dashboard / Inicio](#dashboard--inicio)
   - [POS - Punto de Venta](#pos---punto-de-venta)
   - [Inventario](#inventario)
   - [Finanzas](#finanzas)
   - [CRM](#crm)
   - [Clientes](#clientes)
   - [PMS - Property Management System (Hotelería)](#pms---property-management-system-hotelería)
   - [Parking](#parking)
   - [HRM - Recursos Humanos](#hrm---recursos-humanos)
   - [Transporte](#transporte)
   - [Gym (Gimnasio)](#gym-gimnasio)
   - [Chat Omnicanal](#chat-omnicanal)
   - [Calendario](#calendario)
   - [Reportes y Analítica](#reportes-y-analítica)
   - [Notificaciones](#notificaciones)
   - [Integraciones](#integraciones)
   - [Roles y Permisos](#roles-y-permisos)
   - [Timeline](#timeline)
   - [Gestión de Proyectos (PM)](#gestión-de-proyectos-pm)
   - [Operaciones](#operaciones)
7. [Base de Datos](#base-de-datos)
8. [Resumen Ejecutivo](#resumen-ejecutivo)

---

## ¿Qué es Go Admin?

**Go Admin** es un ERP (Enterprise Resource Planning) multi-tenant y modular, diseñado como una plataforma SaaS (Software as a Service) que centraliza la gestión operativa, financiera, comercial y administrativa de negocios en una sola solución. 

Es un producto desarrollado por **Go Admin S.A.S** (NIT: 901479685), con sede en Medellín, Colombia. La plataforma permite que cada organización tenga su propio subdominio (ej: `goadminsoftware.goadmin.com`), logo, colores corporativos y configuración independiente.

### Propósito y Valor Proposition

Go Admin busca resolver el problema de la fragmentación de software en pequeñas y medianas empresas. En lugar de usar un sistema para ventas, otro para inventario, otro para contabilidad y otro para CRM, Go Admin integra todo en una sola plataforma con:

- **Gestión unificada**: Ventas, inventario, finanzas, CRM, RRHH y más en un solo lugar.
- **Multi-sucursal**: Soporte para múltiples branches por organización.
- **Personalización por industria**: Módulos específicos según el tipo de negocio (restaurante, hotel, gimnasio, transporte, etc.).
- **IA integrada**: Asistente de IA con créditos mensuales según el plan.
- **Comunicación omnicanal**: Chat con WhatsApp, Facebook, Instagram, sitio web.
- **Facturación electrónica**: Soporte para facturación timbrada (Colombia).
- **Multi-moneda**: Soporte para operaciones en múltiples monedas.

---

## Modelo de Negocio

Go Admin opera bajo un modelo **SaaS con suscripciones** integrado con **Stripe** para procesamiento de pagos. Los clientes pagan una suscripción mensual o anual según el plan elegido. Cada plan define:

- Número máximo de usuarios
- Número máximo de módulos activos
- Número máximo de sucursales
- Créditos de IA mensuales
- Almacenamiento en GB
- Límite de integraciones
- Tiempo de retención de datos
- Nivel de soporte técnico
- Acceso a API
- Personalización de branding

### Tabla de Organizaciones Actuales

La plataforma tiene organizaciones activas de diversos tipos:
- **Restaurante** (type_id=1): Ej: "Donde Checho"
- **Hotel** (type_id=2): Hoteles y alojamientos
- **Retail/Tienda** (type_id=3): Tiendas y comercios minoristas
- **Servicios** (type_id=4): Ej: "GO Admin ERP" (la empresa misma)
- **Gym** (type_id=5): Gimnasios y centros deportivos
- **Transporte** (type_id=6): Servicios de transporte
- **Parking** (type_id=7): Estacionamientos y parqueaderos

---

## Tipos de Negocios que Atiende

Go Admin está diseñado para servir a **7 tipos principales de negocios**:

1. **Restaurantes** (`restaurant`): Restaurantes y servicios de alimentación. Usa POS con comandas, mesas, propinas, promociones, devoluciones.
2. **Hoteles** (`hotel`): Hoteles y alojamientos. Usa PMS con reservas, check-in/out, housekeeping, folios, tarifas, channel-manager.
3. **Tiendas/Retail** (`retail`): Tiendas y comercios minoristas. Usa POS, inventario, proveedores, órdenes de compra.
4. **Servicios Profesionales** (`services`): Consultoría y servicios en general. Usa CRM, finanzas, proyectos, timeline.
5. **Gimnasios** (`gym`): Gimnasios y centros deportivos. Usa módulo Gym con membresías, clases, check-in QR, instructores, planes.
6. **Transporte** (`transport`): Servicios de transporte. Usa módulo Transporte con rutas, viajes, envíos, boletos, tracking, manifiestos.
7. **Parking** (`parking`): Estacionamientos y parqueaderos. Usa Parking con plano de puestos, tarifas, abonos mensuales.

---

## Planes de Suscripción

Go Admin ofrece **5 planes** de suscripción. A continuación se detallan todos, con énfasis en los planes anuales que tienen **Stripe Product ID** asignado.


### Plan Pro - $199 USD/año

| Característica | Valor |
|---|---|
| **Precio mensual** | $20 USD |
| **Precio anual** | $199 USD |
| **Días de trial** | 15 |
| **Máx. módulos** | 12 |
| **Máx. sucursales** | 1 |
| **Máx. usuarios** | 10 |
| **Créditos IA/mes** | 5,000 |
| **Almacenamiento** | 100 GB |
| **Retención de datos** | 365 días |
| **Integraciones** | 5 |
| **API Access** | Basic |
| **Analytics** | Sí |
| **Reportes personalizados** | Sí |
| **Exportar datos** | Sí |
| **Multi-moneda** | Sí |
| **Custom Branding** | Sí |
| **Webhooks** | No |
| **Soporte** | Email + Chat |
| **Tiempo respuesta soporte** | 24-48h |
| **Descripción** | Para 80% del mercado (negocios típicos) |

---

### Plan Business - $490 USD/año

| Característica | Valor |
|---|---|
| **Precio mensual** | $49 USD |
| **Precio anual** | $490 USD |
| **Días de trial** | 30 |
| **Máx. módulos** | 16 |
| **Máx. sucursales** | 5 |
| **Máx. usuarios** | 20 |
| **Créditos IA/mes** | 10,000 |
| **Almacenamiento** | 1,000 GB (1 TB) |
| **Retención de datos** | Ilimitada |
| **Integraciones** | Ilimitadas |
| **API Access** | Full |
| **Analytics** | Sí |
| **Reportes personalizados** | Sí |
| **Exportar datos** | Sí |
| **Multi-moneda** | Sí |
| **Custom Branding** | Sí |
| **Webhooks** | Sí |
| **Soporte** | Dedicado 24/7 |
| **Soporte prioritario** | Sí |
| **Gerente dedicado** | Sí |
| **Tiempo respuesta soporte** | 2-4h |
| **Descripción** | Para grandes empresas y franquicias |

---

### Plan Ultimate - $1,990 USD/año

| Característica | Valor |
|---|---|
| **Precio mensual** | $199 USD |
| **Precio anual** | $1,990 USD |
| **Días de trial** | 30 |
| **Máx. módulos** | 19 (todos) |
| **Máx. sucursales** | 15 |
| **Máx. usuarios** | 30 |
| **Créditos IA/mes** | 10,000 |
| **Almacenamiento** | 1,000 GB (1 TB) |
| **Retención de datos** | Ilimitada |
| **Integraciones** | Ilimitadas |
| **API Access** | Full |
| **Analytics** | Sí |
| **Reportes personalizados** | Sí |
| **Exportar datos** | Sí |
| **Multi-moneda** | Sí |
| **Custom Branding** | Sí |
| **Webhooks** | Sí |
| **Soporte** | Dedicado 24/7 |
| **Soporte prioritario** | Sí |
| **Gerente dedicado** | Sí |
| **Tiempo respuesta soporte** | 1-2h |
| **Descripción** | Plan completo para grandes empresas con todas las funcionalidades |

---

### Resumen de Planes con Stripe Product ID (Anuales)

| Plan | Precio Anual | Stripe Product ID | Stripe Price Yearly ID |
|---|---|---|---|
| **Pro** | $199 USD | 
| **Business** | $490 USD | 
| **Ultimate** | $1,990 USD | 

> **Nota:** Los planes Free y Enterprise no tienen Stripe Product ID asignado. Free es gratuito y Enterprise se cotiza de forma personalizada.

---

## Análisis de Módulos y Páginas

### Autenticación (Auth)

**Ruta base**: `/auth`

Gestiona todo el ciclo de autenticación de usuarios.

#### Funcionalidades clave
- Autenticación vía Supabase Auth
- Multi-organización por usuario
- Invitaciones a miembros
- Reseteo de contraseña
- Verificación de email
- Sesiones seguras con expiración

---

### Organización

**Ruta base**: `/organizacion`

Configuración de la organización y su branding.

#### Páginas

- **`/organizacion/branding`**: Personalización de la identidad corporativa. Permite configurar logo, colores primario y secundario, subdominio y dominio personalizado.

#### Funcionalidades clave
- Upload de logo
- Selección de colores corporativos (primary_color, secondary_color)
- Configuración de subdominio
- Dominio personalizado

---

### Dashboard / Inicio

**Ruta base**: `/app` y `/app/inicio`

Página principal de la aplicación tras iniciar sesión.

#### Páginas

- **`/app/page.tsx`**: Dashboard principal con KPIs en vivo, accesos rápidos a módulos, feed de actividad reciente.
- **`/app/inicio`**: Vista alternativa de inicio con widgets personalizables.

#### Funcionalidades clave
- KPIs en tiempo real (ventas, inventario, reservas, etc.)
- Accesos rápidos a todos los módulos activos
- Feed de eventos recientes
- Navegación por sucursales (branch selector)
- Vista de operaciones consolidada

---

### POS - Punto de Venta

**Ruta base**: `/app/pos`

Sistema completo de punto de venta con soporte para retail, restaurante y gimnasio.

#### Páginas

- **`/app/pos`**: Dashboard del POS con estadísticas de ventas del día.
- **`/app/pos/ventas`**: Lista de ventas realizadas con filtros por fecha, estado, sucursal.
- **`/app/pos/ventas/nuevo`**: Crear nueva venta/orden. Selector de productos, cantidades, descuentos, impuestos, método de pago.
- **`/app/pos/ventas/[id]`**: Detalle de una venta específica con items, totales, pagos, estado.
- **`/app/pos/cajas`**: Lista de cajas registradoras por sucursal.
- **`/app/pos/cajas/[id]`**: Detalle de una caja con saldo, movimientos, estado (abierta/cerrada).
- **`/app/pos/cajas/[id]/movimientos/nuevo`**: Registrar movimiento de caja (ingreso/egreso).
- **`/app/pos/cajas/[id]/arqueos/nuevo`**: Realizar arqueo de caja (cuadre de efectivo).
- **`/app/pos/carritos`**: Gestión de carritos de compra activos/pendientes.
- **`/app/pos/comandas`**: Gestión de comandas (principalmente para restaurantes).
- **`/app/pos/mesas`**: Gestión de mesas del restaurante (mapa de mesas).
- **`/app/pos/mesas/[id]`**: Detalle de una mesa con su cuenta actual.
- **`/app/pos/reservas-mesas`**: Reservas de mesas para restaurantes.
- **`/app/pos/pedidos-online`**: Pedidos recibidos a través de canales online.
- **`/app/pos/pedidos-online/[id]`**: Detalle de un pedido online.
- **`/app/pos/promociones`**: Lista de promociones activas.
- **`/app/pos/promociones/nuevo`**: Crear nueva promoción (descuentos, 2x1, etc.).
- **`/app/pos/promociones/[id]`**: Editar promoción existente.
- **`/app/pos/cupones`**: Gestión de cupones de descuento.
- **`/app/pos/cupones/[id]`**: Editar cupón específico.
- **`/app/pos/devoluciones`**: Gestión de devoluciones de ventas.
- **`/app/pos/devoluciones/motivos`**: Configuración de motivos de devolución.
- **`/app/pos/propinas`**: Gestión de propinas (restaurante).
- **`/app/pos/cargos-servicio`**: Cargos por servicio adicionales.
- **`/app/pos/cuentas-por-cobrar`**: Cuentas por cobrar generadas desde ventas a crédito.
- **`/app/pos/pagos-pendientes`**: Pagos pendientes de procesar.
- **`/app/pos/reportes`**: Reportes de ventas, productos más vendidos, etc.
- **`/app/pos/configuracion`**: Configuración general del POS.
- **`/app/pos/configuracion/consecutivos-ventas`**: Configuración de consecutivos numeración de ventas.

#### Funcionalidades clave
- Soporte multi-industria (retail, restaurante, gym)
- Gestión completa de cajas y arqueos
- Comandas y gestión de mesas para restaurantes
- Pedidos online
- Promociones y cupones
- Devoluciones con motivos
- Propinas y cargos por servicio
- Cuentas por cobrar integradas
- Consecutivos configurables
- Reportes de ventas

---

### Inventario

**Ruta base**: `/app/inventario`

Gestión completa de inventario, productos, stock y compras.

#### Páginas

- **`/app/inventario`**: Dashboard de inventario con KPIs (valor stock, productos bajos, etc.).
- **`/app/inventario/productos`**: Catálogo de productos con categorías, variantes, precios, imágenes.
- **`/app/inventario/variantes`**: Gestión de variantes de productos (talla, color, etc.).
- **`/app/inventario/categorias`**: Categorías en estructura de árbol jerárquico.
- **`/app/inventario/stock`**: Stock en tiempo real por sucursal, producto y variante.
- **`/app/inventario/lotes`**: Gestión de lotes con fechas de vencimiento.
- **`/app/inventario/ordenes-compra`**: Órdenes de compra a proveedores.
- **`/app/inventario/proveedores`**: Gestión de proveedores con contacto y datos fiscales.
- **`/app/inventario/unidades`**: Unidades de medida (kg, unidad, litro, etc.).
- **`/app/inventario/imagenes`**: Gestión de imágenes de productos.
- **`/app/inventario/movimientos`**: Movimientos de inventario (entradas, salidas, transferencias).
- **`/app/inventario/alertas`**: Alertas de stock bajo, vencimientos próximos.
- **`/app/inventario/mapa`**: Mapa visual de ubicaciones de productos en almacén.
- **`/app/inventario/zonas`**: Zonas de almacenamiento.

#### Funcionalidades clave
- Catálogo con variantes y categorías en árbol
- Stock multi-sucursal en tiempo real
- Kardex FIFO/AVG
- Lotes con control de vencimientos
- Órdenes de compra y recepción
- Movimientos entre sucursales
- Alertas automáticas de stock bajo
- Unidades de medida configurables
- Gestión de proveedores

---

### Finanzas

**Ruta base**: `/app/finanzas`

Gestión financiera completa: facturación, contabilidad, bancos, CxC, CxP.

#### Páginas

- **`/app/finanzas`**: Dashboard financiero con KPIs principales.
- **`/app/finanzas/facturas-venta`**: Lista de facturas de venta timbradas.
- **`/app/finanzas/facturas-venta/nuevo`**: Crear nueva factura de venta con items, impuestos, descuentos, condiciones de pago.
- **`/app/finanzas/facturas-venta/[id]`**: Detalle de factura de venta.
- **`/app/finanzas/facturas-venta/[id]/editar`**: Editar factura de venta existente.
- **`/app/finanzas/facturas-compra`**: Lista de facturas de compra.
- **`/app/finanzas/facturas-compra/nuevo`**: Registrar nueva factura de compra.
- **`/app/finanzas/facturas-compra/[id]`**: Detalle de factura de compra.
- **`/app/finanzas/facturas-compra/[id]/editar`**: Editar factura de compra.
- **`/app/finanzas/cuentas-por-cobrar`**: Gestión de CxC con saldos, vencimientos, abonos.
- **`/app/finanzas/cuentas-por-cobrar/[id]`**: Detalle de CxC con historial de pagos y cuotas.
- **`/app/finanzas/cuentas-por-pagar`**: Gestión de CxP con saldos, vencimientos.
- **`/app/finanzas/cuentas-por-pagar/[id]`**: Detalle de CxP.
- **`/app/finanzas/cuentas-por-pagar/[id]/cuotas`**: Gestión de cuotas de CxP.
- **`/app/finanzas/bancos`**: Lista de bancos y cuentas bancarias.
- **`/app/finanzas/bancos/cuentas/nuevo`**: Crear nueva cuenta bancaria.
- **`/app/finanzas/bancos/cuentas/[id]`**: Detalle de cuenta bancaria.
- **`/app/finanzas/bancos/cuentas/[id]/movimientos`**: Movimientos de cuenta bancaria.
- **`/app/finanzas/conciliacion-bancaria`**: Conciliación bancaria.
- **`/app/finanzas/conciliacion-bancaria/nuevo`**: Nueva conciliación.
- **`/app/finanzas/conciliacion-bancaria/[id]`**: Detalle de conciliación.
- **`/app/finanzas/contabilidad`**: Dashboard de contabilidad.
- **`/app/finanzas/contabilidad/plan-cuentas`**: Plan de cuentas (catálogo de cuentas contables).
- **`/app/finanzas/contabilidad/asientos`**: Asientos contables.
- **`/app/finanzas/contabilidad/asientos/[id]`**: Detalle de asiento contable.
- **`/app/finanzas/contabilidad/mayor-contable`**: Libro mayor contable.
- **`/app/finanzas/contabilidad/balance-comprobacion`**: Balance de comprobación.
- **`/app/finanzas/contabilidad/balance-general`**: Balance general (estado de situación financiera).
- **`/app/finanzas/contabilidad/estado-resultados`**: Estado de resultados (P&G).
- **`/app/finanzas/contabilidad/periodos-fiscales`**: Gestión de periodos fiscales.
- **`/app/finanzas/contabilidad/reglas-contables`**: Reglas de automatización contable.
- **`/app/finanzas/impuestos`**: Gestión de impuestos con plantillas filtradas por país.
- **`/app/finanzas/monedas`**: Gestión de monedas y tipos de cambio.
- **`/app/finanzas/metodos-pago`**: Métodos de pago configurables.
- **`/app/finanzas/ingresos`**: Registro de ingresos.
- **`/app/finanzas/ingresos/[id]`**: Detalle de ingreso.
- **`/app/finanzas/egresos`**: Registro de egresos.
- **`/app/finanzas/egresos/[id]`**: Detalle de egreso.
- **`/app/finanzas/transferencias`**: Transferencias entre cuentas.
- **`/app/finanzas/transferencias/[id]`**: Detalle de transferencia.
- **`/app/finanzas/notas-credito`**: Notas crédito.
- **`/app/finanzas/notas-credito/[id]`**: Detalle de nota crédito.
- **`/app/finanzas/facturacion-electronica`**: Configuración de facturación electrónica (DIAN Colombia).
- **`/app/finanzas/activos-fijos`**: Gestión de activos fijos y depreciación.
- **`/app/finanzas/centro-costos`**: Centros de costo.
- **`/app/finanzas/comisiones`**: Gestión de comisiones.
- **`/app/finanzas/presupuestos`**: Presupuestos financieros.
- **`/app/finanzas/periodos-contables`**: Periodos contables.
- **`/app/finanzas/saldos-a-favor`**: Saldos a favor de clientes/proveedores.
- **`/app/finanzas/reportes`**: Reportes financieros.
- **`/app/finanzas/reglas-contables`**: Reglas de automatización contable.

#### Funcionalidades clave
- Facturación de venta y compra con timbrado electrónico (DIAN)
- Descuentos comerciales por línea y condiciones de pago con tramos
- Cuentas por cobrar y pagar con gestión de cuotas y pronto pago
- Contabilidad completa: plan de cuentas, asientos, mayor, balances
- Conciliación bancaria
- Gestión de impuestos con plantillas por país
- Multi-moneda con tipos de cambio
- Activos fijos y depreciación
- Centros de costo
- Presupuestos
- Comisiones
- Notas crédito
- Facturación electrónica (Colombia DIAN)

---

### CRM

**Ruta base**: `/app/crm`

Gestión de relaciones con clientes (Customer Relationship Management).

#### Páginas

- **`/app/crm`**: Dashboard del CRM con KPIs de oportunidades, actividades, pipeline.
- **`/app/crm/pipeline`**: Vista Kanban del pipeline de ventas con drag-and-drop de oportunidades entre etapas. Permite crear/editar/eliminar etapas con colores, probabilidades y descripciones. Incluye vista de tabla, pronóstico, clientes y automatizaciones.
- **`/app/crm/pipeline/edit-opportunity`**: Edición rápida de oportunidad desde el pipeline.
- **`/app/crm/oportunidades`**: Lista de oportunidades de venta.
- **`/app/crm/oportunidades/nuevo`**: Crear nueva oportunidad.
- **`/app/crm/oportunidades/[id]`**: Detalle de oportunidad.
- **`/app/crm/oportunidades/[id]/editar`**: Editar oportunidad.
- **`/app/crm/actividades`**: Lista de actividades (llamadas, emails, reuniones, tareas).
- **`/app/crm/actividades/[id]`**: Detalle de actividad.
- **`/app/crm/tareas`**: Gestión de tareas asignadas.
- **`/app/crm/campanas`**: Lista de campañas de marketing.
- **`/app/crm/campanas/nuevo`**: Crear nueva campaña.
- **`/app/crm/campanas/[id]`**: Detalle de campaña.
- **`/app/crm/segmentos`**: Segmentación de clientes.
- **`/app/crm/segmentos/nuevo`**: Crear nuevo segmento.
- **`/app/crm/segmentos/[id]`**: Detalle de segmento.
- **`/app/crm/clientes`**: Lista de clientes del CRM.
- **`/app/crm/conversaciones`**: Conversaciones con clientes.
- **`/app/crm/conversaciones/nueva`**: Iniciar nueva conversación.
- **`/app/crm/conversaciones/[id]`**: Detalle de conversación.
- **`/app/crm/conversaciones/[id]/archivos`**: Archivos compartidos en conversación.
- **`/app/crm/identidades`**: Identidades de clientes (redes sociales, email, teléfono).
- **`/app/crm/pronostico`**: Pronóstico de ventas (forecast).
- **`/app/crm/reportes`**: Reportes de CRM.
- **`/app/crm/configuracion`**: Configuración del CRM.
- **`/app/crm/configuracion/canales`**: Canales de adquisición.
- **`/app/crm/configuracion/canales/nuevo`**: Nuevo canal.
- **`/app/crm/configuracion/canales/[id]`**: Editar canal.
- **`/app/crm/configuracion/etiquetas`**: Etiquetas/tags para contactos.

#### Funcionalidades clave
- Pipeline Kanban con drag-and-drop (etapas personalizables con color y probabilidad)
- Gestión de oportunidades con valores, probabilidades y fechas
- Actividades y tareas vinculadas a oportunidades/clientes
- Campañas de marketing
- Segmentación de clientes
- Conversaciones y mensajería
- Pronóstico de ventas
- Reportes de conversión
- Configuración de canales y etiquetas
- Automatizaciones por eventos

---

### Clientes

**Ruta base**: `/app/clientes`

Gestión centralizada de clientes.

#### Páginas

- **`/app/clientes`**: Lista de clientes con búsqueda, filtros y paginación.
- **`/app/clientes/new`**: Crear nuevo cliente.
- **`/app/clientes/[id]`**: Detalle de cliente con historial de compras, contactos, timeline.
- **`/app/clientes/[id]/editar`**: Editar datos del cliente.

#### Funcionalidades clave
- CRUD completo de clientes
- Historial de compras y relaciones
- Timeline de interacciones
- Datos de contacto y fiscales
- Vinculación con CRM, ventas, reservas

---

### PMS - Property Management System (Hotelería)

**Ruta base**: `/app/pms`

Sistema de gestión hotelera completo.

#### Páginas

- **`/app/pms`**: Dashboard del PMS con ocupación, arrivals, departures, ADR, RevPAR.
- **`/app/pms/reservas`**: Lista de reservas con filtros por fecha, estado, cliente.
- **`/app/pms/reservas/nueva`**: Crear nueva reserva con búsqueda de cliente, selección de espacios, fechas.
- **`/app/pms/reservas/[id]`**: Detalle de reserva con folio, cargos, pagos.
- **`/app/pms/reservas/[id]/editar`**: Editar reserva existente.
- **`/app/pms/espacios`**: Lista de espacios (habitaciones, áreas) con estado (disponible, ocupado, limpieza, mantenimiento).
- **`/app/pms/espacios/[id]`**: Detalle de espacio con reservas activas, historial, botón de reserva rápida (drawer).
- **`/app/pms/tipos-espacio`**: Tipos de espacios (habitación simple, doble, suite, etc.).
- **`/app/pms/categorias`**: Categorías de espacios.
- **`/app/pms/tarifas`**: Gestión de tarifas por tipo de espacio y temporada.
- **`/app/pms/calendario`**: Calendario visual de ocupación (calendar view).
- **`/app/pms/checkin`**: Proceso de check-in de huéspedes.
- **`/app/pms/checkout`**: Proceso de check-out con liquidación de folio.
- **`/app/pms/folios`**: Gestión de folios multi-cuenta con cargos y pagos.
- **`/app/pms/housekeeping`**: Gestión de limpieza de espacios.
- **`/app/pms/mantenimiento`**: Gestión de mantenimiento de espacios.
- **`/app/pms/asignaciones`**: Asignación de espacios a reservas.
- **`/app/pms/bloqueos`**: Bloqueo de espacios por mantenimiento o eventos.
- **`/app/pms/grupos`**: Gestión de reservas grupales.
- **`/app/pms/servicios`**: Servicios adicionales del hotel.
- **`/app/pms/origenes`**: Orígenes de reserva (directo, Booking, Airbnb, etc.).
- **`/app/pms/channel-manager`**: Channel manager para sincronización con OTAs.
- **`/app/pms/configuracion`**: Configuración general del PMS.

#### Sub-módulo: Parking

- **`/app/pms/parking`**: Gestión de parqueaderos del hotel.
- **`/app/pms/parking/abonados`**: Gestión de abonados mensuales de parking.

#### Funcionalidades clave
- Calendario de reservas visual
- Check-in/out con validación de disponibilidad
- Folios multi-cuenta con cargos y pagos
- Tarifas avanzadas por temporada
- Housekeeping integrado
- Mantenimiento de espacios
- Reservas grupales
- Channel manager (OTA sync)
- Reserva rápida desde detalle de espacio (drawer lateral)
- Gestión de parking integrada

---

### Parking

**Ruta base**: `/app/pms/parking`

Gestión de estacionamientos y parqueaderos.

#### Páginas

- **`/app/pms/parking`**: Dashboard del parking con plano visual de puestos, ocupación, tarifas.
- **`/app/pms/parking/abonados`**: Gestión de abonados mensuales.

#### Funcionalidades clave
- Plano visual de puestos de estacionamiento
- Entrada y salida con tarifa por minuto/hora/día
- Abonos mensuales
- Sincronización con POS para cargos y facturación
- Control de ocupación en tiempo real

---

### HRM - Recursos Humanos

**Ruta base**: `/app/hrm`

Gestión completa del ciclo de vida del empleado.

#### Páginas

- **`/app/hrm`**: Dashboard de RRHH con KPIs (total empleados, ausencias, nómina).
- **`/app/hrm/empleados`**: Lista de empleados con contrato, cargo, departamento.
- **`/app/hrm/empleados/[id]`**: Detalle de empleado (perfil, contrato, historial).
- **`/app/hrm/departamentos`**: Departamentos de la organización.
- **`/app/hrm/cargos`**: Cargos/posiciones.
- **`/app/hrm/turnos`**: Gestión de turnos y horarios.
- **`/app/hrm/plantillas-turno`**: Plantillas de turnos recurrentes.
- **`/app/hrm/asistencia`**: Control de asistencia con check-in/out.
- **`/app/hrm/marcacion`**: Registro de marcación (fichaje).
- **`/app/hrm/ausencias`**: Gestión de ausencias y licencias.
- **`/app/hrm/vacaciones`**: Solicitudes y aprobación de vacaciones.
- **`/app/hrm/nomina`**: Gestión de nómina.
- **`/app/hrm/prestamos`**: Préstamos a empleados.
- **`/app/hrm/compensacion`**: Compensación y beneficios.
- **`/app/hrm/rotaciones`**: Rotaciones de personal.
- **`/app/hrm/evaluaciones`**: Evaluaciones de desempeño.
- **`/app/hrm/historial`**: Historial laboral de empleados.

#### Funcionalidades clave
- Empleados y contratos
- Turnos y asistencia con marcación
- Vacaciones, ausencias y licencias
- Nómina y prestaciones
- Préstamos a empleados
- Departamentos y cargos
- Evaluaciones de desempeño
- Compensación y beneficios
- Rotaciones de personal

---

### Transporte

**Ruta base**: `/app/transporte`

Sistema completo de gestión de transporte de pasajeros y carga.

#### Páginas

- **`/app/transporte`**: Dashboard con KPIs (viajes, envíos, boletos, incidentes), filtros por sucursal y transportadora.
- **`/app/transporte/rutas`**: Lista de rutas con CRUD completo, importación masiva, duplicación, activar/desactivar.
- **`/app/transporte/rutas/[id]`**: Detalle de ruta con paradas, mapa (Google Maps), recálculo de distancia/duración, historial de viajes.
- **`/app/transporte/paradas`**: Gestión de paradas/puntos de ruta con coordenadas.
- **`/app/transporte/horarios`**: Horarios de salida por ruta.
- **`/app/transporte/viajes`**: Lista de viajes con filtros (fecha, estado, ruta, vehículo, conductor, sucursal), estadísticas de ocupación.
- **`/app/transporte/viajes/[id]`**: Detalle de viaje con tabs: Pasajeros (boarding, no-show, QR check-in), Timeline (eventos), Incidentes.
- **`/app/transporte/boletos`**: Gestión de boletos de pasajeros con asignación de asiento.
- **`/app/transporte/tarifas-pasajeros`**: Tarifas de pasajeros por ruta.
- **`/app/transporte/envios`**: Gestión de envíos de paquetes con estados (pendiente, recibido, en tránsito, entregado, devuelto, cancelado).
- **`/app/transporte/envios/[id]`**: Detalle de envío con items, intentos de entrega, prueba de entrega, timeline, incidentes.
- **`/app/transporte/mis-envios`**: Vista de envíos del cliente.
- **`/app/transporte/tarifas-envio`**: Tarifas de envío por peso/volumen/ruta.
- **`/app/transporte/vehiculos`**: Gestión de flota de vehículos con capacidad, placa.
- **`/app/transporte/conductores`**: Gestión de conductores.
- **`/app/transporte/transportadoras`**: Gestión de empresas transportadoras.
- **`/app/transporte/direcciones-clientes`**: Direcciones de clientes para envíos.
- **`/app/transporte/manifiestos`**: Manifiestos de carga/pasajeros.
- **`/app/transporte/manifiestos/[id]`**: Detalle de manifiesto.
- **`/app/transporte/incidentes`**: Gestión de incidentes.
- **`/app/transporte/incidentes/[id]`**: Detalle de incidente.
- **`/app/transporte/tracking`**: Seguimiento de vehículos/envíos en tiempo real.
- **`/app/transporte/etiquetas`**: Etiquetas de envío (labels).
- **`/app/transporte/tarifas-pasajeros`**: Tarifas de boletos de pasajero.

#### Funcionalidades clave
- Rutas con paradas, mapa (Google Maps) y recálculo de distancia
- Viajes con gestión de pasajeros, boarding, QR check-in
- Envíos de paquetes con tracking completo
- Boletos con asignación de asiento
- Manifiestos de carga
- Gestión de flota y conductores
- Transportadoras externas
- Incidentes con severidad y resolución
- Tracking en tiempo real
- Tarifas de pasajeros y envíos
- Filtros avanzados por sucursal, fecha, estado

---

### Gym (Gimnasio)

**Ruta base**: `/app/gym`

Gestión completa de gimnasios y centros deportivos.

#### Páginas

- **`/app/gym`**: Dashboard del gimnasio con KPIs (miembros activos, ingresos, ocupación).
- **`/app/gym/membresias`**: Lista de membresías activas.
- **`/app/gym/membresias/[id]`**: Detalle de membresía.
- **`/app/gym/planes`**: Planes de membresía (mensual, trimestral, anual) con precios y beneficios.
- **`/app/gym/clases`**: Clases grupales e individuales.
- **`/app/gym/horarios`**: Horarios de clases.
- **`/app/gym/instructores`**: Gestión de instructores.
- **`/app/gym/reservaciones`**: Reservas de clases y equipos.
- **`/app/gym/checkin`**: Check-in QR de miembros.
- **`/app/gym/dispositivos`**: Dispositivos de control acceso.
- **`/app/gym/ajustes`**: Configuración del gimnasio.
- **`/app/gym/reportes`**: Reportes de asistencia, ingresos, retención.

#### Funcionalidades clave
- Membresías con planes y renovaciones
- Clases grupales e individuales con horarios
- Check-in QR para control de acceso
- Reservas de clases y equipos
- Gestión de instructores
- Dispositivos de acceso (QR readers)
- Rutinas personalizadas
- Métricas de progreso de miembros
- Reportes de asistencia y retención

---

### Chat Omnicanal

**Ruta base**: `/app/chat`

Sistema de chat omnicanal con IA integrada para comunicación en tiempo real.

#### Páginas

- **`/app/chat`**: Dashboard del chat con estadísticas de conversaciones.
- **`/app/chat/bandeja`**: Bandeja de entrada unificada de conversaciones.
- **`/app/chat/canales`**: Gestión de canales (WhatsApp, Facebook, Instagram, Sitio Web).
- **`/app/chat/canales/whatsapp/[id]`**: Configuración de canal WhatsApp.
- **`/app/chat/canales/facebook/[id]`**: Configuración de canal Facebook Messenger.
- **`/app/chat/canales/instagram/[id]`**: Configuración de canal Instagram.
- **`/app/chat/canales/sitio-web/[id]`**: Configuración de widget de sitio web.
- **`/app/chat/conversaciones`**: Lista de conversaciones (versión en español).
- **`/app/chat/conversaciones/nueva`**: Iniciar nueva conversación.
- **`/app/chat/conversaciones/[id]`**: Detalle de conversación con mensajes en tiempo real.
- **`/app/chat/conversaciones/[id]/archivos`**: Archivos compartidos en la conversación.
- **`/app/chat/conversaciones/[id]/actividad`**: Log de actividad de la conversación.
- **`/app/chat/conocimiento`**: Base de conocimiento para IA.
- **`/app/chat/conocimiento/fuentes/[id]`**: Fuentes de conocimiento.
- **`/app/chat/conocimiento/fragmentos/[id]`**: Fragmentos de conocimiento.
- **`/app/chat/conocimiento/importar`**: Importar conocimiento desde URLs o archivos.
- **`/app/chat/ia/configuracion`**: Configuración del agente de IA.
- **`/app/chat/ia/laboratorio`**: Laboratorio de pruebas de IA.
- **`/app/chat/ia/trabajos`**: Trabajos de entrenamiento de IA.
- **`/app/chat/configuracion/etiquetas`**: Etiquetas para clasificar conversaciones.
- **`/app/chat/configuracion/llaves-api`**: Gestión de API keys.
- **`/app/chat/configuracion/respuestas-rapidas`**: Respuestas rápidas predefinidas.
- **`/app/chat/auditoria`**: Auditoría de conversaciones y agentes.
- **`/app/chat/widget/sesiones`**: Sesiones del widget de chat web.

#### Funcionalidades clave
- Bandeja unificada omnicanal (WhatsApp, Facebook, Instagram, Web)
- IA integrada con base de conocimiento
- Entrenamiento de IA con fuentes y fragmentos
- Laboratorio de pruebas de IA
- Respuestas rápidas
- Etiquetas y clasificación
- Auditoría de conversaciones
- Widget embebible para sitios web
- API keys para integraciones
- Mensajería en tiempo real (Supabase Realtime)

---

### Calendario

**Ruta base**: `/app/calendario`

Calendario centralizado con eventos, tareas y recordatorios.

#### Páginas

- **`/app/calendario`**: Vista principal del calendario con eventos, tareas y recordatorios.
- **`/app/calendario/configuracion`**: Configuración del calendario.
- **`/app/calendario/importar`**: Importar eventos desde fuentes externas (Google Calendar, etc.).
- **`/app/calendario/recurrencias`**: Gestión de eventos recurrentes.

#### Funcionalidades clave
- Visualización completa de actividades programadas
- Eventos, tareas y recordatorios unificados
- Soporte para eventos recurrentes
- Importación desde fuentes externas
- Integración con timeline feed
- Vista por día, semana, mes

---

### Reportes y Analítica

**Ruta base**: `/app/reportes`

Dashboards editables y reportes de todos los módulos.

#### Páginas

- **`/app/reportes`**: Dashboard principal de reportes.
- **`/app/reportes/finanzas`**: Reportes financieros.
- **`/app/reportes/ventas`**: Reportes de ventas.
- **`/app/reportes/inventario`**: Reportes de inventario.
- **`/app/reportes/pms`**: Reportes de hotelería.
- **`/app/reportes/hrm`**: Reportes de recursos humanos.
- **`/app/reportes/personalizados`**: Reportes personalizados.
- **`/app/reportes/programados`**: Reportes programados (envío automático).
- **`/app/reportes/ejecuciones`**: Historial de ejecuciones de reportes.
- **`/app/reportes/auditoria`**: Reportes de auditoría.

#### Funcionalidades clave
- Dashboards editables
- Vistas predefinidas por módulo
- Programador de reportes (envío automático por email)
- KPIs y alertas
- Reportes personalizados
- Exportación de datos
- Historial de ejecuciones

---

### Notificaciones

**Ruta base**: `/app/notificaciones`

Sistema centralizado de comunicaciones y notificaciones.

#### Páginas

- **`/app/notificaciones`**: Bandeja unificada de notificaciones.
- **`/app/notificaciones/plantillas`**: Plantillas de notificaciones.
- **`/app/notificaciones/reglas`**: Reglas automáticas de notificación.
- **`/app/notificaciones/historial`**: Historial de entregas.
- **`/app/notificaciones/twilio`**: Configuración de Twilio (SMS/WhatsApp/Voz).

#### Funcionalidades clave
- Canales múltiples (email, SMS, WhatsApp, push)
- Plantillas personalizables
- Reglas automáticas por evento
- Bandeja unificada
- Historial de entregas
- Integración con Twilio para SMS/WhatsApp/Voz
- Créditos mensuales según plan (comm_sms_monthly, comm_whatsapp_monthly, comm_voice_minutes_monthly)

---

### Integraciones

**Ruta base**: `/app/integraciones`

Marketplace de conectores y APIs externas.

#### Páginas

- **`/app/integraciones`**: Lista de integraciones disponibles y conectadas.
- **`/app/integraciones/conexiones`**: Gestión de conexiones activas.
- **`/app/integraciones/logs`**: Logs de sincronización.
- **`/app/integraciones/webhooks`**: Configuración de webhooks.

#### Funcionalidades clave
- Marketplace de conectores
- Wizard de conexión paso a paso
- Sync jobs programados
- API Keys management
- Webhooks para eventos
- Logs de sincronización
- Límite de integraciones según plan

---

### Roles y Permisos

**Ruta base**: `/app/roles`

Gestión granular de acceso y permisos.

#### Páginas

- **`/app/roles`**: Lista de roles con asignación de miembros.
- **`/app/roles/configuracion`**: Configuración avanzada de permisos.

#### Funcionalidades clave
- Plantillas globales + locales por organización
- Permisos granulares por scope (módulo, acción)
- Asignación dinámica con varios roles ligados a varias sucursales
- Auditoría de cambios de roles
- Roles del sistema (is_system) no editables
- Soporte para super admin

---

### Timeline

**Ruta base**: `/app/timeline`

Feed centralizado de eventos y actividad del sistema.

#### Páginas

- **`/app/timeline`**: Feed principal de eventos con filtros.
- **`/app/timeline/eventos/[id]`**: Detalle de evento específico.
- **`/app/timeline/[entityType]/[entityId]`**: Timeline de una entidad específica (cliente, venta, reserva, etc.).
- **`/app/timeline/correlaciones/[correlationId]`**: Eventos correlacionados.
- **`/app/timeline/configuracion`**: Configuración del timeline.
- **`/app/timeline/exportaciones`**: Exportación de eventos.

#### Funcionalidades clave
- Feed unificado de todas las actividades del sistema
- Filtros por tipo de entidad, fecha, usuario
- Correlación de eventos
- Timeline por entidad específica
- Exportación de datos
- Configuración de qué eventos registrar

---

### Gestión de Proyectos (PM)

**Ruta base**: `/app/pm`

Módulo de administración de proyectos, metas y propuestas.

#### Páginas

- **`/app/pm`**: Dashboard de proyectos.
- **`/app/pm/proyectos`**: Lista de proyectos.
- **`/app/pm/metas`**: Metas y objetivos.
- **`/app/pm/pagos`**: Pagos asociados a proyectos.

#### Funcionalidades clave
- Administración de proyectos con hitos
- Asignación de miembros del equipo
- Subtareas jerárquicas
- Seguimiento de progreso
- Metas y propósitos
- Propuestas comerciales
- Gestión de pagos por proyecto

---

### Operaciones

**Ruta base**: `/app/operacion`

Dashboard 360° de la operación del negocio.

#### Páginas

- **`/app/operacion`**: Vista general de operaciones con KPIs en vivo, feed de eventos, pendientes, incidencias Kanban, monitor de servicios y auditoría.

#### Funcionalidades clave
- KPIs en vivo consolidados de todos los módulos
- Feed de eventos en tiempo real
- Gestión de pendientes
- Incidencias en vista Kanban
- Monitor de servicios
- Auditoría de operaciones

---

## Base de Datos

### Visión General

La base de datos está hospedada en **Supabase** (PostgreSQL) con **Row Level Security (RLS)** habilitado en todas las tablas. Cada tabla incluye `organization_id` para garantizar el aislamiento multi-tenant.

### Tablas Principales por Módulo

#### Organización y Autenticación
- `organizations`: Organizaciones con subdominio, branding, tipo, país.
- `organization_types`: Tipos de negocio (restaurant, hotel, retail, services, gym, transport, parking).
- `organization_members`: Miembros de organizaciones con role_id y is_super_admin.
- `branches`: Sucursales por organización.
- `roles`: Roles del sistema con permisos.
- `permissions`: Permisos granulares.
- `profiles`: Perfiles de usuario.

#### Suscripciones y Planes
- `plans`: Planes de suscripción con features, precios y Stripe IDs.
- `subscriptions`: Suscripciones activas con billing_period, trial, Stripe IDs.
- `modules`: Módulos disponibles con código, descripción, icono, rank, is_core, is_active.

#### CRM
- `pipelines`: Pipelines de ventas por organización.
- `stages`: Etapas de pipeline con posición, probabilidad, color, descripción.
- `opportunities`: Oportunidades de venta con valor, etapa, cliente.
- `activities`: Actividades vinculadas a oportunidades/clientes.
- `campaigns`: Campañas de marketing.
- `segments`: Segmentos de clientes.

#### Finanzas
- `invoice_sales`: Facturas de venta con timbrado, condiciones de pago, descuentos.
- `invoice_purchase`: Facturas de compra.
- `invoice_items`: Items de facturas con discount_amount/discount_rate.
- `accounts_receivable`: Cuentas por cobrar con cuotas y pronto pago.
- `accounts_payable`: Cuentas por pagar.
- `payments`: Pagos registrados.
- `taxes`: Impuestos configurados.
- `tax_templates`: Plantillas de impuestos por país.
- `payment_terms_catalog`: Catálogo de condiciones de pago con tramos.
- `payment_term_tiers`: Tramos de descuento por pronto pago.
- `chart_of_accounts`: Plan de cuentas contables.
- `journal_entries`: Asientos contables.
- `bank_accounts`: Cuentas bancarias.
- `bank_reconciliations`: Conciliaciones bancarias.

#### POS / Ventas
- `sales`: Ventas registradas.
- `carts`: Carritos de compra.
- `cash_registers`: Cajas registradoras.
- `cash_movements`: Movimientos de caja.
- `tables`: Mesas de restaurante.
- `orders`: Comandas/órdenes.
- `promotions`: Promociones.
- `coupons`: Cupones de descuento.

#### Inventario
- `products`: Productos con variantes, categorías, precios.
- `product_variants`: Variantes de productos.
- `categories`: Categorías en árbol.
- `stock`: Stock por sucursal y producto.
- `stock_movements`: Movimientos de inventario.
- `lots`: Lotes con vencimiento.
- `suppliers`: Proveedores.
- `purchase_orders`: Órdenes de compra.
- `units_of_measure`: Unidades de medida.

#### PMS (Hotelería)
- `spaces`: Espacios (habitaciones) con estado.
- `space_types`: Tipos de espacio.
- `reservations`: Reservas con check-in/out, estado.
- `folios`: Folios multi-cuenta.
- `folio_charges`: Cargos a folio.
- `rates`: Tarifas por tipo y temporada.
- `housekeeping_tasks`: Tareas de limpieza.

#### Transporte
- `transport_routes`: Rutas con paradas, distancia, duración.
- `transport_stops`: Paradas con coordenadas.
- `route_stops`: Relación ruta-parada con orden.
- `trips`: Viajes con estado, vehículo, conductor.
- `trip_tickets`: Boletos de pasajeros.
- `shipments`: Envíos de paquetes con estado.
- `shipment_items`: Items de envío.
- `vehicles`: Vehículos de la flota.
- `drivers`: Conductores.
- `carriers`: Transportadoras.
- `transport_events`: Eventos de timeline de transporte.
- `transport_incidents`: Incidentes de transporte.

#### HRM
- `employees`: Empleados con contrato, cargo, departamento.
- `departments`: Departamentos.
- `positions`: Cargos/posiciones.
- `shifts`: Turnos.
- `attendance`: Asistencia.
- `payroll`: Nómina.
- `leave_requests`: Solicitudes de vacaciones/permisos.

#### Chat / IA
- `chat_conversations`: Conversaciones omnicanal.
- `chat_messages`: Mensajes de chat.
- `chat_channels`: Canales configurados.
- `ai_agent_runs`: Ejecuciones del agente de IA.
- `ai_agent_suggestions`: Sugerencias de IA.
- `ai_jobs`: Trabajos de entrenamiento de IA.
- `ai_settings`: Configuración de IA.
- `ai_training_feedback`: Feedback de entrenamiento.
- `ai_usage_logs`: Logs de uso de IA.

#### Calendario y Timeline
- `calendar_events`: Eventos del calendario.
- `timeline_events`: Eventos del timeline con correlaciones.

#### Gimnasio
- `gym_memberships`: Membresías de gimnasio.
- `gym_plans`: Planes de membresía.
- `gym_classes`: Clases.
- `gym_class_schedules`: Horarios de clases.
- `gym_reservations`: Reservas de clases.
- `gym_checkins`: Check-ins de gimnasio.

---

## Resumen Ejecutivo

**Go Admin ERP** es una plataforma SaaS multi-tenant completa y modular que centraliza la gestión de negocios en una sola solución. Desarrollada con Next.js + Supabase, atiende a **7 tipos de industrias**: restaurantes, hoteles, tiendas retail, servicios profesionales, gimnasios, transporte y parking.

### Fortalezas clave

1. **Modularidad**: 19 módulos activos que se activan según el plan y tipo de negocio.
2. **Multi-sucursal**: Soporte para múltiples branches con aislamiento de datos.
3. **IA integrada**: Asistente de IA con créditos mensuales y base de conocimiento entrenable.
4. **Comunicación omnicanal**: Chat unificado con WhatsApp, Facebook, Instagram y web.
5. **Facturación electrónica**: Soporte para DIAN Colombia con timbrado.
6. **Integración con Stripe**: Suscripciones automatizadas con 3 planes de pago anual.
7. **Personalización**: Branding corporativo (logo, colores, subdominio).
8. **Seguridad**: RLS en todas las tablas, roles y permisos granulares.

### Planes con producto en Stripe (anuales)

| Plan | Precio Anual | Product ID | Target |
|---|---|---|---|
| **Pro** | $199 USD/año | `prod_Ue3vmr6NJRoYtQ` | 80% del mercado (PYMES) |
| **Business** | $490 USD/año | `prod_Ue3wbzEypU3F7K` | Grandes empresas y franquicias |
| **Ultimate** | $1,990 USD/año | `prod_Ue3xai4oS95RBf` | Empresas que necesitan todo |

### Total de páginas en la aplicación

La aplicación contiene **más de 260 páginas** distribuidas across 19+ módulos, haciendo de Go Admin uno de los ERPs más completos del mercado para PYMES latinoamericanas.

---

*Documento generado el 2025-07-17 basado en el análisis del código fuente y base de datos del proyecto Go Admin ERP (Supabase project: jgmgphmzusbluqhuqihj).*
