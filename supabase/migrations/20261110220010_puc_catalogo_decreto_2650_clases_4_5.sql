-- Catálogo PUC comercial (Decreto 2650 de 1993), clases 4 y 5.
--
-- ESTADO: APLICADA el 2026-11-10 (registro 20261110211821). md5 del cuerpo aplicado: eb443412…, el de este archivo con la línea ESTADO original.
-- Reversión: supabase/rollbacks/20261110220010_puc_catalogo_decreto_2650_clases_4_5_rollback.sql.
-- Fecha: 2026-11-10.
--
-- Continúa 20261110220000_puc_catalogo_decreto_2650.sql, que crea public.puc_catalogo y documenta
-- fuentes (https://puc.com.co/ y el texto oficial en
-- https://gestornormativo.creg.gov.co/gestor/entorno/docs/decreto_2650_1993.htm), cruce, ajustes
-- y cuentas sin subcuentas. Debe aplicarse después de ella.
-- Este archivo: 2 clases, 8 grupos, 72 cuentas, 879 subcuentas (961 filas).

insert into public.puc_catalogo (codigo, nombre, padre)
select l.codigo, l.nombre,
       case length(l.codigo) when 1 then null when 2 then left(l.codigo, 1)
                             when 4 then left(l.codigo, 2) else left(l.codigo, 4) end
  from (
    select substring(t.linea from '^([0-9]+) ') as codigo,
           substring(t.linea from '^[0-9]+ (.+)$') as nombre
      from regexp_split_to_table($puc$
4 Ingresos
41 Operacionales
4105 Agricultura, ganadería, caza y silvicultura
410505 Cultivo de cereales
410510 Cultivos de hortalizas, legumbres y plantas ornamentales
410515 Cultivos de frutas, nueces y plantas aromáticas
410520 Cultivo de café
410525 Cultivo de flores
410530 Cultivo de caña de azúcar
410535 Cultivo de algodón y plantas para material textil
410540 Cultivo de banano
410545 Otros cultivos agrícolas
410550 Cría de ovejas, cabras, asnos, mulas y burdéganos
410555 Cría de ganado caballar y vacuno
410560 Producción avícola
410565 Cría de otros animales
410570 Servicios agrícolas y ganaderos
410575 Actividad de caza
410580 Actividad de silvicultura
410595 Actividades conexas
410599 Ajustes por inflación
4110 Pesca
411005 Actividad de pesca
411010 Explotación de criaderos de peces
411095 Actividades conexas
411099 Ajustes por inflación
4115 Explotación de minas y canteras
411505 Carbón
411510 Petróleo crudo
411512 Gas natural
411514 Servicios relacionados con extracción de petróleo y gas
411515 Minerales de hierro
411520 Minerales metalíferos no ferrosos
411525 Piedra, arena y arcilla
411527 Piedras preciosas
411528 Oro
411530 Otras minas y canteras
411532 Prestación de servicios sector minero
411595 Actividades conexas
411599 Ajustes por inflación
4120 Industrias manufactureras
412001 Producción y procesamiento de carnes y productos cárnicos
412002 Productos de pescado
412003 Productos de frutas, legumbres y hortalizas
412004 Elaboración de aceites y grasas
412005 Elaboración de productos lácteos
412006 Elaboración de productos de molinería
412007 Elaboración de almidones y derivados
412008 Elaboración de alimentos para animales
412009 Elaboración de productos para panadería
412010 Elaboración de azúcar y melazas
412011 Elaboración de cacao, chocolate y confitería
412012 Elaboración de pastas y productos farináceos
412013 Elaboración de productos de café
412014 Elaboración de otros productos alimenticios
412015 Elaboración de bebidas alcohólicas y alcohol etílico
412016 Elaboración de vinos
412017 Elaboración de bebidas malteadas y de malta
412018 Elaboración de bebidas no alcohólicas
412019 Elaboración de productos de tabaco
412020 Preparación e hilatura de fibras textiles y tejeduría
412021 Acabado de productos textiles
412022 Elaboración de artículos de materiales textiles
412023 Elaboración de tapices y alfombras
412024 Elaboración de cuerdas, cordeles, bramantes y redes
412025 Elaboración de otros productos textiles
412026 Elaboración de tejidos
412027 Elaboración de prendas de vestir
412028 Preparación, adobo y teñido de pieles
412029 Curtido, adobo o preparación de cuero
412030 Elaboración de maletas, bolsos y similares
412031 Elaboración de calzado
412032 Producción de madera, artículos de madera y corcho
412033 Elaboración de pasta y productos de madera, papel y cartón
412034 Ediciones y publicaciones
412035 Impresión
412036 Servicios relacionados con la edición y la impresión
412037 Reproducción de grabaciones
412038 Elaboración de productos de horno de coque
412039 Elaboración de productos de la refinación de petróleo
412040 Elaboración de sustancias químicas básicas
412041 Elaboración de abonos y compuestos de nitrógeno
412042 Elaboración de plástico y caucho sintético
412043 Elaboración de productos químicos de uso agropecuario
412044 Elaboración de pinturas, tintas y masillas
412045 Elaboración de productos farmacéuticos y botánicos
412046 Elaboración de jabones, detergentes y preparados de tocador
412047 Elaboración de otros productos químicos
412048 Elaboración de fibras
412049 Elaboración de otros productos de caucho
412050 Elaboración de productos de plástico
412051 Elaboración de vidrio y productos de vidrio
412052 Elaboración de productos de cerámica, loza, piedra, arcilla y porcelana
412053 Elaboración de cemento, cal y yeso
412054 Elaboración de artículos de hormigón, cemento y yeso
412055 Corte, tallado y acabado de la piedra
412056 Elaboración de otros productos minerales no metálicos
412057 Industrias básicas y fundición de hierro y acero
412058 Productos primarios de metales preciosos y de metales no ferrosos
412059 Fundición de metales no ferrosos
412060 Fabricación de productos metálicos para uso estructural
412061 Forja, prensado, estampado, laminado de metal y pulvimetalurgia
412062 Revestimiento de metales y obras de ingeniería mecánica
412063 Fabricación de artículos de ferretería
412064 Elaboración de otros productos de metal
412065 Fabricación de maquinaria y equipo
412066 Fabricación de equipos de elevación y manipulación
412067 Elaboración de aparatos de uso doméstico
412068 Elaboración de equipo de oficina
412069 Elaboración de pilas y baterías primarias
412070 Elaboración de equipo de iluminación
412071 Elaboración de otros tipos de equipo eléctrico
412072 Fabricación de equipos de radio, televisión y comunicaciones
412073 Fabricación de aparatos e instrumentos médicos
412074 Fabricación de instrumentos de medición y control
412075 Fabricación de instrumentos de óptica y equipo fotográfico
412076 Fabricación de relojes
412077 Fabricación de vehículos automotores
412078 Fabricación de carrocerías para automotores
412079 Fabricación de partes piezas y accesorios para automotores
412080 Fabricación y reparación de buques y otras embarcaciones
412081 Fabricación de locomotoras y material rodante para ferrocarriles
412082 Fabricación de aeronaves
412083 Fabricación de motocicletas
412084 Fabricación de bicicletas y sillas de ruedas
412085 Fabricación de otros tipos de transporte
412086 Fabricación de muebles
412087 Fabricación de joyas y artículos conexos
412088 Fabricación de instrumentos de música
412089 Fabricación de artículos y equipo para deporte
412090 Fabricación de juegos y juguetes
412091 Reciclamiento de desperdicios
412095 Productos de otras industrias manufactureras
412099 Ajustes por inflación
4125 Suministro de electricidad, gas y agua
412505 Generación, captación y distribución de energía eléctrica
412510 Fabricación de gas y distribución de combustibles gaseosos
412515 Captación, depuración y distribución de agua
412595 Actividades conexas
412599 Ajustes por inflación
4130 Construcción
413005 Preparación de terrenos
413010 Construcción de edificios y obras de ingeniería civil
413015 Acondicionamiento de edificios
413020 Terminación de edificaciones
413025 Alquiler de equipo con operarios
413095 Actividades conexas
413099 Ajustes por inflación
4135 Comercio al por mayor y al por menor
413502 Venta de vehículos automotores
413504 Mantenimiento, reparación y lavado de vehículos automotores
413506 Venta de partes, piezas y accesorios de vehículos automotores
413508 Venta de combustibles sólidos, líquidos, gaseosos
413510 Venta de lubricantes, aditivos, llantas y lujos para automotores
413512 Venta a cambio de retribución o por contrata
413514 Venta de insumos, materias primas agropecuarias y flores
413516 Venta de otros insumos y materias primas no agropecuarias
413518 Venta de animales vivos y cueros
413520 Venta de productos en almacenes no especializados
413522 Venta de productos agropecuarios
413524 Venta de productos textiles, de vestir, de cuero y calzado
413526 Venta de papel y cartón
413528 Venta de libros, revistas, elementos de papelería, útiles y textos escolares
413530 Venta de juegos, juguetes y artículos deportivos
413532 Venta de instrumentos quirúrgicos y ortopédicos
413534 Venta de artículos en relojerías y joyerías
413536 Venta de electrodomésticos y muebles
413538 Venta de productos de aseo, farmacéuticos, medicinales, y artículos de tocador
413540 Venta de cubiertos, vajillas, cristalería, porcelanas, cerámicas y otros artículos de uso doméstico
413542 Venta de materiales de construcción, fontanería y calefacción
413544 Venta de pinturas y lacas
413546 Venta de productos de vidrios y marquetería
413548 Venta de herramientas y artículos de ferretería
413550 Venta de químicos
413552 Venta de productos intermedios, desperdicios y desechos
413554 Venta de maquinaria, equipo de oficina y programas de computador
413556 Venta de artículos en cacharrerías y misceláneas
413558 Venta de instrumentos musicales
413560 Venta de artículos en casas de empeño y prenderías
413562 Venta de equipo fotográfico
413564 Venta de equipo óptico y de precisión
413566 Venta de empaques
413568 Venta de equipo profesional y científico
413570 Venta de loterías, rifas, chance, apuestas y similares
413572 Reparación de efectos personales y electrodomésticos
413595 Venta de otros productos
413599 Ajustes por inflación
4140 Hoteles y restaurantes
414005 Hotelería
414010 Campamento y otros tipos de hospedaje
414015 Restaurantes
414020 Bares y cantinas
414095 Actividades conexas
414099 Ajustes por inflación
4145 Transporte, almacenamiento y comunicaciones
414505 Servicio de transporte por carretera
414510 Servicio de transporte por vía férrea
414515 Servicio de transporte por vía acuática
414520 Servicio de transporte por vía aérea
414525 Servicio de transporte por tuberías
414530 Manipulación de carga
414535 Almacenamiento y depósito
414540 Servicios complementarios para el transporte
414545 Agencias de viaje
414550 Otras agencias de transporte
414555 Servicio postal y de correo
414560 Servicio telefónico
414565 Servicio de telégrafo
414570 Servicio de transmisión de datos
414575 Servicio de radio y televisión por cable
414580 Transmisión de sonido e imágenes por contrato
414595 Actividades conexas
414599 Ajustes por inflación
4150 Actividad financiera
415005 Venta de inversiones
415010 Dividendos de sociedades anónimas y/o asimiladas
415015 Participaciones de sociedades limitadas y/o asimiladas
415020 Intereses
415025 Reajuste monetario-UPAC (hoy UVR)
415030 Comisiones
415035 Operaciones de descuento
415040 Cuotas de inscripción-consorcios
415045 Cuotas de administración-consorcios
415050 Reajuste del sistema-consorcios
415055 Eliminación de suscriptores-consorcios
415060 Cuotas de ingreso o retiro-sociedad administradora
415065 Servicios a comisionistas
415070 Inscripciones y cuotas
415075 Recuperación de garantías
415080 Ingresos método de participación
415095 Actividades conexas
415099 Ajustes por inflación
4155 Actividades inmobiliarias, empresariales y de alquiler
415505 Arrendamientos de bienes inmuebles
415510 Inmobiliarias por retribución o contrata
415515 Alquiler equipo de transporte
415520 Alquiler maquinaria y equipo
415525 Alquiler de efectos personales y enseres domésticos
415530 Consultoría en equipo y programas de informática
415535 Procesamiento de datos
415540 Mantenimiento y reparación de maquinaria de oficina
415545 Investigaciones científicas y de desarrollo
415550 Actividades empresariales de consultoría
415555 Publicidad
415560 Dotación de personal
415565 Investigación y seguridad
415570 Limpieza de inmuebles
415575 Fotografía
415580 Envase y empaque
415585 Fotocopiado
415590 Mantenimiento y reparación de maquinaria y equipo
415595 Actividades conexas
415599 Ajustes por inflación
4160 Enseñanza
416005 Actividades relacionadas con la educación
416095 Actividades conexas
416099 Ajustes por inflación
4165 Servicios sociales y de salud
416505 Servicio hospitalario
416510 Servicio médico
416515 Servicio odontológico
416520 Servicio de laboratorio
416525 Actividades veterinarias
416530 Actividades de servicios sociales
416595 Actividades conexas
416599 Ajustes por inflación
4170 Otras actividades de servicios comunitarios, sociales y personales
417005 Eliminación de desperdicios y aguas residuales
417010 Actividades de asociación
417015 Producción y distribución de filmes y videocintas
417020 Exhibición de filmes y videocintas
417025 Actividad de radio y televisión
417030 Actividad teatral, musical y artística
417035 Grabación y producción de discos
417040 Entretenimiento y esparcimiento
417045 Agencias de noticias
417050 Lavanderías y similares
417055 Peluquerías y similares
417060 Servicios funerarios
417065 Zonas francas
417095 Actividades conexas
417099 Ajustes por inflación
4175 Devoluciones en ventas (DB)
417599 Ajustes por inflación
42 No operacionales
4205 Otras ventas
420505 Materia prima
420510 Material de desecho
420515 Materiales varios
420520 Productos de diversificación
420525 Excedentes de exportación
420530 Envases y empaques
420535 Productos agrícolas
420540 De propaganda
420545 Productos en remate
420550 Combustibles y lubricantes
420599 Ajustes por inflación
4210 Financieros
421005 Intereses
421010 Reajuste monetario-UPAC (hoy UVR)
421015 Descuentos amortizados
421020 Diferencia en cambio
421025 Financiación vehículos
421030 Financiación sistemas de viajes
421035 Aceptaciones bancarias
421040 Descuentos comerciales condicionados
421045 Descuentos bancarios
421050 Comisiones cheques de otras plazas
421055 Multas y recargos
421060 Sanciones cheques devueltos
421095 Otros
421099 Ajustes por inflación
4215 Dividendos y participaciones
421505 De sociedades anónimas y/o asimiladas
421510 De sociedades limitadas y/o asimiladas
421599 Ajustes por inflación
4218 Ingresos método de participación
421805 De sociedades anónimas y/o asimiladas
421810 De sociedades limitadas y/o asimiladas
4220 Arrendamientos
422005 Terrenos
422010 Construcciones y edificios
422015 Maquinaria y equipo
422020 Equipo de oficina
422025 Equipo de computación y comunicación
422030 Equipo médico-científico
422035 Equipo de hoteles y restaurantes
422040 Flota y equipo de transporte
422045 Flota y equipo fluvial y/o marítimo
422050 Flota y equipo aéreo
422055 Flota y equipo férreo
422060 Acueductos, plantas y redes
422062 Envases y empaques
422065 Plantaciones agrícolas y forestales
422070 Aeródromos
422075 Semovientes
422099 Ajustes por inflación
4225 Comisiones
422505 Sobre inversiones
422510 De concesionarios
422515 De actividades financieras
422520 Por venta de servicios de taller
422525 Por venta de seguros
422530 Por ingresos para terceros
422535 Por distribución de películas
422540 Derechos de autor
422545 Derechos de programación
422599 Ajustes por inflación
4230 Honorarios
423005 Asesorías
423010 Asistencia técnica
423015 Administración de vinculadas
423099 Ajustes por inflación
4235 Servicios
423505 De báscula
423510 De transporte
423515 De prensa
423520 Administrativos
423525 Técnicos
423530 De computación
423535 De telefax
423540 Taller de vehículos
423545 De recepción de aeronaves
423550 De transporte programa gas natural
423555 Por contratos
423560 De trilla
423565 De mantenimiento
423570 Al personal
423575 De casino
423580 Fletes
423585 Entre compañías
423595 Otros
423599 Ajustes por inflación
4240 Utilidad en venta de inversiones
424005 Acciones
424010 Cuotas o partes de interés social
424015 Bonos
424020 Cédulas
424025 Certificados
424030 Papeles comerciales
424035 Títulos
424045 Derechos fiduciarios
424050 Obligatorias
424095 Otras
424099 Ajustes por inflación
4245 Utilidad en venta de propiedades, planta y equipo
424504 Terrenos
424506 Materiales industria petrolera
424508 Construcciones en curso
424512 Maquinaria en montaje
424516 Construcciones y edificaciones
424520 Maquinaria y equipo
424524 Equipo de oficina
424528 Equipo de computación y comunicación
424532 Equipo médico-científico
424536 Equipo de hoteles y restaurantes
424540 Flota y equipo de transporte
424544 Flota y equipo fluvial y/o marítimo
424548 Flota y equipo aéreo
424552 Flota y equipo férreo
424556 Acueductos, plantas y redes
424560 Armamento de vigilancia
424562 Envases y empaques
424564 Plantaciones agrícolas y forestales
424568 Vías de comunicación
424572 Minas y Canteras
424580 Pozos artesianos
424584 Yacimientos
424588 Semovientes
424599 Ajustes por inflación
4248 Utilidad en venta de otros bienes
424805 Intangibles
424810 Otros activos
424899 Ajustes por inflación
4250 Recuperaciones
425005 Deudas malas
425010 Seguros
425015 Reclamos
425020 Reintegro por personal en comisión
425025 Reintegro garantías
425030 Descuentos concedidos
425035 De provisiones
425040 Gastos bancarios
425045 De depreciación
425050 Reintegro de otros costos y gastos
425099 Ajustes por inflación
4255 Indemnizaciones
425505 Por siniestro
425510 Por suministros
425515 Lucro cesante compañías de seguros
425520 Daño emergente compañías de seguros
425525 Por pérdida de mercancía
425530 Por incumplimiento de contratos
425535 De terceros
425540 Por incapacidades ISS
425595 Otras
425599 Ajustes por inflación
4260 Participaciones en concesiones
426099 Ajustes por inflación
4265 Ingresos de ejercicios anteriores
426599 Ajustes por inflación
4275 Devoluciones en otras ventas (DB)
427599 Ajustes por inflación
4295 Diversos
429503 CERT
429505 Aprovechamientos
429507 Auxilios
429509 Subvenciones
429511 Ingresos por investigación y desarrollo
429513 Por trabajos ejecutados
429515 Regalías
429517 Derivados de las exportaciones
429519 Otros ingresos de explotación
429521 De la actividad ganadera
429525 Derechos y licitaciones
429530 Ingresos por elementos perdidos
429533 Multas y recargos
429535 Preavisos descontados
429537 Reclamos
429540 Recobro de daños
429543 Premios
429545 Bonificaciones
429547 Productos descontados
429549 Reconocimientos ISS
429551 Excedentes
429553 Sobrantes de caja
429555 Sobrantes en liquidación fletes
429557 Subsidios estatales
429559 Capacitación distribuidores
429561 De escrituración
429563 Registro promesas de venta
429567 Útiles, papelería y fotocopias
429571 Resultados, matrículas y traspasos
429573 Decoraciones
429575 Manejo de carga
429579 Historia clínica
429581 Ajuste al peso
429583 Llamadas telefónicas
429595 Otros
429599 Ajustes por inflación
47 Ajustes por inflación
4705 Corrección monetaria
470505 Inversiones (CR)
470510 Inventarios (CR)
470515 Propiedades, planta y equipo (CR)
470520 Intangibles (CR)
470525 Activos diferidos
470530 Otros activos (CR)
470535 Pasivos sujetos de ajuste
470540 Patrimonio
470545 Depreciación acumulada (DB)
470550 Depreciación diferida (CR)
470555 Agotamiento acumulado (DB)
470560 Amortización acumulada (DB)
470565 Ingresos operacionales (DB)
470568 Devoluciones en ventas (CR)
470570 Ingresos no operacionales (DB)
470575 Gastos operacionales de administración (CR)
470580 Gastos operacionales de ventas (CR)
470585 Gastos no operacionales (CR)
470590 Compras (CR)
470591 Devoluciones en compras (DB)
470592 Costo de ventas (CR)
470594 Costos de producción o de operación (CR)
5 Gastos
51 Operacionales de administración
5105 Gastos de personal
510503 Salario integral
510506 Sueldos
510512 Jornales
510515 Horas extras y recargos
510518 Comisiones
510521 Viáticos
510524 Incapacidades
510527 Auxilio de transporte
510530 Cesantías
510533 Intereses sobre cesantías
510536 Prima de servicios
510539 Vacaciones
510542 Primas extralegales
510545 Auxilios
510548 Bonificaciones
510551 Dotación y suministro a trabajadores
510554 Seguros
510557 Cuotas partes pensiones de jubilación
510558 Amortización cálculo actuarial pensiones de jubilación
510559 Pensiones de jubilación
510560 Indemnizaciones laborales
510561 Amortización bonos pensionales
510562 Amortización títulos pensionales
510563 Capacitación al personal
510566 Gastos deportivos y de recreación
510568 Aportes a administradoras de riesgos profesionales, ARP
510569 Aportes a entidades promotoras de salud, EPS
510570 Aportes a fondos de pensiones y/o cesantías
510572 Aportes cajas de compensación familiar
510575 Aportes ICBF
510578 SENA
510581 Aportes sindicales
510584 Gastos médicos y drogas
510595 Otros
510599 Ajustes por inflación
5110 Honorarios
511005 Junta directiva
511010 Revisoría fiscal
511015 Auditoría externa
511020 Avalúos
511025 Asesoría jurídica
511030 Asesoría financiera
511035 Asesoría técnica
511095 Otros
511099 Ajustes por inflación
5115 Impuestos
511505 Industria y comercio
511510 De timbres
511515 A la propiedad raíz
511520 Derechos sobre instrumentos públicos
511525 De valorización
511530 De turismo
511535 Tasa por utilización de puertos
511540 De vehículos
511545 De espectáculos públicos
511550 Cuotas de fomento
511570 IVA descontable
511595 Otros
511599 Ajustes por inflación
5120 Arrendamientos
512005 Terrenos
512010 Construcciones y edificaciones
512015 Maquinaria y equipo
512020 Equipo de oficina
512025 Equipo de computación y comunicación
512030 Equipo médico-científico
512035 Equipo de hoteles y restaurantes
512040 Flota y equipo de transporte
512045 Flota y equipo fluvial y/o marítimo
512050 Flota y equipo aéreo
512055 Flota y equipo férreo
512060 Acueductos, plantas y redes
512065 Aeródromos
512070 Semovientes
512095 Otros
512099 Ajustes por inflación
5125 Contribuciones y afiliaciones
512505 Contribuciones
512510 Afiliaciones y sostenimiento
512599 Ajustes por inflación
5130 Seguros
513005 Manejo
513010 Cumplimiento
513015 Corriente débil
513020 Vida colectiva
513025 Incendio
513030 Terremoto
513035 Sustracción y hurto
513040 Flota y equipo de transporte
513045 Flota y equipo fluvial y/o marítimo
513050 Flota y equipo aéreo
513055 Flota y equipo férreo
513060 Responsabilidad civil y extracontractual
513065 Vuelo
513070 Rotura de maquinaria
513075 Obligatorio accidente de tránsito
513080 Lucro cesante
513085 Transporte de mercancía
513095 Otros
513099 Ajustes por inflación
5135 Servicios
513505 Aseo y vigilancia
513510 Temporales
513515 Asistencia técnica
513520 Procesamiento electrónico de datos
513525 Acueducto y alcantarillado
513530 Energía eléctrica
513535 Teléfono
513540 Correo, portes y telegramas
513545 Fax y télex
513550 Transporte, fletes y acarreos
513555 Gas
513595 Otros
513599 Ajustes por inflación
5140 Gastos legales
514005 Notariales
514010 Registro mercantil
514015 Trámites y licencias
514020 Aduaneros
514025 Consulares
514095 Otros
514099 Ajustes por inflación
5145 Mantenimiento y reparaciones
514505 Terrenos
514510 Construcciones y edificaciones
514515 Maquinaria y equipo
514520 Equipo de oficina
514525 Equipo de computación y comunicación
514530 Equipo médico-científico
514535 Equipo de hoteles y restaurantes
514540 Flota y equipo de transporte
514545 Flota y equipo fluvial y/o marítimo
514550 Flota y equipo aéreo
514555 Flota y equipo férreo
514560 Acueductos, plantas y redes
514565 Armamento de vigilancia
514570 Vías de comunicación
514599 Ajustes por inflación
5150 Adecuación e instalación
515005 Instalaciones eléctricas
515010 Arreglos ornamentales
515015 Reparaciones locativas
515095 Otros
515099 Ajustes por inflación
5155 Gastos de viaje
515505 Alojamiento y manutención
515510 Pasajes fluviales y/o marítimos
515515 Pasajes aéreos
515520 Pasajes terrestres
515525 Pasajes férreos
515595 Otros
515599 Ajustes por inflación
5160 Depreciaciones
516005 Construcciones y edificaciones
516010 Maquinaria y equipo
516015 Equipo de oficina
516020 Equipo de computación y comunicación
516025 Equipo médico-científico
516030 Equipo de hoteles y restaurantes
516035 Flota y equipo de transporte
516040 Flota y equipo fluvial y/o marítimo
516045 Flota y equipo aéreo
516050 Flota y equipo férreo
516055 Acueductos, plantas y redes
516060 Armamento de vigilancia
516099 Ajustes por inflación
5165 Amortizaciones
516505 Vías de comunicación
516510 Intangibles
516515 Cargos diferidos
516595 Otras
516599 Ajustes por inflación
5195 Diversos
519505 Comisiones
519510 Libros, suscripciones, periódicos y revistas
519515 Música ambiental
519520 Gastos de representación y relaciones públicas
519525 Elementos de aseo y cafetería
519530 Útiles, papelería y fotocopias
519535 Combustibles y lubricantes
519540 Envases y empaques
519545 Taxis y buses
519550 Estampillas
519555 Microfilmación
519560 Casino y restaurante
519565 Parqueaderos
519570 Indemnización por daños a terceros
519575 Pólvora y similares
519595 Otros
519599 Ajustes por inflación
5199 Provisiones
519905 Inversiones
519910 Deudores
519915 Propiedades, planta y equipo
519995 Otros activos
519999 Ajustes por inflación
52 Operacionales de ventas
5205 Gastos de personal
520503 Salario integral
520506 Sueldos
520512 Jornales
520515 Horas extras y recargos
520518 Comisiones
520521 Viáticos
520524 Incapacidades
520527 Auxilio de transporte
520530 Cesantías
520533 Intereses sobre cesantías
520536 Prima de servicios
520539 Vacaciones
520542 Primas extralegales
520545 Auxilios
520548 Bonificaciones
520551 Dotación y suministro a trabajadores
520554 Seguros
520557 Cuotas partes pensiones de jubilación
520558 Amortización cálculo actuarial pensiones de jubilación
520559 Pensiones de jubilación
520560 Indemnizaciones laborales
520561 Amortización bonos pensionales
520562 Amortización títulos pensionales
520563 Capacitación al personal
520566 Gastos deportivos y de recreación
520568 Aportes a administradoras de riesgos profesionales, ARP
520569 Aportes a entidades promotoras de salud, EPS
520570 Aportes a fondos de pensiones y/o cesantías
520572 Aportes cajas de compensación familiar
520575 Aportes ICBF
520578 SENA
520581 Aportes sindicales
520584 Gastos médicos y drogas
520595 Otros
520599 Ajustes por inflación
5210 Honorarios
521005 Junta directiva
521010 Revisoría fiscal
521015 Auditoría externa
521020 Avalúos
521025 Asesoría jurídica
521030 Asesoría financiera
521035 Asesoría técnica
521095 Otros
521099 Ajustes por inflación
5215 Impuestos
521505 Industria y comercio
521510 De timbres
521515 A la propiedad raíz
521520 Derechos sobre instrumentos públicos
521525 De valorización
521530 De turismo
521535 Tasa por utilización de puertos
521540 De vehículos
521545 De espectáculos públicos
521550 Cuotas de fomento
521555 Licores
521560 Cervezas
521565 Cigarrillos
521570 IVA descontable
521595 Otros
521599 Ajustes por inflación
5220 Arrendamientos
522005 Terrenos
522010 Construcciones y edificaciones
522015 Maquinaria y equipo
522020 Equipo de oficina
522025 Equipo de computación y comunicación
522030 Equipo médico-científico
522035 Equipo de hoteles y restaurantes
522040 Flota y equipo de transporte
522045 Flota y equipo fluvial y/o marítimo
522050 Flota y equipo aéreo
522055 Flota y equipo férreo
522060 Acueductos, plantas y redes
522065 Aeródromos
522070 Semovientes
522095 Otros
522099 Ajustes por inflación
5225 Contribuciones y afiliaciones
522505 Contribuciones
522510 Afiliaciones y sostenimiento
522599 Ajustes por inflación
5230 Seguros
523005 Manejo
523010 Cumplimiento
523015 Corriente débil
523020 Vida colectiva
523025 Incendio
523030 Terremoto
523035 Sustracción y hurto
523040 Flota y equipo de transporte
523045 Flota y equipo fluvial y/o marítimo
523050 Flota y equipo aéreo
523055 Flota y equipo férreo
523060 Responsabilidad civil y extracontractual
523065 Vuelo
523070 Rotura de maquinaria
523075 Obligatorio accidente de tránsito
523080 Lucro cesante
523095 Otros
523099 Ajustes por inflación
5235 Servicios
523505 Aseo y vigilancia
523510 Temporales
523515 Asistencia técnica
523520 Procesamiento electrónico de datos
523525 Acueducto y alcantarillado
523530 Energía eléctrica
523535 Teléfono
523540 Correo, portes y telegramas
523545 Fax y télex
523550 Transporte, fletes y acarreos
523555 Gas
523560 Publicidad, propaganda y promoción
523595 Otros
523599 Ajustes por inflación
5240 Gastos legales
524005 Notariales
524010 Registro mercantil
524015 Trámites y licencias
524020 Aduaneros
524025 Consulares
524095 Otros
524099 Ajustes por inflación
5245 Mantenimiento y reparaciones
524505 Terrenos
524510 Construcciones y edificaciones
524515 Maquinaria y equipo
524520 Equipo de oficina
524525 Equipo de computación y comunicación
524530 Equipo médico-científico
524535 Equipo de hoteles y restaurantes
524540 Flota y equipo de transporte
524545 Flota y equipo fluvial y/o marítimo
524550 Flota y equipo aéreo
524555 Flota y equipo férreo
524560 Acueductos, plantas y redes
524565 Armamento de vigilancia
524570 Vías de comunicación
524599 Ajustes por inflación
5250 Adecuación e instalación
525005 Instalaciones eléctricas
525010 Arreglos ornamentales
525015 Reparaciones locativas
525095 Otros
525099 Ajustes por inflación
5255 Gastos de viaje
525505 Alojamiento y manutención
525510 Pasajes fluviales y/o marítimos
525515 Pasajes aéreos
525520 Pasajes terrestres
525525 Pasajes férreos
525595 Otros
525599 Ajustes por inflación
5260 Depreciaciones
526005 Construcciones y edificaciones
526010 Maquinaria y equipo
526015 Equipo de oficina
526020 Equipo de computación y comunicación
526025 Equipo médico-científico
526030 Equipo de hoteles y restaurantes
526035 Flota y equipo de transporte
526040 Flota y equipo fluvial y/o marítimo
526045 Flota y equipo aéreo
526050 Flota y equipo férreo
526055 Acueductos, plantas y redes
526060 Armamento de vigilancia
526065 Envases y empaques
526099 Ajustes por inflación
5265 Amortizaciones
526505 Vías de comunicación
526510 Intangibles
526515 Cargos diferidos
526595 Otras
526599 Ajustes por inflación
5270 Financieros-reajuste del sistema
527099 Ajustes por inflación
5275 Pérdidas método de participación
527505 De sociedades anónimas y/o asimiladas
527510 De sociedades limitadas y/o asimiladas
5295 Diversos
529505 Comisiones
529510 Libros, suscripciones, periódicos y revistas
529515 Música ambiental
529520 Gastos de representación y relaciones públicas
529525 Elementos de aseo y cafetería
529530 Útiles, papelería y fotocopias
529535 Combustibles y lubricantes
529540 Envases y empaques
529545 Taxis y buses
529550 Estampillas
529555 Microfilmación
529560 Casino y restaurante
529565 Parqueaderos
529570 Indemnización por daños a terceros
529575 Pólvora y similares
529595 Otros
529599 Ajustes por inflación
5299 Provisiones
529905 Inversiones
529910 Deudores
529915 Inventarios
529920 Propiedades, planta y equipo
529995 Otros activos
529999 Ajustes por inflación
53 No operacionales
5305 Financieros
530505 Gastos bancarios
530510 Reajuste monetario-UPAC (hoy UVR)
530515 Comisiones
530520 Intereses
530525 Diferencia en cambio
530530 Gastos en negociación certificados de cambio
530535 Descuentos comerciales condicionados
530540 Gastos manejo y emisión de bonos
530545 Prima amortizada
530595 Otros
530599 Ajustes por inflación
5310 Pérdida en venta y retiro de bienes
531005 Venta de inversiones
531010 Venta de cartera
531015 Venta de propiedades, planta y equipo
531020 Venta de intangibles
531025 Venta de otros activos
531030 Retiro de propiedades, planta y equipo
531035 Retiro de otros activos
531040 Pérdidas por siniestros
531095 Otros
531099 Ajustes por inflación
5313 Pérdidas método de participación
531305 De sociedades anónimas y/o asimiladas
531310 De sociedades limitadas y/o asimiladas
5315 Gastos extraordinarios
531505 Costas y procesos judiciales
531510 Actividades culturales y cívicas
531515 Costos y gastos de ejercicios anteriores
531520 Impuestos asumidos
531595 Otros
531599 Ajustes por inflación
5395 Gastos diversos
539505 Demandas laborales
539510 Demandas por incumplimiento de contratos
539515 Indemnizaciones
539520 Multas, sanciones y litigios
539525 Donaciones
539530 Constitución de garantías
539535 Amortización de bienes entregados en comodato
539595 Otros
539599 Ajustes por inflación
54 Impuesto de renta y complementarios
5405 Impuesto de renta y complementarios
540505 Impuesto de renta y complementarios
59 Ganancias y pérdidas
5905 Ganancias y pérdidas
590505 Ganancias y pérdidas
$puc$, E'\n') as t(linea)
     where t.linea <> ''
  ) l
on conflict (codigo) do nothing;
