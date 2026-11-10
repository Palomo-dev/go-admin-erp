-- Catálogo de referencia del PUC comercial (Decreto 2650 de 1993 y sus modificaciones).
--
-- ESTADO: APLICADA el 2026-11-10 (registro 20261110211635). md5 del cuerpo aplicado: b2d90907…, el de este archivo con la línea ESTADO original.
-- Reversión: supabase/rollbacks/20261110220000_puc_catalogo_decreto_2650_rollback.sql.
-- Fecha: 2026-11-10.
--
-- Por qué. El Contador pidió que, al crear en el plan de cuentas una cuenta (4 dígitos) debajo de
-- un grupo o una subcuenta (6 dígitos) debajo de una cuenta, el sistema sugiera primero el código
-- que el PUC ya tiene para ese concepto y avise si el código elegido no está en el catálogo.
-- public.puc_plantilla no sirve para eso: es la semilla reducida con la que
-- fn_create_default_chart_of_accounts siembra el plan de las organizaciones nuevas (9 clases,
-- 48 grupos, 159 cuentas, 32 subcuentas, 12 auxiliares). Llenarla con el catálogo completo haría
-- nacer cada organización con miles de cuentas, así que el catálogo va en una tabla aparte.
-- Esta tabla NO siembra planes y nadie la escribe desde la aplicación: solo se consulta.
--
-- Fuentes.
-- 1. Principal: https://puc.com.co/ (recorrido completo el 2026-11-10: /1 a /9, cada grupo
--    /NN y cada cuenta /NNNN, 401 páginas). Nombres en mayúscula inicial y con tildes.
-- 2. Cruce: texto oficial del Decreto 2650 de 1993 con sus modificaciones (Decretos 2894 de 1994,
--    2116 de 1996, 95 de 1997, 1536 de 2007), artículo 14, en el gestor normativo de la CREG:
--    https://gestornormativo.creg.gov.co/gestor/entorno/docs/decreto_2650_1993.htm
--    Resultado del cruce: los 2.502 códigos de la fuente 1 están en el texto oficial vigente; las
--    diferencias de nombre son solo de forma (notas de modificación pegadas al nombre,
--    mayúsculas, puntos en siglas como I.C.B.F. o I.S.S., y erratas del texto oficial como
--    «TRILLLA» o «CUMUNICACION»). Los códigos que el texto oficial trae y la fuente 1 no:
--    171072, 3110, 311005 y 311010 están eliminados por el artículo 7 del Decreto 2894 de 1994
--    (no se cargan); 939520 «Pedidos colocados» está vigente y la fuente 1 la omite: se carga
--    desde el texto oficial.
-- Ajuste de forma: 171076 llega de la fuente 1 con las comillas dañadas («?débitos?»); se
-- escribe con comillas como en el texto oficial («IMPUESTO DE RENTA DIFERIDO "DEBITOS"…»).
-- Las subcuentas «99 Ajustes por inflación» se conservan porque siguen en el texto del
-- catálogo, aunque el sistema de ajustes integrales por inflación se eliminó (Decreto 1536 de
-- 2007); el plan de cada organización decide si las usa.
--
-- Conteos: 9 clases, 52 grupos, 340 cuentas, 2.102 subcuentas (2.503 filas).
--
-- Sin hijos en el catálogo, y por qué: el Decreto no les fija códigos, sino un rango libre
-- para que cada ente los abra según su necesidad.
-- · Grupos sin cuentas (rango «NN01 a NN99»): 71, 72, 73, 74, 82, 84, 85, 86, 92, 94, 95, 96.
-- · Cuentas sin subcuentas (rango «NNNN01 a NNNN98»), 76: 1323, 1328, 1332, 1385, 1390, 1699,
--   1730, 2130, 2140, 2205, 2210, 2215, 2220, 2225, 2305, 2310, 2315, 2320, 2330, 2340, 2345,
--   2350, 2357, 2367, 2368, 2375, 2408, 2416, 2420, 2428, 2432, 2440, 2448, 2452, 2456, 2460,
--   2468, 2472, 2476, 2495, 2505, 2515, 2520, 2525, 2532, 2535, 2540, 2640, 2715, 2720, 2820,
--   2840, 2905, 2910, 2915, 3120, 3125, 3130, 3135, 3140, 3215, 3220, 3410, 3415, 3505, 3510,
--   3605, 3610, 3705, 3710, 8125, 8335, 9125, 9130, 9135, 9195.
--   Algunas de ellas sí tienen subcuentas en puc_plantilla (por ejemplo 240805 y 240810 bajo
--   2408, o 370505 bajo 3705): son códigos del rango libre que la plantilla eligió, no del
--   catálogo.
--
-- Carga en tres migraciones (este archivo con la tabla y las clases 1 a 3; 20261110220010
-- con las clases 4 y 5; 20261110220020 con las clases 6 a 9): cada una se aplica por el MCP
-- en una sola llamada y el catálogo completo no cabe en una.
-- Este archivo: 3 clases, 26 grupos, 223 cuentas, 868 subcuentas (1120 filas).
-- Formato de los datos: una línea «código nombre» por fila; el padre se calcula por prefijo
-- (2 → 1, 4 → 2, 6 → 4) y la restricción puc_catalogo_padre_prefijo lo vuelve a comprobar.
--
-- Seguridad. RLS activado; solo SELECT para authenticated. anon y public sin ningún privilegio.
-- Escritura solo para postgres y service_role (dueño y rol de servicio; RLS no les aplica).

create table if not exists public.puc_catalogo (
  codigo text primary key
    check (codigo ~ '^[1-9][0-9]*$' and length(codigo) in (1, 2, 4, 6)),
  nombre text not null check (btrim(nombre) <> ''),
  padre text references public.puc_catalogo (codigo),
  nivel text generated always as (
    case length(codigo)
      when 1 then 'clase'
      when 2 then 'grupo'
      when 4 then 'cuenta'
      else 'subcuenta'
    end
  ) stored,
  constraint puc_catalogo_padre_prefijo check (
    (length(codigo) = 1 and padre is null)
    or (length(codigo) > 1 and padre is not null and left(codigo, length(padre)) = padre
        and length(padre) = case length(codigo) when 2 then 1 when 4 then 2 else 4 end)
  )
);

create index if not exists puc_catalogo_padre_idx on public.puc_catalogo (padre);

comment on table public.puc_catalogo is
  'Catálogo de referencia del PUC comercial (Decreto 2650 de 1993 y modificaciones): clases, grupos, cuentas y subcuentas. Sirve para sugerir el código oficial y avisar si un código no está en el catálogo al crear cuentas en chart_of_accounts. NO siembra planes de organizaciones nuevas (eso lo hace puc_plantilla) y no tiene datos de clientes. Solo lectura para authenticated.';
comment on column public.puc_catalogo.codigo is 'Código PUC: 1 dígito clase, 2 grupo, 4 cuenta, 6 subcuenta.';
comment on column public.puc_catalogo.padre is 'Código del nivel anterior; null en las clases.';
comment on column public.puc_catalogo.nivel is 'clase, grupo, cuenta o subcuenta, según la longitud del código.';

alter table public.puc_catalogo enable row level security;

revoke all on table public.puc_catalogo from public, anon, authenticated;
grant select on table public.puc_catalogo to authenticated;
grant all on table public.puc_catalogo to service_role;

drop policy if exists puc_catalogo_lectura on public.puc_catalogo;
create policy puc_catalogo_lectura on public.puc_catalogo
  for select to authenticated using (true);

insert into public.puc_catalogo (codigo, nombre, padre)
select l.codigo, l.nombre,
       case length(l.codigo) when 1 then null when 2 then left(l.codigo, 1)
                             when 4 then left(l.codigo, 2) else left(l.codigo, 4) end
  from (
    select substring(t.linea from '^([0-9]+) ') as codigo,
           substring(t.linea from '^[0-9]+ (.+)$') as nombre
      from regexp_split_to_table($puc$
1 Activo
11 Disponible
1105 Caja
110505 Caja general
110510 Cajas menores
110515 Moneda extranjera
1110 Bancos
111005 Moneda nacional
111010 Moneda extranjera
1115 Remesas en tránsito
111505 Moneda nacional
111510 Moneda extranjera
1120 Cuentas de ahorro
112005 Bancos
112010 Corporaciones de ahorro y vivienda
112015 Organismos cooperativos financieros
1125 Fondos
112505 Rotatorios moneda nacional
112510 Rotatorios moneda extranjera
112515 Especiales moneda nacional
112520 Especiales moneda extranjera
112525 De amortización moneda nacional
112530 De amortización moneda extranjera
12 Inversiones
1205 Acciones
120505 Agricultura, ganadería, caza y silvicultura
120510 Pesca
120515 Explotación de minas y canteras
120520 Industria manufacturera
120525 Suministro de electricidad, gas y agua
120530 Construcción
120535 Comercio al por mayor y al por menor
120540 Hoteles y restaurantes
120545 Transporte, almacenamiento y comunicaciones
120550 Actividad financiera
120555 Actividades inmobiliarias, empresariales y de alquiler
120560 Enseñanza
120565 Servicios sociales y de salud
120570 Otras actividades de servicios comunitarios, sociales y personales
120599 Ajustes por inflación
1210 Cuotas o partes de interés social
121005 Agricultura, ganadería, caza y silvicultura
121010 Pesca
121015 Explotación de minas y canteras
121020 Industria manufacturera
121025 Suministro de electricidad, gas y agua
121030 Construcción
121035 Comercio al por mayor y al por menor
121040 Hoteles y restaurantes
121045 Transporte, almacenamiento y comunicaciones
121050 Actividad financiera
121055 Actividades inmobiliarias, empresariales y de alquiler
121060 Enseñanza
121065 Servicios sociales y de salud
121070 Otras actividades de servicios comunitarios, sociales y personales
121099 Ajustes por inflación
1215 Bonos
121505 Bonos públicos moneda nacional
121510 Bonos públicos moneda extranjera
121515 Bonos ordinarios
121520 Bonos convertibles en acciones
121595 Otros
1220 Cédulas
122005 Cédulas de capitalización
122010 Cédulas hipotecarias
122015 Cédulas de inversión
122095 Otras
1225 Certificados
122505 Certificados de depósito a término (CDT)
122510 Certificados de depósito de ahorro
122515 Certificados de ahorro de valor constante (CAVC)
122520 Certificados de cambio
122525 Certificados cafeteros valorizables
122530 Certificados eléctricos valorizables (CEV)
122535 Certificados de reembolso tributario (CERT)
122540 Certificados de desarrollo turístico
122545 Certificados de inversión forestal (CIF)
122595 Otros
1230 Papeles comerciales
123005 Empresas comerciales
123010 Empresas industriales
123015 Empresas de servicios
1235 Títulos
123505 Títulos de desarrollo agropecuario
123510 Títulos canjeables por certificados de cambio
123515 Títulos de tesorería (TES)
123520 Títulos de participación
123525 Títulos de crédito de fomento
123530 Títulos financieros agroindustriales (TFA)
123535 Títulos de ahorro cafetero (TAC)
123540 Títulos de ahorro nacional (TAN)
123545 Títulos energéticos de rentabilidad creciente (TER)
123550 Títulos de ahorro educativo (TAE)
123555 Títulos financieros industriales y comerciales
123560 Tesoros
123565 Títulos de devolución de impuestos nacionales (TIDIS)
123570 Títulos inmobiliarios
123595 Otros
1240 Aceptaciones bancarias o financieras
124005 Bancos comerciales
124010 Compañías de financiamiento comercial
124015 Corporaciones financieras
124095 Otras
1245 Derechos fiduciarios
124505 Fideicomisos de inversión moneda nacional
124510 Fideicomisos de inversión moneda extranjera
1250 Derechos de recompra de inversiones negociadas (repos)
125005 Acciones
125010 Cuotas o partes de interés social
125015 Bonos
125020 Cédulas
125025 Certificados
125030 Papeles comerciales
125035 Títulos
125040 Aceptaciones bancarias o financieras
125095 Otros
125099 Ajustes por inflación
1255 Obligatorias
125505 Bonos de financiamiento especial
125510 Bonos de financiamiento presupuestal
125515 Bonos para desarrollo social y seguridad interna (BDSI)
125595 Otras
1260 Cuentas en participación
126099 Ajustes por inflación
1295 Otras inversiones
129505 Aportes en cooperativas
129510 Derechos en clubes sociales
129515 Acciones o derechos en clubes deportivos
129520 Bonos en colegios
129595 Diversas
129599 Ajustes por inflación
1299 Provisiones
129905 Acciones
129910 Cuotas o partes de interés social
129915 Bonos
129920 Cédulas
129925 Certificados
129930 Papeles comerciales
129935 Títulos
129940 Aceptaciones bancarias o financieras
129945 Derechos fiduciarios
129950 Derechos de recompra de inversiones negociadas
129955 Obligatorias
129960 Cuentas en participación
129995 Otras inversiones
13 Deudores
1305 Clientes
130505 Nacionales
130510 Del exterior
130515 Deudores del sistema
1310 Cuentas corrientes comerciales
131005 Casa matriz
131010 Compañías vinculadas
131015 Accionistas o socios
131020 Particulares
131095 Otras
1315 Cuentas por cobrar a casa matriz
131505 Ventas
131510 Pagos a nombre de casa matriz
131515 Valores recibidos por casa matriz
131520 Préstamos
1320 Cuentas por cobrar a vinculados económicos
132005 Filiales
132010 Subsidiarias
132015 Sucursales
1323 Cuentas por cobrar a directores
1325 Cuentas por cobrar a socios y accionistas
132505 A socios
132510 A accionistas
1328 Aportes por cobrar
1330 Anticipos y avances
133005 A proveedores
133010 A contratistas
133015 A trabajadores
133020 A agentes
133025 A concesionarios
133030 De adjudicaciones
133095 Otros
133099 Ajustes por inflación
1332 Cuentas de operación conjunta
1335 Depósitos
133505 Para importaciones
133510 Para servicios
133515 Para contratos
133520 Para responsabilidades
133525 Para juicios ejecutivos
133530 Para adquisición de acciones, cuotas o derechos sociales
133535 En garantía
133595 Otros
1340 Promesas de compra venta
134005 De bienes raíces
134010 De maquinaria y equipo
134015 De flota y equipo de transporte
134020 De flota y equipo aéreo
134025 De flota y equipo férreo
134030 De flota y equipo fluvial y/o marítimo
134035 De semovientes
134095 De otros bienes
1345 Ingresos por cobrar
134505 Dividendos y/o participaciones
134510 Intereses
134515 Comisiones
134520 Honorarios
134525 Servicios
134530 Arrendamientos
134535 CERT por cobrar
134595 Otros
1350 Retención sobre contratos
135005 De construcción
135010 De prestación de servicios
135095 Otros
1355 Anticipo de impuestos y contribuciones o saldos a favor
135505 Anticipo de impuestos de renta y complementarios
135510 Anticipo de impuestos de industria y comercio
135515 Retención en la fuente
135517 Impuesto a las ventas retenido
135518 Impuesto de industria y comercio retenido
135520 Sobrantes en liquidación privada de impuestos
135525 Contribuciones
135530 Impuestos descontables
135595 Otros
1360 Reclamaciones
136005 A compañías aseguradoras
136010 A transportadores
136015 Por tiquetes aéreos
136095 Otras
1365 Cuentas por cobrar a trabajadores
136505 Vivienda
136510 Vehículos
136515 Educación
136520 Médicos, odontológicos y similares
136525 Calamidad doméstica
136530 Responsabilidades
136595 Otros
1370 Préstamos a particulares
137005 Con garantía real
137010 Con garantía personal
1380 Deudores varios
138005 Depositarios
138010 Comisionistas de bolsas
138015 Fondo de inversión
138020 Cuentas por cobrar de terceros
138025 Pagos por cuenta de terceros
138030 Fondos de inversión social
138095 Otros
1385 Derechos de recompra de cartera negociada
1390 Deudas de difícil cobro
1399 Provisiones
139905 Clientes
139910 Cuentas corrientes comerciales
139915 Cuentas por cobrar a casa matriz
139920 Cuentas por cobrar a vinculados económicos
139925 Cuentas por cobrar a socios y accionistas
139930 Anticipos y avances
139932 Cuentas de operación conjunta
139935 Depósitos
139940 Promesas de compraventa
139945 Ingresos por cobrar
139950 Retención sobre contratos
139955 Reclamaciones
139960 Cuentas por cobrar a trabajadores
139965 Préstamos a particulares
139975 Deudores varios
139980 Derechos de recompra de cartera negociada
14 Inventarios
1405 Materias primas
140599 Ajustes por inflación
1410 Productos en proceso
141099 Ajustes por inflación
1415 Obras de construcción en curso
141599 Ajustes por inflación
1417 Obras de urbanismo
141799 Ajustes por inflación
1420 Contratos en ejecución
142099 Ajustes por inflación
1425 Cultivos en desarrollo
142599 Ajustes por inflación
1428 Plantaciones agrícolas
142899 Ajustes por inflación
1430 Productos terminados
143005 Productos manufacturados
143010 Productos extraídos y/o procesados
143015 Productos agrícolas y forestales
143020 Subproductos
143025 Productos de pesca
143099 Ajustes por inflación
1435 Mercancías no fabricadas por la empresa
143599 Ajustes por inflación
1440 Bienes raíces para la venta
144099 Ajustes por inflación
1445 Semovientes
144599 Ajustes por inflación
1450 Terrenos
145005 Por urbanizar
145010 Urbanizados por construir
145099 Ajustes por inflación
1455 Materiales, repuestos y accesorios
145599 Ajustes por inflación
1460 Envases y empaques
146099 Ajustes por inflación
1465 Inventarios en tránsito
146599 Ajustes por inflación
1499 Provisiones
149905 Para obsolescencia
149910 Para diferencia de inventario físico
149915 Para pérdidas de inventarios
149920 Lifo
15 Propiedades, planta y equipo
1504 Terrenos
150405 Urbanos
150410 Rurales
150499 Ajustes por inflación
1506 Materiales proyectos petroleros
150605 Tuberías y equipo
150610 Costos de importación materiales
150615 Proyectos de construcción
150699 Ajustes por inflación
1508 Construcciones en curso
150805 Construcciones y edificaciones
150810 Acueductos, plantas y redes
150815 Vías de comunicación
150820 Pozos artesianos
150825 Proyectos de exploración
150830 Proyectos de desarrollo
150899 Ajustes por inflación
1512 Maquinaria y equipos en montaje
151205 Maquinaria y equipo
151210 Equipo de oficina
151215 Equipo de computación y comunicación
151220 Equipo médico-científico
151225 Equipo de hoteles y restaurantes
151230 Flota y equipo de transporte
151235 Flota y equipo fluvial y/o marítimo
151240 Flota y equipo aéreo
151245 Flota y equipo férreo
151250 Plantas y redes
151299 Ajustes por inflación
1516 Construcciones y edificaciones
151605 Edificios
151610 Oficinas
151615 Almacenes
151620 Fábricas y plantas industriales
151625 Salas de exhibición y ventas
151630 Cafetería y casinos
151635 Silos
151640 Invernaderos
151645 Casetas y campamentos
151650 Instalaciones agropecuarias
151655 Viviendas para empleados y obreros
151660 Terminal de buses y taxis
151663 Terminal marítimo
151665 Terminal férreo
151670 Parqueaderos, garajes y depósitos
151675 Hangares
151680 Bodegas
151695 Otros
151699 Ajustes por inflación
1520 Maquinaria y equipo
152099 Ajustes por inflación
1524 Equipo de oficina
152405 Muebles y enseres
152410 Equipos
152495 Otros
152499 Ajustes por inflación
1528 Equipo de computación y comunicación
152805 Equipos de procesamiento de datos
152810 Equipos de telecomunicaciones
152815 Equipos de radio
152820 Satélites y antenas
152825 Líneas telefónicas
152895 Otros
152899 Ajustes por inflación
1532 Equipo médico-científico
153205 Médico
153210 Odontológico
153215 Laboratorio
153220 Instrumental
153295 Otros
153299 Ajustes por inflación
1536 Equipo de hoteles y restaurantes
153605 De habitaciones
153610 De comestibles y bebidas
153695 Otros
153699 Ajustes por inflación
1540 Flota y equipo de transporte
154005 Autos, camionetas y camperos
154008 Camiones, volquetas y furgones
154010 Tractomulas y remolques
154015 Buses y busetas
154017 Recolectores y contenedores
154020 Montacargas
154025 Palas y grúas
154030 Motocicletas
154035 Bicicletas
154040 Estibas y carretas
154045 Bandas transportadoras
154095 Otros
154099 Ajustes por inflación
1544 Flota y equipo fluvial y/o marítimo
154405 Buques
154410 Lanchas
154415 Remolcadoras
154420 Botes
154425 Boyas
154430 Amarres
154435 Contenedores y chasises
154440 Gabarras
154495 Otros
154499 Ajustes por inflación
1548 Flota y equipo aéreo
154805 Aviones
154810 Avionetas
154815 Helicópteros
154820 Turbinas y motores
154825 Manuales de entrenamiento personal técnico
154830 Equipos de vuelo
154895 Otros
154899 Ajustes por inflación
1552 Flota y equipo férreo
155205 Locomotoras
155210 Vagones
155215 Redes férreas
155295 Otros
155299 Ajustes por inflación
1556 Acueductos, plantas y redes
155605 Instalaciones para agua y energía
155610 Acueducto, acequias y canalizaciones
155615 Plantas de generación hidráulica
155620 Plantas de generación térmica
155625 Plantas de generación a gas
155628 Plantas de generación diesel, gasolina y petróleo
155630 Plantas de distribución
155635 Plantas de transmisión y subestaciones
155640 Oleoductos
155645 Gasoductos
155647 Poliductos
155650 Redes de distribución
155655 Plantas de tratamiento
155660 Redes de recolección de aguas negras
155665 Instalaciones y equipo de bombeo
155670 Redes de distribución de vapor
155675 Redes de aire
155680 Redes alimentación de gas
155682 Redes externas de telefonía
155685 Plantas deshidratadoras
155695 Otros
155699 Ajustes por inflación
1560 Armamento de vigilancia
156099 Ajustes por inflación
1562 Envases y empaques
156299 Ajustes por inflación
1564 Plantaciones agrícolas y forestales
156405 Cultivos en desarrollo
156410 Cultivos amortizables
156499 Ajustes por inflación
1568 Vías de comunicación
156805 Pavimentación y patios
156810 Vías
156815 Puentes
156820 Calles
156825 Aeródromos
156895 Otros
156899 Ajustes por inflación
1572 Minas y canteras
157205 Minas
157210 Canteras
157299 Ajustes por inflación
1576 Pozos artesianos
157699 Ajustes por inflación
1580 Yacimientos
158099 Ajustes por inflación
1584 Semovientes
158499 Ajustes por inflación
1588 Propiedades, planta y equipo en tránsito
158805 Maquinaria y equipo
158810 Equipo de oficina
158815 Equipo de computación y comunicación
158820 Equipo médico-científico
158825 Equipo de hoteles y restaurantes
158830 Flota y equipo de transporte
158835 Flota y equipo fluvial y/o marítimo
158840 Flota y equipo aéreo
158845 Flota y equipo férreo
158850 Plantas y redes
158855 Armamento de vigilancia
158860 Semovientes
158865 Envases y empaques
158899 Ajustes por inflación
1592 Depreciación acumulada
159205 Construcciones y edificaciones
159210 Maquinaria y equipo
159215 Equipo de oficina
159220 Equipo de computación y comunicación
159225 Equipo médico-científico
159230 Equipo de hoteles y restaurantes
159235 Flota y equipo de transporte
159240 Flota y equipo fluvial y/o marítimo
159245 Flota y equipo aéreo
159250 Flota y equipo férreo
159255 Acueductos, plantas y redes
159260 Armamento de vigilancia
159265 Envases y empaques
159299 Ajustes por inflación
1596 Depreciación diferida
159605 Exceso fiscal sobre la contable
159610 Defecto fiscal sobre la contable (CR)
159699 Ajustes por inflación
1597 Amortización acumulada
159705 Plantaciones agrícolas y forestales
159710 Vías de comunicación
159715 Semovientes
159799 Ajustes por inflación
1598 Agotamiento acumulado
159805 Minas y canteras
159815 Pozos artesianos
159820 Yacimientos
159899 Ajustes por inflación
1599 Provisiones
159904 Terrenos
159906 Materiales proyectos petroleros
159908 Construcciones en curso
159912 Maquinaria en montaje
159916 Construcciones y edificaciones
159920 Maquinaria y equipo
159924 Equipo de oficina
159928 Equipo de computación y comunicación
159932 Equipo médico-científico
159936 Equipo de hoteles y restaurantes
159940 Flota y equipo de transporte
159944 Flota y equipo fluvial y/o marítimo
159948 Flota y equipo aéreo
159952 Flota y equipo férreo
159956 Acueductos, plantas y redes
159960 Armamento de vigilancia
159962 Envases y empaques
159964 Plantaciones agrícolas y forestales
159968 Vías de comunicación
159972 Minas y canteras
159980 Pozos artesianos
159984 Yacimientos
159988 Semovientes
159992 Propiedades, planta y equipo en tránsito
16 Intangibles
1605 Crédito mercantil
160505 Formado o estimado
160510 Adquirido o comprado
160599 Ajustes por inflación
1610 Marcas
161005 Adquiridas
161010 Formadas
161099 Ajustes por inflación
1615 Patentes
161505 Adquiridas
161510 Formadas
161599 Ajustes por inflación
1620 Concesiones y franquicias
162005 Concesiones
162010 Franquicias
162099 Ajustes por inflación
1625 Derechos
162505 Derechos de autor
162510 Puesto de bolsa
162515 En fideicomisos inmobiliarios
162520 En fideicomisos de garantía
162525 En fideicomisos de administración
162530 De exhibición - películas
162535 En bienes recibidos en arrendamiento financiero (leasing)
162595 Otros
162599 Ajustes por inflación
1630 Know how
163099 Ajustes por inflación
1635 Licencias
163599 Ajustes por inflación
1698 Depreciación y/o amortización acumulada
169805 Crédito mercantil
169810 Marcas
169815 Patentes
169820 Concesiones y franquicias
169830 Derechos
169835 Know how
169840 Licencias
169899 Ajustes por inflación
1699 Provisiones
17 Diferidos
1705 Gastos pagados por anticipado
170505 Intereses
170510 Honorarios
170515 Comisiones
170520 Seguros y fianzas
170525 Arrendamientos
170530 Bodegajes
170535 Mantenimiento equipos
170540 Servicios
170545 Suscripciones
170595 Otros
1710 Cargos diferidos
171004 Organización y preoperativos
171008 Remodelaciones
171012 Estudios, investigaciones y proyectos
171016 Programas para computador (software)
171020 Útiles y papelería
171024 Mejoras a propiedades ajenas
171028 Contribuciones y afiliaciones
171032 Entrenamiento de personal
171036 Ferias y exposiciones
171040 Licencias
171044 Publicidad, propaganda y promoción
171048 Elementos de aseo y cafetería
171052 Moldes y troqueles
171056 Instrumental quirúrgico
171060 Dotación y suministro a trabajadores
171064 Elementos de ropería y lencería
171068 Loza y cristalería
171069 Platería
171070 Cubiertería
171076 Impuesto de renta diferido "débitos" por diferencias temporales
171080 Concursos y licitaciones
171095 Otros
171099 Ajustes por inflación
1715 Costos de exploración por amortizar
171505 Pozos secos
171510 Pozos no comerciales
171515 Otros costos de exploración
171599 Ajustes por inflación
1720 Costos de explotación y desarrollo
172005 Perforación y explotación
172010 Perforaciones campos en desarrollo
172015 Facilidades de producción
172020 Servicio a pozos
172099 Ajustes por inflación
1730 Cargos por corrección monetaria diferida
1798 Amortización acumulada
179805 Costos de exploración por amortizar
179810 Costos de explotación y desarrollo
179899 Ajustes por inflación
18 Otros activos
1805 Bienes de arte y cultura
180505 Obras de arte
180510 Bibliotecas
180595 Otros
180599 Ajustes por inflación
1895 Diversos
189505 Máquinas porteadoras
189510 Bienes entregados en comodato
189515 Amortización acumulada de bienes entregados en comodato (CR)
189520 Bienes recibidos en pago
189525 Derechos sucesorales
189530 Estampillas
189595 Otros
189599 Ajustes por inflación
1899 Provisiones
189905 Bienes de arte y cultura
189995 Diversos
19 Valorizaciones
1905 De inversiones
190505 Acciones
190510 Cuotas o partes de interés social
190515 Derechos fiduciarios
1910 De propiedades, planta y equipo
191004 Terrenos
191006 Materiales proyectos petroleros
191008 Construcciones y edificaciones
191012 Maquinaria y equipo
191016 Equipo de oficina
191020 Equipo de computación y comunicación
191024 Equipo médico-científico
191028 Equipo de hoteles y restaurantes
191032 Flota y equipo de transporte
191036 Flota y equipo fluvial y/o marítimo
191040 Flota y equipo aéreo
191044 Flota y equipo férreo
191048 Acueductos, plantas y redes
191052 Armamento de vigilancia
191056 Envases y empaques
191060 Plantaciones agrícolas y forestales
191064 Vías de comunicación
191068 Minas y canteras
191072 Pozos artesianos
191076 Yacimientos
191080 Semovientes
1995 De otros activos
199505 Bienes de arte y cultura
199510 Bienes entregados en comodato
199515 Bienes recibidos en pago
199520 Inventario de semovientes
2 Pasivo
21 Obligaciones financieras
2105 Bancos nacionales
210505 Sobregiros
210510 Pagarés
210515 Cartas de crédito
210520 Aceptaciones bancarias
2110 Bancos del exterior
211005 Sobregiros
211010 Pagarés
211015 Cartas de crédito
211020 Aceptaciones bancarias
2115 Corporaciones financieras
211505 Pagarés
211510 Aceptaciones financieras
211515 Cartas de crédito
211520 Contratos de arrendamiento financiero (leasing)
2120 Compañías de financiamiento comercial
212005 Pagarés
212010 Aceptaciones financieras
212020 Contratos de arrendamiento financiero (leasing)
2125 Corporaciones de ahorro y vivienda
212505 Sobregiros
212510 Pagarés
212515 Hipotecarias
2130 Entidades financieras del exterior
2135 Compromisos de recompra de inversiones negociadas
213505 Acciones
213510 Cuotas o partes de interés social
213515 Bonos
213520 Cédulas
213525 Certificados
213530 Papeles comerciales
213535 Títulos
213540 Aceptaciones bancarias o financieras
213595 Otros
2140 Compromisos de recompra de cartera negociada
2145 Obligaciones gubernamentales
214505 Gobierno Nacional
214510 Entidades oficiales
2195 Otras obligaciones
219505 Particulares
219510 Compañías vinculadas
219515 Casa matriz
219520 Socios o accionistas
219525 Fondos y cooperativas
219530 Directores
219595 Otras
22 Proveedores
2205 Nacionales
2210 Del exterior
2215 Cuentas corrientes comerciales
2220 Casa matriz
2225 Compañías vinculadas
23 Cuentas por pagar
2305 Cuentas corrientes comerciales
2310 A casa matriz
2315 A compañías vinculadas
2320 A contratistas
2330 Órdenes de compra por utilizar
2335 Costos y gastos por pagar
233505 Gastos financieros
233510 Gastos legales
233515 Libros, suscripciones, periódicos y revistas
233520 Comisiones
233525 Honorarios
233530 Servicios técnicos
233535 Servicios de mantenimiento
233540 Arrendamientos
233545 Transportes, fletes y acarreos
233550 Servicios públicos
233555 Seguros
233560 Gastos de viaje
233565 Gastos de representación y relaciones públicas
233570 Servicios aduaneros
233595 Otros
2340 Instalamentos por pagar
2345 Acreedores oficiales
2350 Regalías por pagar
2355 Deudas con accionistas o socios
235505 Accionistas
235510 Socios
2357 Deudas con directores
2360 Dividendos o participaciones por pagar
236005 Dividendos
236010 Participaciones
2365 Retención en la fuente
236505 Salarios y pagos laborales
236510 Dividendos y/o participaciones
236515 Honorarios
236520 Comisiones
236525 Servicios
236530 Arrendamientos
236535 Rendimientos financieros
236540 Compras
236545 Loterías, rifas, apuestas y similares
236550 Por pagos al exterior
236555 Por ingresos obtenidos en el exterior
236560 Enajenación propiedades planta y equipo, personas naturales
236565 Por impuesto de timbre
236570 Otras retenciones y patrimonio
236575 Autorretenciones
2367 Impuesto a las ventas retenido
2368 Impuesto de industria y comercio retenido
2370 Retenciones y aportes de nómina
237005 Aportes a entidades promotoras de salud, EPS
237006 Aportes a administradoras de riesgos profesionales, ARP
237010 Aportes al ICBF, SENA y cajas de compensación
237015 Aportes al FIC
237025 Embargos judiciales
237030 Libranzas
237035 Sindicatos
237040 Cooperativas
237045 Fondos
237095 Otros
2375 Cuotas por devolver
2380 Acreedores varios
238005 Depositarios
238010 Comisionistas de bolsas
238015 Sociedad administradora-Fondos de inversión
238020 Reintegros por pagar
238025 Fondo de perseverancia
238030 Fondos de cesantías y/o pensiones
238035 Donaciones asignadas por pagar
238095 Otros
24 Impuestos, gravámenes y tasas
2404 De renta y complementarios
240405 Vigencia fiscal corriente
240410 Vigencias fiscales anteriores
2408 Impuesto sobre las ventas por pagar
2412 De industria y comercio
241205 Vigencia fiscal corriente
241210 Vigencias fiscales anteriores
2416 A la propiedad raíz
2420 Derechos sobre instrumentos públicos
2424 De valorización
242405 Vigencia fiscal corriente
242410 Vigencias fiscales anteriores
2428 De turismo
2432 Tasa por utilización de puertos
2436 De vehículos
243605 Vigencia fiscal corriente
243610 Vigencias fiscales anteriores
2440 De espectáculos públicos
2444 De hidrocarburos y minas
244405 De hidrocarburos
244410 De minas
2448 Regalías e impuestos a la pequeña y mediana minería
2452 A las exportaciones cafeteras
2456 A las importaciones
2460 Cuotas de fomento
2464 De licores, cervezas y cigarrillos
246405 De licores
246410 De cervezas
246415 De cigarrillos
2468 Al sacrificio de ganado
2472 Al azar y juegos
2476 Gravámenes y regalías por utilización del suelo
2495 Otros
25 Obligaciones laborales
2505 Salarios por pagar
2510 Cesantías consolidadas
251005 Ley laboral anterior
251010 Ley 50 de 1990 y normas posteriores
2515 Intereses sobre cesantías
2520 Prima de servicios
2525 Vacaciones consolidadas
2530 Prestaciones extralegales
253005 Primas
253010 Auxilios
253015 Dotación y suministro a trabajadores
253020 Bonificaciones
253025 Seguros
253095 Otras
2532 Pensiones por pagar
2535 Cuotas partes pensiones de jubilación
2540 Indemnizaciones laborales
26 Pasivos estimados y provisiones
2605 Para costos y gastos
260505 Intereses
260510 Comisiones
260515 Honorarios
260520 Servicios técnicos
260525 Transportes, fletes y acarreos
260530 Gastos de viaje
260535 Servicios públicos
260540 Regalías
260545 Garantías
260550 Materiales y repuestos
260595 Otros
2610 Para obligaciones laborales
261005 Cesantías
261010 Intereses sobre cesantías
261015 Vacaciones
261020 Prima de servicios
261025 Prestaciones extralegales
261030 Viáticos
261095 Otras
2615 Para obligaciones fiscales
261505 De renta y complementarios
261510 De industria y comercio
261515 Tasa por utilización de puertos
261520 De vehículos
261525 De hidrocarburos y minas
261595 Otros
2620 Pensiones de jubilación
262005 Cálculo actuarial pensiones de jubilación
262010 Pensiones de jubilación por amortizar (DB)
2625 Para obras de urbanismo
262505 Acueducto y alcantarillado
262510 Energía eléctrica
262515 Teléfonos
262595 Otros
2630 Para mantenimiento y reparaciones
263005 Terrenos
263010 Construcciones y edificaciones
263015 Maquinaria y equipo
263020 Equipo de oficina
263025 Equipo de computación y comunicación
263030 Equipo médico-científico
263035 Equipo de hoteles y restaurantes
263040 Flota y equipo de transporte
263045 Flota y equipo fluvial y/o marítimo
263050 Flota y equipo aéreo
263055 Flota y equipo férreo
263060 Acueductos, plantas y redes
263065 Armamento de vigilancia
263070 Envases y empaques
263075 Plantaciones agrícolas y forestales
263080 Vías de comunicación
263085 Pozos artesianos
263095 Otros
2635 Para contingencias
263505 Multas y sanciones autoridades administrativas
263510 Intereses por multas y sanciones
263515 Reclamos
263520 Laborales
263525 Civiles
263530 Penales
263535 Administrativos
263540 Comerciales
263595 Otras
2640 Para obligaciones de garantías
2695 Provisiones diversas
269505 Para beneficencia
269510 Para comunicaciones
269515 Para pérdida en transporte
269520 Para operación
269525 Para protección de bienes agotables
269530 Para ajustes en redención de unidades
269535 Autoseguro
269540 Planes y programas de reforestación y electrificación
269595 Otras
27 Diferidos
2705 Ingresos recibidos por anticipado
270505 Intereses
270510 Comisiones
270515 Arrendamientos
270520 Honorarios
270525 Servicios técnicos
270530 De suscriptores
270535 Transportes, fletes y acarreos
270540 Mercancía en tránsito ya vendida
270545 Matrículas y pensiones
270550 Cuotas de administración
270595 Otros
2710 Abonos diferidos
271005 Reajuste del sistema
2715 Utilidad diferida en ventas a plazos
2720 Crédito por corrección monetaria diferida
2725 Impuestos diferidos
272505 Por depreciación flexible
272595 Diversos
272599 Ajustes por inflación
28 Otros pasivos
2805 Anticipos y avances recibidos
280505 De clientes
280510 Sobre contratos
280515 Para obras en proceso
280595 Otros
2810 Depósitos recibidos
281005 Para futura suscripción de acciones
281010 Para futuro pago de cuotas o derechos sociales
281015 Para garantía en la prestación de servicios
281020 Para garantía de contratos
281025 De licitaciones
281030 De manejo de bienes
281035 Fondo de reserva
281095 Otros
2815 Ingresos recibidos para terceros
281505 Valores recibidos para terceros
281510 Venta por cuenta de terceros
2820 Cuentas de operación conjunta
2825 Retenciones a terceros sobre contratos
282505 Cumplimiento obligaciones laborales
282510 Para estabilidad de obra
282515 Garantía cumplimiento de contratos
2830 Embargos judiciales
283005 Indemnizaciones
283010 Depósitos judiciales
2835 Acreedores del sistema
283505 Cuotas netas
283510 Grupos en formación
2840 Cuentas en participación
2895 Diversos
289505 Préstamos de productos
289510 Reembolso de costos exploratorios
289515 Programa de extensión agropecuaria
29 Bonos y papeles comerciales
2905 Bonos en circulación
2910 Bonos obligatoriamente convertibles en acciones
2915 Papeles comerciales
2920 Bonos pensionales
292005 Valor bonos pensionales
292010 Bonos pensionales por amortizar (DB)
292015 Intereses causados sobre bonos pensionales
2925 Títulos pensionales
292505 Valor títulos pensionales
292510 Títulos pensionales por amortizar (DB)
292515 Intereses causados sobre títulos pensionales
3 Patrimonio
31 Capital social
3105 Capital suscrito y pagado
310505 Capital autorizado
310510 Capital por suscribir (DB)
310515 Capital suscrito por cobrar (DB)
3115 Aportes sociales
311505 Cuotas o partes de interés social
311510 Aportes de socios-fondo mutuo de inversión
311515 Contribución de la empresa-fondo mutuo de inversión
311520 Suscripciones del público
3120 Capital asignado
3125 Inversión suplementaria al capital asignado
3130 Capital de personas naturales
3135 Aportes del Estado
3140 Fondo social
32 Superávit de capital
3205 Prima en colocación de acciones, cuotas o partes de interés social
320505 Prima en colocación de acciones
320510 Prima en colocación de acciones por cobrar (DB)
320515 Prima en colocación de cuotas o partes de interés social
3210 Donaciones
321005 En dinero
321010 En valores mobiliarios
321015 En bienes muebles
321020 En bienes inmuebles
321025 En intangibles
3215 Crédito mercantil
3220 Know how
3225 Superávit método de participación
322505 De acciones
322510 De cuotas o partes de interés social
33 Reservas
3305 Reservas obligatorias
330505 Reserva legal
330510 Reservas por disposiciones fiscales
330515 Reserva para readquisición de acciones
330516 Acciones propias readquiridas (DB)
330517 Reserva para readquisición de cuotas o partes de interés social
330518 Cuotas o partes de interés social propias readquiridas (DB)
330520 Reserva para extensión agropecuaria
330525 Reserva Ley 7ª de 1990
330530 Reserva para reposición de semovientes
330535 Reserva Ley 4ª de 1980
330595 Otras
3310 Reservas estatutarias
331005 Para futuras capitalizaciones
331010 Para reposición de activos
331015 Para futuros ensanches
331095 Otras
3315 Reservas ocasionales
331505 Para beneficencia y civismo
331510 Para futuras capitalizaciones
331515 Para futuros ensanches
331520 Para adquisición o reposición de propiedades, planta y equipo
331525 Para investigaciones y desarrollo
331530 Para fomento económico
331535 Para capital de trabajo
331540 Para estabilización de rendimientos
331545 A disposición del máximo órgano social
331595 Otras
34 Revalorización del patrimonio
3405 Ajustes por inflación
340505 De capital social
340510 De superávit de capital
340515 De reservas
340520 De resultados de ejercicios anteriores
340525 De activos en período improductivo
340530 De saneamiento fiscal
340535 De ajustes Decreto 3019 de 1989
340540 De dividendos y participaciones decretadas en acciones, cuotas o partes de interés social
340545 Superávit método de participación
3410 Saneamiento fiscal
3415 Ajustes por inflación Decreto 3019 de 1989
35 Dividendos o participaciones decretados en acciones, cuotas o partes de interés social
3505 Dividendos decretados en acciones
3510 Participaciones decretadas en cuotas o partes de interés social
36 Resultados del ejercicio
3605 Utilidad del ejercicio
3610 Pérdida del ejercicio
37 Resultados de ejercicios anteriores
3705 Utilidades acumuladas
3710 Pérdidas acumuladas
38 Superávit por valorizaciones
3805 De inversiones
380505 Acciones
380510 Cuotas o partes de interés social
380515 Derechos fiduciarios
3810 De propiedades, planta y equipo
381004 Terrenos
381006 Materiales proyectos petroleros
381008 Construcciones y edificaciones
381012 Maquinaria y equipo
381016 Equipo de oficina
381020 Equipo de computación y comunicación
381024 Equipo médico-científico
381028 Equipo de hoteles y restaurantes
381032 Flota y equipo de transporte
381036 Flota y equipo fluvial y/o marítimo
381040 Flota y equipo aéreo
381044 Flota y equipo férreo
381048 Acueductos, plantas y redes
381052 Armamento de vigilancia
381056 Envases y empaques
381060 Plantaciones agrícolas y forestales
381064 Vías de comunicación
381068 Minas y canteras
381072 Pozos artesianos
381076 Yacimientos
381080 Semovientes
3895 De otros activos
389505 Bienes de arte y cultura
389510 Bienes entregados en comodato
389515 Bienes recibidos en pago
389520 Inventario de semovientes
$puc$, E'\n') as t(linea)
     where t.linea <> ''
  ) l
on conflict (codigo) do nothing;
