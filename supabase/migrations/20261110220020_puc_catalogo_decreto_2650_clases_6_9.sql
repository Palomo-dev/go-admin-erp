-- Catálogo PUC comercial (Decreto 2650 de 1993), clases 6, 7, 8 y 9.
--
-- ESTADO: APLICADA el 2026-11-10 (registro 20261110211913). md5 del cuerpo aplicado: 6e518650…, el de este archivo con la línea ESTADO original.
-- Reversión: supabase/rollbacks/20261110220020_puc_catalogo_decreto_2650_clases_6_9_rollback.sql.
-- Fecha: 2026-11-10.
--
-- Continúa 20261110220000_puc_catalogo_decreto_2650.sql, que crea public.puc_catalogo y documenta
-- fuentes (https://puc.com.co/ y el texto oficial en
-- https://gestornormativo.creg.gov.co/gestor/entorno/docs/decreto_2650_1993.htm), cruce, ajustes
-- y cuentas sin subcuentas. Debe aplicarse después de ella.
-- Este archivo: 4 clases, 18 grupos, 45 cuentas, 355 subcuentas (422 filas).

insert into public.puc_catalogo (codigo, nombre, padre)
select l.codigo, l.nombre,
       case length(l.codigo) when 1 then null when 2 then left(l.codigo, 1)
                             when 4 then left(l.codigo, 2) else left(l.codigo, 4) end
  from (
    select substring(t.linea from '^([0-9]+) ') as codigo,
           substring(t.linea from '^[0-9]+ (.+)$') as nombre
      from regexp_split_to_table($puc$
6 Costos de ventas
61 Costo de ventas y de prestación de servicios
6105 Agricultura, ganadería, caza y silvicultura
610505 Cultivo de cereales
610510 Cultivos de hortalizas, legumbres y plantas ornamentales
610515 Cultivos de frutas, nueces y plantas aromáticas
610520 Cultivo de café
610525 Cultivo de flores
610530 Cultivo de caña de azúcar
610535 Cultivo de algodón y plantas para material textil
610540 Cultivo de banano
610545 Otros cultivos agrícolas
610550 Cría de ovejas, cabras, asnos, mulas y burdéganos
610555 Cría de ganado caballar y vacuno
610560 Producción avícola
610565 Cría de otros animales
610570 Servicios agrícolas y ganaderos
610575 Actividad de caza
610580 Actividad de silvicultura
610595 Actividades conexas
610599 Ajustes por inflación
6110 Pesca
611005 Actividad de pesca
611010 Explotación de criaderos de peces
611095 Actividades conexas
611099 Ajustes por inflación
6115 Explotación de minas y canteras
611505 Carbón
611510 Petróleo crudo
611512 Gas natural
611514 Servicios relacionados con extracción de petróleo y gas
611515 Minerales de hierro
611520 Minerales metalíferos no ferrosos
611525 Piedra, arena y arcilla
611527 Piedras preciosas
611528 Oro
611530 Otras minas y canteras
611532 Prestación de servicios sector minero
611595 Actividades conexas
611599 Ajustes por inflación
6120 Industrias manufactureras
612001 Producción y procesamiento de carnes y productos cárnicos
612002 Productos de pescado
612003 Productos de frutas, legumbres y hortalizas
612004 Elaboración de aceites y grasas
612005 Elaboración de productos lácteos
612006 Elaboración de productos de molinería
612007 Elaboración de almidones y derivados
612008 Elaboración de alimentos para animales
612009 Elaboración de productos para panadería
612010 Elaboración de azúcar y melazas
612011 Elaboración de cacao, chocolate y confitería
612012 Elaboración de pastas y productos farináceos
612013 Elaboración de productos de café
612014 Elaboración de otros productos alimenticios
612015 Elaboración de bebidas alcohólicas y alcohol etílico
612016 Elaboración de vinos
612017 Elaboración de bebidas malteadas y de malta
612018 Elaboración de bebidas no alcohólicas
612019 Elaboración de productos de tabaco
612020 Preparación e hilatura de fibras textiles y tejeduría
612021 Acabado de productos textiles
612022 Elaboración de artículos de materiales textiles
612023 Elaboración de tapices y alfombras
612024 Elaboración de cuerdas, cordeles, bramantes y redes
612025 Elaboración de otros productos textiles
612026 Elaboración de tejidos
612027 Elaboración de prendas de vestir
612028 Preparación, adobo y teñido de pieles
612029 Curtido, adobo o preparación de cuero
612030 Elaboración de maletas, bolsos y similares
612031 Elaboración de calzado
612032 Producción de madera, artículos de madera y corcho
612033 Elaboración de pasta y productos de madera, papel y cartón
612034 Ediciones y publicaciones
612035 Impresión
612036 Servicios relacionados con la edición y la impresión
612037 Reproducción de grabaciones
612038 Elaboración de productos de horno de coque
612039 Elaboración de productos de la refinación de petróleo
612040 Elaboración de sustancias químicas básicas
612041 Elaboración de abonos y compuestos de nitrógeno
612042 Elaboración de plástico y caucho sintético
612043 Elaboración de productos químicos de uso agropecuario
612044 Elaboración de pinturas, tintas y masillas
612045 Elaboración de productos farmacéuticos y botánicos
612046 Elaboración de jabones, detergentes y preparados de tocador
612047 Elaboración de otros productos químicos
612048 Elaboración de fibras
612049 Elaboración de otros productos de caucho
612050 Elaboración de productos de plástico
612051 Elaboración de vidrio y productos de vidrio
612052 Elaboración de productos de cerámica, loza, piedra, arcilla y porcelana
612053 Elaboración de cemento, cal y yeso
612054 Elaboración de artículos de hormigón, cemento y yeso
612055 Corte, tallado y acabado de la piedra
612056 Elaboración de otros productos minerales no metálicos
612057 Industrias básicas y fundición de hierro y acero
612058 Productos primarios de metales preciosos y de metales no ferrosos
612059 Fundición de metales no ferrosos
612060 Fabricación de productos metálicos para uso estructural
612061 Forja, prensado, estampado, laminado de metal y pulvimetalurgia
612062 Revestimiento de metales y obras de ingeniería mecánica
612063 Fabricación de artículos de ferretería
612064 Elaboración de otros productos de metal
612065 Fabricación de maquinaria y equipo
612066 Fabricación de equipos de elevación y manipulación
612067 Elaboración de aparatos de uso doméstico
612068 Elaboración de equipo de oficina
612069 Elaboración de pilas y baterías primarias
612070 Elaboración de equipo de iluminación
612071 Elaboración de otros tipos de equipo eléctrico
612072 Fabricación de equipos de radio, televisión y comunicaciones
612073 Fabricación de aparatos e instrumentos médicos
612074 Fabricación de instrumentos de medición y control
612075 Fabricación de instrumentos de óptica y equipo fotográfico
612076 Fabricación de relojes
612077 Fabricación de vehículos automotores
612078 Fabricación de carrocerías para automotores
612079 Fabricación de partes, piezas y accesorios para automotores
612080 Fabricación y reparación de buques y otras embarcaciones
612081 Fabricación de locomotoras y material rodante para ferrocarriles
612082 Fabricación de aeronaves
612083 Fabricación de motocicletas
612084 Fabricación de bicicletas y sillas de ruedas
612085 Fabricación de otros tipos de transporte
612086 Fabricación de muebles
612087 Fabricación de joyas y artículos conexos
612088 Fabricación de instrumentos de música
612089 Fabricación de artículos y equipo para deporte
612090 Fabricación de juegos y juguetes
612091 Reciclamiento de desperdicios
612095 Productos de otras industrias manufactureras
612099 Ajustes por inflación
6125 Suministro de electricidad, gas y agua
612505 Generación, captación y distribución de energía eléctrica
612510 Fabricación de gas y distribución de combustibles gaseosos
612515 Captación, depuración y distribución de agua
612595 Actividades conexas
612599 Ajustes por inflación
6130 Construcción
613005 Preparación de terrenos
613010 Construcción de edificios y obras de ingeniería civil
613015 Acondicionamiento de edificios
613020 Terminación de edificaciones
613025 Alquiler de equipo con operario
613095 Actividades conexas
613099 Ajustes por inflación
6135 Comercio al por mayor y al por menor
613502 Venta de vehículos automotores
613504 Mantenimiento, reparación y lavado de vehículos automotores
613506 Venta de partes, piezas y accesorios de vehículos automotores
613508 Venta de combustibles sólidos, líquidos, gaseosos
613510 Venta de lubricantes, aditivos, llantas y lujos para automotores
613512 Venta a cambio de retribución o por contrata
613514 Venta de insumos, materias primas agropecuarias y flores
613516 Venta de otros insumos y materias primas no agropecuarias
613518 Venta de animales vivos y cueros
613520 Venta de productos en almacenes no especializados
613522 Venta de productos agropecuarios
613524 Venta de productos textiles, de vestir, de cuero y calzado
613526 Venta de papel y cartón
613528 Venta de libros, revistas, elementos de papelería, útiles y textos escolares
613530 Venta de juegos, juguetes y artículos deportivos
613532 Venta de instrumentos quirúrgicos y ortopédicos
613534 Venta de artículos en relojerías y joyerías
613536 Venta de electrodomésticos y muebles
613538 Venta de productos de aseo, farmacéuticos, medicinales y artículos de tocador
613540 Venta de cubiertos, vajillas, cristalería, porcelanas, cerámicas y otros artículos de uso doméstico
613542 Venta de materiales de construcción, fontanería y calefacción
613544 Venta de pinturas y lacas
613546 Venta de productos de vidrios y marquetería
613548 Venta de herramientas y artículos de ferretería
613550 Venta de químicos
613552 Venta de productos intermedios, desperdicios y desechos
613554 Venta de maquinaria, equipo de oficina y programas de computador
613556 Venta de artículos en cacharrerías y misceláneas
613558 Venta de instrumentos musicales
613560 Venta de artículos en casas de empeño y prenderías
613562 Venta de equipo fotográfico
613564 Venta de equipo óptico y de precisión
613566 Venta de empaques
613568 Venta de equipo profesional y científico
613570 Venta de loterías, rifas, chance, apuestas y similares
613572 Reparación de efectos personales y electrodomésticos
613595 Venta de otros productos
613599 Ajustes por inflación
6140 Hoteles y restaurantes
614005 Hotelería
614010 Campamento y otros tipos de hospedaje
614015 Restaurantes
614020 Bares y cantinas
614095 Actividades conexas
614099 Ajustes por inflación
6145 Transporte, almacenamiento y comunicaciones
614505 Servicio de transporte por carretera
614510 Servicio de transporte por vía férrea
614515 Servicio de transporte por vía acuática
614520 Servicio de transporte por vía aérea
614525 Servicio de transporte por tuberías
614530 Manipulación de carga
614535 Almacenamiento y depósito
614540 Servicios complementarios para el transporte
614545 Agencias de viaje
614550 Otras agencias de transporte
614555 Servicio postal y de correo
614560 Servicio telefónico
614565 Servicio de telégrafo
614570 Servicio de transmisión de datos
614575 Servicio de radio y televisión por cable
614580 Transmisión de sonido e imágenes por contrato
614595 Actividades conexas
614599 Ajustes por inflación
6150 Actividad financiera
615005 De inversiones
615010 De servicio de bolsa
615099 Ajustes por inflación
6155 Actividades inmobiliarias, empresariales y de alquiler
615505 Arrendamientos de bienes inmuebles
615510 Inmobiliarias por retribución o contrata
615515 Alquiler equipo de transporte
615520 Alquiler maquinaria y equipo
615525 Alquiler de efectos personales y enseres domésticos
615530 Consultoría en equipo y programas de informática
615535 Procesamiento de datos
615540 Mantenimiento y reparación de maquinaria de oficina
615545 Investigaciones científicas y de desarrollo
615550 Actividades empresariales de consultoría
615555 Publicidad
615560 Dotación de personal
615565 Investigación y seguridad
615570 Limpieza de inmuebles
615575 Fotografía
615580 Envase y empaque
615585 Fotocopiado
615590 Mantenimiento y reparación de maquinaria y equipo
615595 Actividades conexas
615599 Ajustes por inflación
6160 Enseñanza
616005 Actividades relacionadas con la educación
616095 Actividades conexas
616099 Ajustes por inflación
6165 Servicios sociales y de salud
616505 Servicio hospitalario
616510 Servicio médico
616515 Servicio odontológico
616520 Servicio de laboratorio
616525 Actividades veterinarias
616530 Actividades de servicios sociales
616595 Actividades conexas
616599 Ajustes por inflación
6170 Otras actividades de servicios comunitarios, sociales y personales
617005 Eliminación de desperdicios y aguas residuales
617010 Actividades de asociación
617015 Producción y distribución de filmes y videocintas
617020 Exhibición de filmes y videocintas
617025 Actividad de radio y televisión
617030 Actividad teatral, musical y artística
617035 Grabación y producción de discos
617040 Entretenimiento y esparcimiento
617045 Agencias de noticias
617050 Lavanderías y similares
617055 Peluquerías y similares
617060 Servicios funerarios
617065 Zonas francas
617095 Actividades conexas
617099 Ajustes por inflación
62 Compras
6205 De mercancías
620599 Ajustes por inflación
6210 De materias primas
621099 Ajustes por inflación
6215 De materiales indirectos
621599 Ajustes por inflación
6220 Compra de energía
622099 Ajustes por inflación
6225 Devoluciones en compras (CR)
622599 Ajustes por inflación
7 Costos de producción o de operación
71 Materia prima
72 Mano de obra directa
73 Costos indirectos
74 Contratos de servicios
8 Cuentas de orden deudoras
81 Derechos contingentes
8105 Bienes y valores entregados en custodia
810505 Valores mobiliarios
810510 Bienes muebles
810599 Ajustes por inflación
8110 Bienes y valores entregados en garantía
811005 Valores mobiliarios
811010 Bienes muebles
811015 Bienes inmuebles
811020 Contratos de ganado en participación
811099 Ajustes por inflación
8115 Bienes y valores en poder de terceros
811505 En arrendamiento
811510 En préstamo
811515 En depósito
811520 En consignación
811599 Ajustes por inflación
8120 Litigios y/o demandas
812005 Ejecutivos
812010 Incumplimiento de contratos
8125 Promesas de compraventa
8195 Diversas
819505 Valores adquiridos por recibir
819595 Otras
819599 Ajustes por inflación
82 Deudoras fiscales
83 Deudoras de control
8305 Bienes recibidos en arrendamiento financiero
830505 Bienes muebles
830510 Bienes inmuebles
830599 Ajustes por inflación
8310 Títulos de inversión no colocados
831005 Acciones
831010 Bonos
831095 Otros
8315 Propiedades, planta y equipo totalmente depreciados, agotados y/o amortizados
831506 Materiales proyectos petroleros
831516 Construcciones y edificaciones
831520 Maquinaria y equipo
831524 Equipo de oficina
831528 Equipo de computación y comunicación
831532 Equipo médico-científico
831536 Equipo de hoteles y restaurantes
831540 Flota y equipo de transporte
831544 Flota y equipo fluvial y/o marítimo
831548 Flota y equipo aéreo
831552 Flota y equipo férreo
831556 Acueductos, plantas y redes
831560 Armamento de vigilancia
831562 Envases y empaques
831564 Plantaciones agrícolas y forestales
831568 Vías de comunicación
831572 Minas y canteras
831576 Pozos artesianos
831580 Yacimientos
831584 Semovientes
831599 Ajustes por inflación
8320 Créditos a favor no utilizados
832005 País
832010 Exterior
8325 Activos castigados
832505 Inversiones
832510 Deudores
832595 Otros activos
8330 Títulos de inversión amortizados
833005 Bonos
833095 Otros
8335 Capitalización por revalorización de patrimonio
8395 Otras cuentas deudoras de control
839505 Cheques posfechados
839510 Certificados de depósito a término
839515 Cheques devueltos
839520 Bienes y valores en fideicomiso
839525 Intereses sobre deudas vencidas
839595 Diversas
839599 Ajustes por inflación
8399 Ajustes por inflación activos
839905 Inversiones
839910 Inventarios
839915 Propiedades, planta y equipo
839920 Intangibles
839925 Cargos diferidos
839995 Otros activos
84 Derechos contingentes por contra (CR)
85 Deudoras fiscales por contra (CR)
86 Deudoras de control por contra (CR)
9 Cuentas de orden acreedoras
91 Responsabilidades contingentes
9105 Bienes y valores recibidos en custodia
910505 Valores mobiliarios
910510 Bienes muebles
910599 Ajustes por inflación
9110 Bienes y valores recibidos en garantía
911005 Valores mobiliarios
911010 Bienes muebles
911015 Bienes inmuebles
911020 Contratos de ganado en participación
911099 Ajustes por inflación
9115 Bienes y valores recibidos de terceros
911505 En arrendamiento
911510 En préstamo
911515 En depósito
911520 En consignación
911525 En comodato
911599 Ajustes por inflación
9120 Litigios y/o demandas
912005 Laborales
912010 Civiles
912015 Administrativos o arbitrales
912020 Tributarios
9125 Promesas de compraventa
9130 Contratos de administración delegada
9135 Cuentas en participación
9195 Otras responsabilidades contingentes
92 Acreedoras fiscales
93 Acreedoras de control
9305 Contratos de arrendamiento financiero
930505 Bienes muebles
930510 Bienes inmuebles
9395 Otras cuentas de orden acreedoras de control
939505 Documentos por cobrar descontados
939510 Convenios de pago
939515 Contratos de construcciones e instalaciones por ejecutar
939520 Pedidos colocados
939525 Adjudicaciones pendientes de legalizar
939530 Reserva artículo 3º Ley 4ª de 1980
939535 Reserva costo reposición semovientes
939595 Diversas
939599 Ajustes por inflación
9399 Ajustes por inflación patrimonio
939905 Capital social
939910 Superávit de capital
939915 Reservas
939925 Dividendos o participaciones decretadas en acciones, cuotas o partes de interés social
939930 Resultados de ejercicios anteriores
94 Responsabilidades contingentes por contra (DB)
95 Acreedoras fiscales por contra (DB)
96 Acreedoras de control por contra (DB)
$puc$, E'\n') as t(linea)
     where t.linea <> ''
  ) l
on conflict (codigo) do nothing;
