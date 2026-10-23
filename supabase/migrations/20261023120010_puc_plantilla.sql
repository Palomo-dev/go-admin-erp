-- PUC por prefijo. Cada archivo es una transacción corta.
-- El candado exclusivo de chart_of_accounts no se sostiene
-- mientras se leen journal_lines ni se reemplazan funciones.
--
-- Orden:
--   20261023120000 columnas, funciones de prefijo y respaldo
--   20261023120010 plantilla
--   20261023120020 validador y nombres
--   20261023120030 padre por prefijo
--   20261023120040 funciones de plan y de caja
--   20261023120100 movimiento, reglas y traslado
-- Reversión, de la más nueva a la más vieja:
--   supabase/rollbacks/ con el mismo nombre y sufijo _rollback.sql

set lock_timeout = '8s';
set statement_timeout = '40s';

-- ---------------------------------------------------------------------------
-- Plantilla corregida. No reescribe el plan de las organizaciones ya creadas.
-- ---------------------------------------------------------------------------

create temporary table tmp_puc_filas (
  codigo text primary key,
  nombre text not null,
  descripcion text
) on commit drop;

insert into tmp_puc_filas (codigo, nombre, descripcion) values
('1', 'Activo', null),
  ('2', 'Pasivo', null),
  ('3', 'Patrimonio', null),
  ('4', 'Ingresos', null),
  ('5', 'Gastos', null),
  ('6', 'Costos de ventas', null),
  ('7', 'Costos de producción o de operación', null),
  ('8', 'Cuentas de orden deudoras', null),
  ('9', 'Cuentas de orden acreedoras', null),
  ('11', 'Disponible', null),
  ('12', 'Inversiones', null),
  ('13', 'Deudores', null),
  ('14', 'Inventarios', null),
  ('15', 'Propiedades, planta y equipo', null),
  ('16', 'Intangibles', null),
  ('17', 'Diferidos', null),
  ('18', 'Otros activos', null),
  ('19', 'Valorizaciones', null),
  ('21', 'Obligaciones financieras', null),
  ('22', 'Proveedores', null),
  ('23', 'Cuentas por pagar', null),
  ('24', 'Impuestos, gravámenes y tasas', null),
  ('25', 'Obligaciones laborales', null),
  ('26', 'Pasivos estimados y provisiones', null),
  ('27', 'Diferidos', null),
  ('28', 'Otros pasivos', null),
  ('29', 'Bonos y papeles comerciales', null),
  ('31', 'Capital social', null),
  ('32', 'Superávit de capital', null),
  ('33', 'Reservas', null),
  ('36', 'Resultados del ejercicio', null),
  ('37', 'Resultados de ejercicios anteriores', null),
  ('41', 'Operacionales', null),
  ('42', 'No operacionales', null),
  ('51', 'Operacionales de administración', null),
  ('52', 'Operacionales de ventas', null),
  ('53', 'No operacionales', null),
  ('54', 'Impuesto de renta y complementarios', null),
  ('59', 'Ganancias y pérdidas', null),
  ('61', 'Costo de ventas y de prestación de servicios', null),
  ('62', 'Compras', null),
  ('71', 'Materia prima', null),
  ('72', 'Mano de obra directa', null),
  ('73', 'Costos indirectos', null),
  ('74', 'Contratos de servicios', null),
  ('81', 'Derechos contingentes', null),
  ('82', 'Deudoras fiscales', null),
  ('83', 'Deudoras de control', null),
  ('84', 'Derechos contingentes por contra (cr)', null),
  ('86', 'Deudoras fiscales por contra (cr)', null),
  ('88', 'Deudoras de control por contra (cr)', null),
  ('91', 'Responsabilidades contingentes', null),
  ('92', 'Acreedoras fiscales', null),
  ('93', 'Acreedoras de control', null),
  ('94', 'Responsabilidades contingentes por contra (db)', null),
  ('96', 'Acreedoras fiscales por contra (db)', null),
  ('98', 'Acreedoras de control por contra (db)', null),
  ('1105', 'Caja', null),
  ('1110', 'Bancos', null),
  ('1115', 'Remesas en tránsito', null),
  ('1120', 'Cuentas de ahorro', null),
  ('1125', 'Fondos', null),
  ('1205', 'Acciones', null),
  ('1210', 'Cuotas o partes de interés social', null),
  ('1245', 'Derechos fiduciarios', null),
  ('1305', 'Clientes', null),
  ('1310', 'Cuentas corrientes comerciales', null),
  ('1325', 'Cuentas por cobrar a socios y accionistas', null),
  ('1330', 'Anticipos y avances', null),
  ('1355', 'Anticipo de impuestos y contribuciones o saldos a favor', null),
  ('135517', 'Impuesto a las ventas retenido', null),
  ('135518', 'Impuesto de industria y comercio retenido', null),
  ('1365', 'Cuentas por cobrar a trabajadores', null),
  ('1380', 'Deudores varios', null),
  ('1390', 'Deudas de difícil cobro', null),
  ('1399', 'Provisiones', null),
  ('1405', 'Materias primas', 'Materias primas. La mercancía para la venta es 1435.'),
  ('1410', 'Productos en proceso', null),
  ('1415', 'Obras de construcción en curso', null),
  ('1430', 'Productos terminados', null),
  ('1435', 'Mercancías no fabricadas por la empresa', 'Mercancías no fabricadas por la empresa.'),
  ('1440', 'Bienes raíces para la venta', null),
  ('1455', 'Materiales, repuestos y accesorios', null),
  ('1465', 'Inventarios en tránsito', null),
  ('1504', 'Terrenos', null),
  ('1508', 'Construcciones en curso', null),
  ('1516', 'Construcciones y edificaciones', null),
  ('1520', 'Maquinaria y equipo', null),
  ('1524', 'Equipo de oficina', null),
  ('1528', 'Equipo de computación y comunicación', null),
  ('1540', 'Flota y equipo de transporte', null),
  ('1592', 'Depreciación acumulada', null),
  ('1599', 'Provisiones', null),
  ('1605', 'Crédito mercantil', null),
  ('1610', 'Marcas', null),
  ('1625', 'Derechos', null),
  ('1698', 'Amortización acumulada', null),
  ('1705', 'Gastos pagados por anticipado', null),
  ('1710', 'Cargos diferidos', null),
  ('1805', 'Bienes de arte y cultura', null),
  ('1905', 'De inversiones', null),
  ('1910', 'De propiedades, planta y equipo', null),
  ('2105', 'Bancos nacionales', 'Obligaciones financieras con bancos nacionales. Los proveedores van en 2205.'),
  ('2110', 'Bancos del exterior', null),
  ('2195', 'Otras obligaciones', null),
  ('2205', 'Proveedores nacionales', 'Proveedores nacionales.'),
  ('2210', 'Proveedores del exterior', null),
  ('2215', 'Cuentas corrientes comerciales', null),
  ('2305', 'Cuentas corrientes comerciales', null),
  ('2335', 'Costos y gastos por pagar', 'Costos y gastos por pagar, incluida la comisión de los canales de venta.'),
  ('2365', 'Retención en la fuente', 'Retención en la fuente practicada, por pagar.'),
  ('2367', 'Impuesto a las ventas retenido', 'IVA retenido, por pagar.'),
  ('2368', 'Impuesto de industria y comercio retenido', 'Impuesto de industria y comercio retenido, por pagar.'),
  ('2370', 'Retenciones y aportes de nómina', 'Retenciones y aportes de nómina.'),
  ('2380', 'Acreedores varios', null),
  ('2404', 'De renta y complementarios', null),
  ('2408', 'Impuesto sobre las ventas por pagar', 'IVA generado por pagar.'),
  ('2412', 'De industria y comercio', null),
  ('2495', 'Otros', null),
  ('2505', 'Salarios por pagar', null),
  ('2510', 'Cesantías consolidadas', null),
  ('2515', 'Intereses sobre cesantías', null),
  ('2520', 'Prima de servicios', null),
  ('2525', 'Vacaciones consolidadas', null),
  ('2540', 'Indemnizaciones laborales', null),
  ('2605', 'Para costos y gastos', null),
  ('2610', 'Para obligaciones laborales', null),
  ('2615', 'Para obligaciones fiscales', null),
  ('2705', 'Ingresos recibidos por anticipado', null),
  ('2710', 'Abonos diferidos', null),
  ('2725', 'Impuestos diferidos', null),
  ('2805', 'Anticipos y avances recibidos', 'Anticipos y avances recibidos, incluidos los saldos a favor de clientes.'),
  ('2810', 'Depósitos recibidos', null),
  ('2815', 'Ingresos recibidos para terceros', null),
  ('2905', 'Bonos en circulación', null),
  ('3105', 'Capital suscrito y pagado', null),
  ('3115', 'Aportes sociales', 'Aportes sociales. Un aporte de capital adicional se acredita aquí cuando la cuenta existe.'),
  ('3205', 'Prima en colocación de acciones, cuotas o partes de interés social', null),
  ('3210', 'Donaciones', null),
  ('3215', 'Crédito mercantil', null),
  ('3305', 'Reservas obligatorias', null),
  ('3310', 'Reservas estatutarias', null),
  ('3315', 'Reservas ocasionales', null),
  ('3605', 'Utilidad del ejercicio', null),
  ('3610', 'Pérdida del ejercicio', null),
  ('3705', 'Utilidades o excedentes acumulados', null),
  ('3710', 'Pérdidas acumuladas', null),
  ('4105', 'Agricultura, ganadería, caza y silvicultura', 'Agricultura, ganadería, caza y silvicultura. El comercio es 4135.'),
  ('4110', 'Pesca', 'Pesca. El ingreso de restaurante es 414015.'),
  ('4115', 'Explotación de minas y canteras', 'Explotación de minas y canteras. El hospedaje es 414005.'),
  ('4135', 'Comercio al por mayor y al por menor', 'Comercio al por mayor y al por menor.'),
  ('4140', 'Hoteles y restaurantes', null),
  ('414005', 'Hotelería', 'Hotelería.'),
  ('414015', 'Restaurantes', 'Restaurantes.'),
  ('414095', 'Otros', null),
  ('4145', 'Transporte, almacenamiento y comunicaciones', null),
  ('4155', 'Actividades inmobiliarias y de alquiler', null),
  ('4165', 'Servicios sociales y de salud', null),
  ('4175', 'Devoluciones en ventas', 'Devoluciones, rebajas y descuentos en ventas. Naturaleza débito.'),
  ('4205', 'Otras ventas', null),
  ('4210', 'Financieros', null),
  ('4215', 'Dividendos y participaciones', null),
  ('4220', 'Arrendamientos', null),
  ('4235', 'Servicios', 'Servicios. Las sesiones y los pases de parqueadero se acreditan aquí.'),
  ('4250', 'Recuperaciones', null),
  ('4255', 'Indemnizaciones', null),
  ('4295', 'Diversos', null),
  ('5105', 'Gastos de personal', null),
  ('5110', 'Honorarios', null),
  ('5115', 'Impuestos', null),
  ('511595', 'Otros', null),
  ('5120', 'Arrendamientos', null),
  ('5135', 'Servicios', null),
  ('513525', 'Acueducto y alcantarillado', null),
  ('513530', 'Energía eléctrica', null),
  ('513535', 'Teléfono', null),
  ('5145', 'Mantenimiento y reparaciones', null),
  ('5150', 'Adecuación e instalación', 'Adecuación e instalación. El faltante de inventario es 519595.'),
  ('5155', 'Gastos de viaje', null),
  ('5160', 'Depreciación', null),
  ('5165', 'Amortización', null),
  ('5195', 'Diversos', null),
  ('519525', 'Elementos de aseo y cafetería', null),
  ('519530', 'Útiles, papelería y fotocopias', null),
  ('519545', 'Taxis y buses', null),
  ('519595', 'Faltantes', 'Faltantes de inventario.'),
  ('5205', 'Gastos de personal', null),
  ('5235', 'Servicios', 'Servicios de venta. La comisión de canales es 529505.'),
  ('523550', 'Transportes, fletes y acarreos', null),
  ('5295', 'Diversos', null),
  ('529505', 'Comisiones', 'Comisiones, incluidas las de canales de venta.'),
  ('5305', 'Financieros', 'Gastos financieros.'),
  ('530595', 'Otros', null),
  ('5395', 'Gastos diversos', null),
  ('5405', 'Impuesto de renta y complementarios', null),
  ('5905', 'Ganancias y pérdidas', null),
  ('6105', 'Agricultura, ganadería, caza y silvicultura', 'Costo de ventas de agricultura, ganadería, caza y silvicultura. El comercio es 6135.'),
  ('6135', 'Comercio al por mayor y al por menor', 'Costo de ventas del comercio al por mayor y al por menor.'),
  ('6140', 'Hoteles y restaurantes', null),
  ('6155', 'Actividades inmobiliarias y de alquiler', null),
  ('6205', 'De mercancías', null),
  ('6210', 'De materias primas', null),
  ('6225', 'Devoluciones en compras', null),
  ('7105', 'Materias primas', null),
  ('7205', 'Mano de obra directa', null),
  ('7305', 'Costos indirectos', null),
  ('7405', 'Contratos de servicios', null),
  ('8105', 'Bienes y valores entregados en custodia', null),
  ('8110', 'Bienes y valores entregados en garantía', null),
  ('8115', 'Bienes y valores en poder de terceros', null),
  ('8205', 'Cuentas deudoras fiscales', null),
  ('8305', 'Cuentas deudoras de control', null),
  ('8405', 'Derechos contingentes por contra', null),
  ('8605', 'Deudoras fiscales por contra', null),
  ('8805', 'Deudoras de control por contra', null),
  ('9105', 'Bienes y valores recibidos en custodia', null),
  ('9110', 'Bienes y valores recibidos en garantía', null),
  ('9115', 'Bienes y valores recibidos de terceros', null),
  ('9205', 'Cuentas acreedoras fiscales', null),
  ('9305', 'Cuentas acreedoras de control', null),
  ('9405', 'Responsabilidades contingentes por contra', null),
  ('9605', 'Acreedoras fiscales por contra', null),
  ('9805', 'Acreedoras de control por contra', null)
;

insert into public.puc_plantilla (
  codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
  requiere_tercero, requiere_centro_costo, centro_costo_modo, presentacion_niif
)
select
  f.codigo,
  f.nombre,
  case left(f.codigo, 1)
    when '1' then 'asset'
    when '2' then 'liability'
    when '3' then 'equity'
    when '4' then 'income'
    when '5' then 'expense'
    when '6' then 'expense'
    when '7' then 'expense'
    else 'order'
  end,
  case length(f.codigo)
    when 1 then null
    when 2 then left(f.codigo, 1)
    when 4 then left(f.codigo, 2)
    when 6 then left(f.codigo, 4)
    when 8 then left(f.codigo, 6)
    else left(f.codigo, length(f.codigo) - 2)
  end,
  coalesce(f.descripcion, p.descripcion),
  case
    when f.codigo in ('1399', '1592', '1599', '1698', '6225') then 'credito'
    when f.codigo in ('3610', '3710', '4175') then 'debito'
    when left(f.codigo, 2) in ('84', '86', '88') then 'credito'
    when left(f.codigo, 2) in ('94', '96', '98') then 'debito'
    when left(f.codigo, 1) in ('1', '5', '6', '7', '8') then 'debito'
    else 'credito'
  end,
  not exists (
    select 1 from tmp_puc_filas h
    where h.codigo <> f.codigo
      and left(h.codigo, length(f.codigo)) = f.codigo
      and length(h.codigo) > length(f.codigo)
  ),
  f.codigo in (
    '1305', '1310', '1325', '1330', '1355', '1365', '1380',
    '2105', '2205', '2210', '2215',
    '2305', '2335', '2365', '2367', '2368', '2370', '2380',
    '2505', '2805'
  ),
  (
    left(f.codigo, 1) in ('5', '6', '7')
    and not exists (
      select 1 from tmp_puc_filas h
      where h.codigo <> f.codigo
        and left(h.codigo, length(f.codigo)) = f.codigo
        and length(h.codigo) > length(f.codigo)
    )
  ),
  case
    when left(f.codigo, 1) in ('5', '6', '7') and not exists (
      select 1 from tmp_puc_filas h
      where h.codigo <> f.codigo
        and left(h.codigo, length(f.codigo)) = f.codigo
        and length(h.codigo) > length(f.codigo)
    ) then 'obligatorio'
    when left(f.codigo, 1) in ('4', '5', '6', '7') then 'opcional'
    else 'no_aplica'
  end,
  public.fn_puc_presentacion_defecto(f.codigo)
from tmp_puc_filas f
left join public.puc_plantilla p on p.codigo = f.codigo
on conflict (codigo) do update set
  nombre = excluded.nombre,
  tipo = excluded.tipo,
  padre = excluded.padre,
  descripcion = coalesce(excluded.descripcion, public.puc_plantilla.descripcion),
  naturaleza = excluded.naturaleza,
  es_movimiento = excluded.es_movimiento,
  requiere_tercero = excluded.requiere_tercero,
  requiere_centro_costo = excluded.requiere_centro_costo,
  centro_costo_modo = excluded.centro_costo_modo,
  presentacion_niif = excluded.presentacion_niif;

-- 2405 y 4705 no forman parte del plan de una organización nueva.
delete from public.puc_plantilla where codigo in ('2405', '4705');
