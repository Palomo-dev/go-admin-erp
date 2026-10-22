-- Jerarquía PUC (Decreto 2650 de 1993) en el plan de cuentas.
--
-- Agrega nivel, clase, naturaleza, es_movimiento, requiere_tercero,
-- requiere_centro_costo y activa. Siembra un solo catálogo (puc_plantilla)
-- y una sola función al crear la organización.
--
-- No reescribe planes, reglas ni asientos de las organizaciones que ya
-- existen. Esa reclasificación está en supabase/propuestas y no se ejecuta
-- con esta migración. es_movimiento queda null en las filas actuales: un
-- null sigue recibiendo asientos. Solo un false los rechaza.
--
-- set local no se queda en la sesión: vale solo para esta transacción.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

-- 1. Columnas. nivel, clase y activa se calculan del código y de is_active.
-- naturaleza y es_movimiento se guardan porque hay contrapartidas (4175 es
-- débito aunque la clase 4 sea crédito) y porque el null legado no es false.

alter table public.chart_of_accounts
  add column if not exists nivel text
  generated always as (
    case
      when account_code ~ '^[0-9]+$' and length(account_code) = 1 then 'clase'
      when account_code ~ '^[0-9]+$' and length(account_code) = 2 then 'grupo'
      when account_code ~ '^[0-9]+$' and length(account_code) = 4 then 'cuenta'
      when account_code ~ '^[0-9]+$' and length(account_code) = 6 then 'subcuenta'
      when account_code ~ '^[0-9]+$' and length(account_code) = 8 then 'auxiliar'
      when account_code ~ '^[0-9]+$' and length(account_code) >= 10 and length(account_code) % 2 = 0 then 'subauxiliar'
      else 'legacy'
    end
  ) stored;

alter table public.chart_of_accounts
  add column if not exists clase smallint
  generated always as (
    case
      when left(account_code, 1) ~ '^[1-9]$' then left(account_code, 1)::smallint
      else null
    end
  ) stored;

alter table public.chart_of_accounts
  add column if not exists naturaleza text;

alter table public.chart_of_accounts
  add column if not exists es_movimiento boolean;

alter table public.chart_of_accounts
  add column if not exists requiere_tercero boolean not null default false;

alter table public.chart_of_accounts
  add column if not exists requiere_centro_costo boolean not null default false;

alter table public.chart_of_accounts
  add column if not exists activa boolean
  generated always as (coalesce(is_active, true)) stored;

alter table public.chart_of_accounts drop constraint if exists chart_of_accounts_type_check;
alter table public.chart_of_accounts
  add constraint chart_of_accounts_type_check
  check (type = any (array['asset'::text, 'liability'::text, 'income'::text, 'expense'::text, 'equity'::text, 'order'::text]));

alter table public.chart_of_accounts drop constraint if exists chart_of_accounts_nivel_check;
alter table public.chart_of_accounts
  add constraint chart_of_accounts_nivel_check
  check (nivel in ('clase', 'grupo', 'cuenta', 'subcuenta', 'auxiliar', 'subauxiliar', 'legacy'));

alter table public.chart_of_accounts drop constraint if exists chart_of_accounts_clase_check;
alter table public.chart_of_accounts
  add constraint chart_of_accounts_clase_check
  check (clase is null or clase between 1 and 9);

alter table public.chart_of_accounts drop constraint if exists chart_of_accounts_naturaleza_check;
alter table public.chart_of_accounts
  add constraint chart_of_accounts_naturaleza_check
  check (naturaleza is null or naturaleza in ('debito', 'credito', 'orden'));

comment on column public.chart_of_accounts.is_active is
  'Cuenta activa. activa es la misma bandera, generada, y no se escribe.';
comment on column public.chart_of_accounts.activa is
  'Reflejo de is_active. La escritura sigue siendo is_active.';
comment on column public.chart_of_accounts.nivel is
  'clase 1, grupo 2, cuenta 4, subcuenta 6, auxiliar 8, subauxiliar 10 o más (par). legacy si el código no es PUC.';
comment on column public.chart_of_accounts.naturaleza is
  'debito, credito u orden. Null: la pantalla usa la naturaleza de la clase. 4175 es debito.';
comment on column public.chart_of_accounts.es_movimiento is
  'True solo en el último nivel. False rechaza el asiento. Null (plan anterior) lo permite.';

-- 2. Catálogo global. No tiene organization_id: es la plantilla, no un plan.

create table if not exists public.puc_plantilla (
  codigo text primary key,
  nombre text not null,
  tipo text not null,
  padre text,
  descripcion text,
  naturaleza text not null,
  es_movimiento boolean not null,
  requiere_tercero boolean not null default false,
  requiere_centro_costo boolean not null default false,
  constraint puc_plantilla_tipo_check
    check (tipo = any (array['asset'::text, 'liability'::text, 'income'::text, 'expense'::text, 'equity'::text, 'order'::text])),
  constraint puc_plantilla_naturaleza_check
    check (naturaleza in ('debito', 'credito', 'orden')),
  constraint puc_plantilla_forma_check
    check (
      codigo ~ '^[1-9][0-9]*$'
      and (
        length(codigo) in (1, 2, 4, 6, 8)
        or (length(codigo) >= 10 and length(codigo) % 2 = 0)
      )
      and (
        padre is null
        or (
          length(codigo) > 1
          and padre = left(codigo, case length(codigo)
            when 2 then 1
            when 4 then 2
            when 6 then 4
            when 8 then 6
            else length(codigo) - 2
          end)
        )
      )
    )
);

alter table public.puc_plantilla enable row level security;
drop policy if exists puc_plantilla_lectura on public.puc_plantilla;
create policy puc_plantilla_lectura
  on public.puc_plantilla
  for select
  to authenticated
  using (true);
revoke all on table public.puc_plantilla from public, anon;
grant select on table public.puc_plantilla to authenticated, service_role;

insert into public.puc_plantilla (
  codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
) values
  ('1', 'Activo', 'asset', null, null, 'debito', false, false, false),
  ('2', 'Pasivo', 'liability', null, null, 'credito', false, false, false),
  ('3', 'Patrimonio', 'equity', null, null, 'credito', false, false, false),
  ('4', 'Ingresos', 'income', null, null, 'credito', false, false, false),
  ('5', 'Gastos', 'expense', null, null, 'debito', false, false, false),
  ('6', 'Costos de ventas', 'expense', null, null, 'debito', false, false, false),
  ('7', 'Costos de producción o de operación', 'expense', null, null, 'debito', false, false, false),
  ('8', 'Cuentas de orden deudoras', 'order', null, null, 'orden', false, false, false),
  ('9', 'Cuentas de orden acreedoras', 'order', null, null, 'orden', false, false, false),
  ('11', 'Disponible', 'asset', '1', null, 'debito', false, false, false),
  ('12', 'Inversiones', 'asset', '1', null, 'debito', false, false, false),
  ('13', 'Deudores', 'asset', '1', null, 'debito', false, false, false),
  ('14', 'Inventarios', 'asset', '1', null, 'debito', false, false, false),
  ('15', 'Propiedad, planta y equipo', 'asset', '1', null, 'debito', false, false, false),
  ('16', 'Intangibles', 'asset', '1', null, 'debito', false, false, false),
  ('17', 'Diferidos', 'asset', '1', null, 'debito', false, false, false),
  ('18', 'Otros activos', 'asset', '1', null, 'debito', false, false, false),
  ('19', 'Valorizaciones', 'asset', '1', null, 'debito', false, false, false),
  ('21', 'Obligaciones financieras', 'liability', '2', null, 'credito', false, false, false),
  ('22', 'Proveedores', 'liability', '2', null, 'credito', false, false, false),
  ('23', 'Cuentas por pagar', 'liability', '2', null, 'credito', false, false, false),
  ('24', 'Impuestos, gravámenes y tasas', 'liability', '2', null, 'credito', false, false, false),
  ('25', 'Obligaciones laborales', 'liability', '2', null, 'credito', false, false, false),
  ('26', 'Pasivos estimados y provisiones', 'liability', '2', null, 'credito', false, false, false),
  ('27', 'Diferidos', 'liability', '2', null, 'credito', false, false, false),
  ('28', 'Otros pasivos', 'liability', '2', null, 'credito', false, false, false),
  ('29', 'Bonos y papeles comerciales', 'liability', '2', null, 'credito', false, false, false),
  ('31', 'Capital social', 'equity', '3', null, 'credito', false, false, false),
  ('32', 'Superávit de capital', 'equity', '3', null, 'credito', false, false, false),
  ('33', 'Reservas', 'equity', '3', null, 'credito', false, false, false),
  ('36', 'Resultados del ejercicio', 'equity', '3', null, 'credito', false, false, false),
  ('37', 'Resultados de ejercicios anteriores', 'equity', '3', null, 'credito', false, false, false),
  ('41', 'Operacionales', 'income', '4', null, 'credito', false, false, false),
  ('42', 'No operacionales', 'income', '4', null, 'credito', false, false, false),
  ('51', 'Operacionales de administración', 'expense', '5', null, 'debito', false, false, false),
  ('52', 'Operacionales de ventas', 'expense', '5', null, 'debito', false, false, false),
  ('53', 'No operacionales', 'expense', '5', null, 'debito', false, false, false),
  ('54', 'Impuesto de renta y complementarios', 'expense', '5', null, 'debito', false, false, false),
  ('59', 'Ganancias y pérdidas', 'expense', '5', null, 'debito', false, false, false),
  ('61', 'Costo de ventas y de prestación de servicios', 'expense', '6', null, 'debito', false, false, false),
  ('62', 'Compras', 'expense', '6', null, 'debito', false, false, false),
  ('71', 'Materia prima', 'expense', '7', null, 'debito', false, false, false),
  ('72', 'Mano de obra directa', 'expense', '7', null, 'debito', false, false, false),
  ('73', 'Costos indirectos', 'expense', '7', null, 'debito', false, false, false),
  ('74', 'Contratos de servicios', 'expense', '7', null, 'debito', false, false, false),
  ('81', 'Derechos contingentes', 'order', '8', null, 'orden', false, false, false),
  ('82', 'Deudoras fiscales', 'order', '8', null, 'orden', false, false, false),
  ('83', 'Deudoras de control', 'order', '8', null, 'orden', false, false, false),
  ('91', 'Responsabilidades contingentes', 'order', '9', null, 'orden', false, false, false),
  ('92', 'Acreedoras fiscales', 'order', '9', null, 'orden', false, false, false),
  ('93', 'Acreedoras de control', 'order', '9', null, 'orden', false, false, false),
  ('1105', 'Caja', 'asset', '11', null, 'debito', true, false, false),
  ('1110', 'Bancos', 'asset', '11', null, 'debito', true, false, false),
  ('1115', 'Remesas en tránsito', 'asset', '11', null, 'debito', true, false, false),
  ('1120', 'Cuentas de ahorro', 'asset', '11', null, 'debito', true, false, false),
  ('1125', 'Fondos', 'asset', '11', null, 'debito', true, false, false),
  ('1205', 'Acciones', 'asset', '12', null, 'debito', true, false, false),
  ('1210', 'Cuotas o partes de interés social', 'asset', '12', null, 'debito', true, false, false),
  ('1245', 'Derechos fiduciarios', 'asset', '12', null, 'debito', true, false, false),
  ('1305', 'Clientes', 'asset', '13', null, 'debito', true, true, false),
  ('1310', 'Cuentas corrientes comerciales', 'asset', '13', null, 'debito', true, true, false),
  ('1325', 'Cuentas por cobrar a socios y accionistas', 'asset', '13', null, 'debito', true, true, false),
  ('1330', 'Anticipos y avances', 'asset', '13', null, 'debito', true, true, false),
  ('1355', 'Anticipo de impuestos y contribuciones o saldos a favor', 'asset', '13', null, 'debito', true, true, false),
  ('1365', 'Cuentas por cobrar a trabajadores', 'asset', '13', null, 'debito', true, true, false),
  ('1380', 'Deudores varios', 'asset', '13', null, 'debito', true, true, false),
  ('1390', 'Deudas de difícil cobro', 'asset', '13', null, 'debito', true, false, false),
  ('1399', 'Provisiones', 'asset', '13', null, 'credito', true, false, false),
  ('1405', 'Materias primas', 'asset', '14', 'Materias primas. La mercancía para la venta es 1435.', 'debito', true, false, false),
  ('1410', 'Productos en proceso', 'asset', '14', null, 'debito', true, false, false),
  ('1415', 'Obras de construcción en curso', 'asset', '14', null, 'debito', true, false, false),
  ('1430', 'Productos terminados', 'asset', '14', null, 'debito', true, false, false),
  ('1435', 'Mercancías no fabricadas por la empresa', 'asset', '14', 'Mercancías no fabricadas por la empresa.', 'debito', true, false, false),
  ('1440', 'Bienes raíces para la venta', 'asset', '14', null, 'debito', true, false, false),
  ('1455', 'Materiales, repuestos y accesorios', 'asset', '14', null, 'debito', true, false, false),
  ('1465', 'Inventarios en tránsito', 'asset', '14', null, 'debito', true, false, false),
  ('1504', 'Terrenos', 'asset', '15', null, 'debito', true, false, false),
  ('1508', 'Construcciones en curso', 'asset', '15', null, 'debito', true, false, false),
  ('1516', 'Construcciones y edificaciones', 'asset', '15', null, 'debito', true, false, false),
  ('1520', 'Maquinaria y equipo', 'asset', '15', null, 'debito', true, false, false),
  ('1524', 'Equipo de oficina', 'asset', '15', null, 'debito', true, false, false),
  ('1528', 'Equipo de computación y comunicación', 'asset', '15', null, 'debito', true, false, false),
  ('1540', 'Flota y equipo de transporte', 'asset', '15', null, 'debito', true, false, false),
  ('1592', 'Depreciación acumulada', 'asset', '15', null, 'credito', true, false, false),
  ('1605', 'Crédito mercantil', 'asset', '16', null, 'debito', true, false, false),
  ('1610', 'Marcas', 'asset', '16', null, 'debito', true, false, false),
  ('1625', 'Derechos', 'asset', '16', null, 'debito', true, false, false),
  ('1698', 'Amortización acumulada', 'asset', '16', null, 'credito', true, false, false),
  ('1705', 'Gastos pagados por anticipado', 'asset', '17', null, 'debito', true, false, false),
  ('1710', 'Cargos diferidos', 'asset', '17', null, 'debito', true, false, false),
  ('1805', 'Bienes de arte y cultura', 'asset', '18', null, 'debito', true, false, false),
  ('1905', 'De inversiones', 'asset', '19', null, 'debito', true, false, false),
  ('1910', 'De propiedades, planta y equipo', 'asset', '19', null, 'debito', true, false, false),
  ('2105', 'Bancos nacionales', 'liability', '21', 'Obligaciones financieras con bancos nacionales. Los proveedores van en 2205.', 'credito', true, true, false),
  ('2110', 'Bancos del exterior', 'liability', '21', null, 'credito', true, false, false),
  ('2195', 'Otras obligaciones', 'liability', '21', null, 'credito', true, false, false),
  ('2205', 'Proveedores nacionales', 'liability', '22', 'Proveedores nacionales.', 'credito', true, true, false),
  ('2210', 'Proveedores del exterior', 'liability', '22', null, 'credito', true, true, false),
  ('2215', 'Cuentas corrientes comerciales', 'liability', '22', null, 'credito', true, true, false),
  ('2305', 'Cuentas corrientes comerciales', 'liability', '23', null, 'credito', true, true, false),
  ('2335', 'Costos y gastos por pagar', 'liability', '23', 'Costos y gastos por pagar, incluida la comisión de los canales de venta.', 'credito', true, true, false),
  ('2365', 'Retención en la fuente', 'liability', '23', 'Retención en la fuente practicada, por pagar.', 'credito', true, true, false),
  ('2367', 'Impuesto a las ventas retenido', 'liability', '23', 'IVA retenido, por pagar.', 'credito', true, true, false),
  ('2368', 'Impuesto de industria y comercio retenido', 'liability', '23', 'Impuesto de industria y comercio retenido, por pagar.', 'credito', true, true, false),
  ('2370', 'Retenciones y aportes de nómina', 'liability', '23', 'Retenciones y aportes de nómina.', 'credito', true, true, false),
  ('2380', 'Acreedores varios', 'liability', '23', null, 'credito', true, true, false),
  ('2404', 'De renta y complementarios', 'liability', '24', null, 'credito', true, false, false),
  ('2408', 'Impuesto sobre las ventas por pagar', 'liability', '24', 'IVA generado por pagar.', 'credito', true, false, false),
  ('2412', 'De industria y comercio', 'liability', '24', null, 'credito', true, false, false),
  ('2495', 'Otros', 'liability', '24', null, 'credito', true, false, false),
  ('2505', 'Salarios por pagar', 'liability', '25', null, 'credito', true, true, false),
  ('2510', 'Cesantías consolidadas', 'liability', '25', null, 'credito', true, false, false),
  ('2515', 'Intereses sobre cesantías', 'liability', '25', null, 'credito', true, false, false),
  ('2520', 'Prima de servicios', 'liability', '25', null, 'credito', true, false, false),
  ('2525', 'Vacaciones consolidadas', 'liability', '25', null, 'credito', true, false, false),
  ('2540', 'Indemnizaciones laborales', 'liability', '25', null, 'credito', true, false, false),
  ('2605', 'Para costos y gastos', 'liability', '26', null, 'credito', true, false, false),
  ('2610', 'Para obligaciones laborales', 'liability', '26', null, 'credito', true, false, false),
  ('2615', 'Para obligaciones fiscales', 'liability', '26', null, 'credito', true, false, false),
  ('2705', 'Ingresos recibidos por anticipado', 'liability', '27', null, 'credito', true, false, false),
  ('2710', 'Abonos diferidos', 'liability', '27', null, 'credito', true, false, false),
  ('2725', 'Impuestos diferidos', 'liability', '27', null, 'credito', true, false, false),
  ('2805', 'Anticipos y avances recibidos', 'liability', '28', 'Anticipos y avances recibidos, incluidos los saldos a favor de clientes.', 'credito', true, true, false),
  ('2810', 'Depósitos recibidos', 'liability', '28', null, 'credito', true, false, false),
  ('2815', 'Ingresos recibidos para terceros', 'liability', '28', null, 'credito', true, false, false),
  ('2905', 'Bonos en circulación', 'liability', '29', null, 'credito', true, false, false),
  ('3105', 'Capital suscrito y pagado', 'equity', '31', null, 'credito', true, false, false),
  ('3115', 'Aportes sociales', 'equity', '31', 'Aportes sociales. Un aporte de capital adicional se acredita aquí cuando la cuenta existe.', 'credito', true, false, false),
  ('3205', 'Prima en colocación de acciones', 'equity', '32', null, 'credito', true, false, false),
  ('3210', 'Donaciones', 'equity', '32', null, 'credito', true, false, false),
  ('3215', 'Crédito mercantil', 'equity', '32', null, 'credito', true, false, false),
  ('3305', 'Reservas obligatorias', 'equity', '33', null, 'credito', true, false, false),
  ('3310', 'Reservas estatutarias', 'equity', '33', null, 'credito', true, false, false),
  ('3315', 'Reservas ocasionales', 'equity', '33', null, 'credito', true, false, false),
  ('3605', 'Utilidad del ejercicio', 'equity', '36', null, 'credito', true, false, false),
  ('3610', 'Pérdida del ejercicio', 'equity', '36', null, 'debito', true, false, false),
  ('3705', 'Utilidades o excedentes acumulados', 'equity', '37', null, 'credito', true, false, false),
  ('3710', 'Pérdidas acumuladas', 'equity', '37', null, 'debito', true, false, false),
  ('4105', 'Agricultura, ganadería, caza y silvicultura', 'income', '41', 'Agricultura, ganadería, caza y silvicultura. El comercio es 4135.', 'credito', true, false, false),
  ('4110', 'Ingresos por alimentos', 'income', '41', 'Ingreso por alimentos. El Decreto 2650 asigna 4110 a pesca; los cargos de folio ya acreditan este código.', 'credito', true, false, false),
  ('4115', 'Ingresos por servicios de hospedaje', 'income', '41', 'Ingreso por hospedaje. El Decreto 2650 asigna 4115 a minas; los cargos de folio ya acreditan este código.', 'credito', true, false, false),
  ('4135', 'Comercio al por mayor y al por menor', 'income', '41', 'Comercio al por mayor y al por menor.', 'credito', true, false, false),
  ('4140', 'Hoteles y restaurantes', 'income', '41', null, 'credito', true, false, false),
  ('4155', 'Actividades inmobiliarias y de alquiler', 'income', '41', null, 'credito', true, false, false),
  ('4165', 'Servicios sociales y de salud', 'income', '41', null, 'credito', true, false, false),
  ('4175', 'Devoluciones en ventas', 'income', '41', 'Devoluciones, rebajas y descuentos en ventas. Naturaleza débito.', 'debito', true, false, false),
  ('4210', 'Financieros', 'income', '42', null, 'credito', true, false, false),
  ('4215', 'Dividendos y participaciones', 'income', '42', null, 'credito', true, false, false),
  ('4220', 'Arrendamientos', 'income', '42', null, 'credito', true, false, false),
  ('4235', 'Servicios', 'income', '42', 'Servicios. Las sesiones y los pases de parqueadero se acreditan aquí.', 'credito', true, false, false),
  ('4250', 'Recuperaciones', 'income', '42', null, 'credito', true, false, false),
  ('4255', 'Indemnizaciones', 'income', '42', null, 'credito', true, false, false),
  ('4295', 'Diversos', 'income', '42', null, 'credito', true, false, false),
  ('5105', 'Gastos de personal', 'expense', '51', null, 'debito', true, false, true),
  ('5110', 'Honorarios', 'expense', '51', null, 'debito', true, false, true),
  ('5115', 'Impuestos', 'expense', '51', null, 'debito', true, false, true),
  ('5120', 'Arrendamientos', 'expense', '51', null, 'debito', true, false, true),
  ('5135', 'Servicios', 'expense', '51', null, 'debito', true, false, true),
  ('5145', 'Mantenimiento y reparaciones', 'expense', '51', null, 'debito', true, false, true),
  ('5150', 'Adecuación e instalación', 'expense', '51', 'Adecuación e instalación. El faltante de inventario también se lleva a esta cuenta.', 'debito', true, false, true),
  ('5155', 'Gastos de viaje', 'expense', '51', null, 'debito', true, false, true),
  ('5160', 'Depreciación', 'expense', '51', null, 'debito', true, false, true),
  ('5165', 'Amortización', 'expense', '51', null, 'debito', true, false, true),
  ('5195', 'Diversos', 'expense', '51', null, 'debito', true, false, true),
  ('5205', 'Gastos de personal', 'expense', '52', null, 'debito', true, false, true),
  ('5235', 'Comisiones', 'expense', '52', 'Comisiones, incluidas las de canales. En el decreto, 5235 son servicios de venta.', 'debito', true, false, true),
  ('5295', 'Diversos', 'expense', '52', null, 'debito', true, false, true),
  ('5305', 'Financieros', 'expense', '53', 'Gastos financieros.', 'debito', true, false, true),
  ('5395', 'Gastos diversos', 'expense', '53', null, 'debito', true, false, true),
  ('5405', 'Impuesto de renta y complementarios', 'expense', '54', null, 'debito', true, false, true),
  ('5905', 'Ganancias y pérdidas', 'expense', '59', null, 'debito', true, false, true),
  ('6105', 'Agricultura, ganadería, caza y silvicultura', 'expense', '61', 'Costo de ventas de agricultura, ganadería, caza y silvicultura. El comercio es 6135.', 'debito', true, false, true),
  ('6135', 'Comercio al por mayor y al por menor', 'expense', '61', 'Costo de ventas del comercio al por mayor y al por menor.', 'debito', true, false, true),
  ('6140', 'Hoteles y restaurantes', 'expense', '61', null, 'debito', true, false, true),
  ('6155', 'Actividades inmobiliarias y de alquiler', 'expense', '61', null, 'debito', true, false, true),
  ('6205', 'De mercancías', 'expense', '62', null, 'debito', true, false, true),
  ('6210', 'De materias primas', 'expense', '62', null, 'debito', true, false, true),
  ('6225', 'Devoluciones en compras', 'expense', '62', null, 'credito', true, false, true),
  ('7105', 'Materias primas', 'expense', '71', null, 'debito', true, false, true),
  ('7205', 'Mano de obra directa', 'expense', '72', null, 'debito', true, false, true),
  ('7305', 'Costos indirectos', 'expense', '73', null, 'debito', true, false, true),
  ('7405', 'Contratos de servicios', 'expense', '74', null, 'debito', true, false, true),
  ('8105', 'Bienes y valores entregados en custodia', 'order', '81', null, 'orden', true, false, false),
  ('8110', 'Bienes y valores entregados en garantía', 'order', '81', null, 'orden', true, false, false),
  ('8115', 'Bienes y valores en poder de terceros', 'order', '81', null, 'orden', true, false, false),
  ('8205', 'Cuentas deudoras fiscales', 'order', '82', null, 'orden', true, false, false),
  ('8305', 'Cuentas deudoras de control', 'order', '83', null, 'orden', true, false, false),
  ('9105', 'Bienes y valores recibidos en custodia', 'order', '91', null, 'orden', true, false, false),
  ('9110', 'Bienes y valores recibidos en garantía', 'order', '91', null, 'orden', true, false, false),
  ('9115', 'Bienes y valores recibidos de terceros', 'order', '91', null, 'orden', true, false, false),
  ('9205', 'Cuentas acreedoras fiscales', 'order', '92', null, 'orden', true, false, false),
  ('9305', 'Cuentas acreedoras de control', 'order', '93', null, 'orden', true, false, false)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      tipo = excluded.tipo,
      padre = excluded.padre,
      descripcion = excluded.descripcion,
      naturaleza = excluded.naturaleza,
      es_movimiento = excluded.es_movimiento,
      requiere_tercero = excluded.requiere_tercero,
      requiere_centro_costo = excluded.requiere_centro_costo;

-- 3. Jerarquía y borrado. El asiento solo entra a una cuenta de movimiento.
-- es_movimiento null (planes ya existentes) sigue aceptando líneas: no se
-- reescribe el histórico y los códigos con guion siguen contabilizando.

create or replace function public.fn_puc_validar_cuenta()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_largo integer;
  v_prefijo integer;
begin
  -- Un plan viejo puede tener el padre mal colgado (2365 bajo 21, 1305 bajo
  -- 11, códigos 1000/2100). Renombrar o desactivar no revalida ese padre.
  -- Cambiar el padre o el código sí pasa por la regla del nivel siguiente.
  if tg_op = 'UPDATE'
     and new.account_code = old.account_code
     and new.parent_code is not distinct from old.parent_code then
    if new.account_code ~ '^[0-9]+$' and length(new.account_code) in (1, 2) then
      new.es_movimiento := false;
    elsif new.es_movimiento is true and exists (
      select 1
      from public.chart_of_accounts
      where organization_id = new.organization_id
        and parent_code = new.account_code
    ) then
      new.es_movimiento := false;
    end if;
    return new;
  end if;

  if new.account_code !~ '^[0-9]+$' or left(new.account_code, 1) !~ '^[1-9]$' then
    if tg_op = 'UPDATE' and new.account_code = old.account_code then
      if new.parent_code is not null and position(new.parent_code in new.account_code) <> 1 then
        raise exception 'padre_invalido: el código % no empieza por el padre %', new.account_code, new.parent_code;
      end if;
      return new;
    end if;
    raise exception 'codigo_puc_invalido: % no es un código del PUC', new.account_code;
  end if;

  v_largo := length(new.account_code);
  if v_largo not in (1, 2, 4, 6, 8) and not (v_largo >= 10 and v_largo % 2 = 0) then
    raise exception 'codigo_puc_invalido: % no tiene la longitud de un nivel del PUC', new.account_code;
  end if;

  if v_largo = 1 then
    if new.parent_code is not null then
      raise exception 'padre_invalido: la clase % no lleva cuenta padre', new.account_code;
    end if;
  elsif new.parent_code is not null then
    v_prefijo := case
      when v_largo = 2 then 1
      when v_largo = 4 then 2
      when v_largo = 6 then 4
      when v_largo = 8 then 6
      else v_largo - 2
    end;
    if new.parent_code is distinct from left(new.account_code, v_prefijo) then
      raise exception 'padre_invalido: el padre de % es %, no %',
        new.account_code, left(new.account_code, v_prefijo), new.parent_code;
    end if;
  end if;

  if v_largo in (1, 2) then
    new.es_movimiento := false;
  elsif tg_op = 'INSERT' and new.es_movimiento is null then
    new.es_movimiento := true;
  end if;

  if exists (
    select 1
    from public.chart_of_accounts
    where organization_id = new.organization_id
      and parent_code = new.account_code
  ) then
    new.es_movimiento := false;
  end if;

  -- Solo apaga al padre si hoy está marcado como de movimiento.
  -- Un null legado (1405 con hijos 1405-01) no se toca: esos asientos siguen.
  if tg_op = 'INSERT' and new.parent_code is not null then
    update public.chart_of_accounts
       set es_movimiento = false,
           updated_at = now()
     where organization_id = new.organization_id
       and account_code = new.parent_code
       and es_movimiento is true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_puc_validar_cuenta on public.chart_of_accounts;
create trigger trg_puc_validar_cuenta
  before insert or update on public.chart_of_accounts
  for each row execute function public.fn_puc_validar_cuenta();

create or replace function public.fn_puc_no_borrar_con_movimientos()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if exists (
    select 1
    from public.journal_lines
    where organization_id = old.organization_id
      and account_code = old.account_code
  ) then
    raise exception 'cuenta_con_movimientos: la cuenta % tiene movimientos; desactívela', old.account_code;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_puc_no_borrar_con_movimientos on public.chart_of_accounts;
create trigger trg_puc_no_borrar_con_movimientos
  before delete on public.chart_of_accounts
  for each row execute function public.fn_puc_no_borrar_con_movimientos();

create or replace function public.fn_puc_linea_solo_movimiento()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org integer;
  v_mov boolean;
begin
  v_org := new.organization_id;
  if v_org is null then
    select organization_id into v_org
    from public.journal_entries
    where id = new.journal_entry_id;
  end if;
  if v_org is null then
    return new;
  end if;

  select es_movimiento into v_mov
  from public.chart_of_accounts
  where organization_id = v_org
    and account_code = new.account_code;

  -- Sin fila en el plan, o con es_movimiento null: no es un rechazo nuevo.
  if v_mov is false then
    raise exception 'cuenta_no_es_de_movimiento: la cuenta % es de título y no recibe asientos', new.account_code;
  end if;
  return new;
end;
$$;

-- Después de tr_set_journal_line_org_id, que llena organization_id.
drop trigger if exists zz_trg_puc_linea_solo_movimiento on public.journal_lines;
create trigger zz_trg_puc_linea_solo_movimiento
  before insert on public.journal_lines
  for each row execute function public.fn_puc_linea_solo_movimiento();

revoke all on function public.fn_puc_validar_cuenta() from public, anon, authenticated;
revoke all on function public.fn_puc_no_borrar_con_movimientos() from public, anon, authenticated;
revoke all on function public.fn_puc_linea_solo_movimiento() from public, anon, authenticated;

-- 4. Una sola siembra. fn_create_default_chart_of_accounts era un CASE por
-- país: COL con un PUC corto e incorrecto (1405 inventarios, 2105 proveedores,
-- 2405 impuestos, 4105 ventas, 6105 costo) y MEX, CHL y el genérico con
-- 1000/2000/4000. ESP usaba el PGC. No había otra función de siembra.
-- trg_fn_auto_create_chart_of_accounts la llama al crear la organización.
-- Si la organización ya tiene cuentas, no se toca.

create or replace function public.fn_create_default_chart_of_accounts(org_id integer, country_code text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.fn_assert_acceso_org(org_id);
  -- country_code se ignora. El plan de una organización nueva es el PUC.
  if country_code is null then
    null;
  end if;
  if exists (select 1 from public.chart_of_accounts where organization_id = org_id) then
    return;
  end if;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, is_active, description,
    naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
  )
  select
    org_id, p.codigo, p.nombre, p.tipo, p.padre, true, p.descripcion,
    p.naturaleza, p.es_movimiento, p.requiere_tercero, p.requiere_centro_costo
  from public.puc_plantilla p
  order by length(p.codigo), p.codigo;
end;
$$;

-- Las cuentas de módulo (2370, 2805, 4110, 4115, 4235, 4250, 5150, 5195, …)
-- ya están en la plantilla. Se conserva la firma: el disparador de la
-- organización la sigue llamando.
create or replace function public.fn_add_module_accounts(org_id integer, country_code text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.fn_assert_acceso_org(org_id);
  if country_code is null then
    null;
  end if;
end;
$$;

-- Padre real del PUC. 2365 y 2805 no cuelgan de 21: 21 es obligaciones
-- financieras y, además, 2805 empieza por 28. Si el grupo no existe, la
-- cuenta queda sin padre (un plan viejo no recibe grupos nuevos aquí).
create or replace function public.fn_asegurar_cuenta_anticipos(p_organization_id integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_parent text;
begin
  if exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = '2805'
  ) then
    return;
  end if;

  if exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = '28'
  ) then
    v_parent := '28';
  end if;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, is_active, description, naturaleza
  ) values (
    p_organization_id, '2805', 'Anticipos y avances recibidos', 'liability', v_parent, true,
    'Saldos a favor de clientes: anticipos y notas crédito sobre facturas ya pagadas',
    'credito'
  )
  on conflict (organization_id, account_code) do nothing;
end;
$$;

create or replace function public.fn_asegurar_cuentas_retencion(p_organization_id integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_parent text;
begin
  if exists (select 1 from public.chart_of_accounts where organization_id = p_organization_id and account_code = '2365')
     and exists (select 1 from public.chart_of_accounts where organization_id = p_organization_id and account_code = '2367')
     and exists (select 1 from public.chart_of_accounts where organization_id = p_organization_id and account_code = '2368') then
    return;
  end if;

  if exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = '23'
  ) then
    v_parent := '23';
  end if;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, is_active, description, naturaleza, requiere_tercero
  ) values
    (p_organization_id, '2365', 'Retención en la fuente', 'liability', v_parent, true,
     'Retenciones en la fuente practicadas a proveedores, por pagar', 'credito', true),
    (p_organization_id, '2367', 'Impuesto a las ventas retenido', 'liability', v_parent, true,
     'ReteIVA practicado a proveedores, por pagar', 'credito', true),
    (p_organization_id, '2368', 'Impuesto de industria y comercio retenido', 'liability', v_parent, true,
     'ReteICA practicado a proveedores, por pagar', 'credito', true)
  on conflict (organization_id, account_code) do nothing;
end;
$$;

create or replace function public.fn_asegurar_cuentas_comision_ota(p_organization_id integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_parent text;
begin
  if not exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = '2335'
  ) then
    v_parent := null;
    if exists (
      select 1 from public.chart_of_accounts
      where organization_id = p_organization_id and account_code = '23'
    ) then
      v_parent := '23';
    end if;
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active, description, naturaleza, requiere_tercero
    ) values (
      p_organization_id, '2335', 'Costos y gastos por pagar', 'liability', v_parent, true,
      'Obligaciones por costos y gastos, entre ellas la comisión por pagar a los canales de venta',
      'credito', true
    )
    on conflict (organization_id, account_code) do nothing;
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = '5235'
  ) then
    v_parent := null;
    if exists (
      select 1 from public.chart_of_accounts
      where organization_id = p_organization_id and account_code = '52'
    ) then
      v_parent := '52';
    end if;
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active, description,
      naturaleza, requiere_centro_costo
    ) values (
      p_organization_id, '5235', 'Comisiones', 'expense', v_parent, true,
      'Gasto por comisiones, entre ellas las de los canales de venta',
      'debito', true
    )
    on conflict (organization_id, account_code) do nothing;
  end if;
end;
$$;

-- Sede nueva: auxiliar numérico del nivel siguiente (14350501), no 1405-01.
-- La base del mapeo es la cuenta que usa la regla (1435 en un plan nuevo,
-- 1405 en uno que todavía no se reclasificó).
create or replace function public.fn_create_branch_subaccounts()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_preferida text;
  v_legado text;
  v_base text;
  v_nombre text;
  v_tipo text;
  v_nat text;
  v_seq integer;
  v_sub text;
  v_aux text;
begin
  for v_preferida, v_legado in
    select * from (values ('1435'::text, '1405'::text), ('6135', '6105')) as t(preferida, legado)
  loop
    v_base := null;
    if exists (
      select 1 from public.chart_of_accounts
      where organization_id = new.organization_id
        and account_code = v_preferida
        and coalesce(is_active, true)
    ) then
      v_base := v_preferida;
    elsif exists (
      select 1 from public.chart_of_accounts
      where organization_id = new.organization_id
        and account_code = v_legado
        and coalesce(is_active, true)
    ) then
      v_base := v_legado;
    else
      continue;
    end if;

    select name, type, naturaleza
      into v_nombre, v_tipo, v_nat
    from public.chart_of_accounts
    where organization_id = new.organization_id
      and account_code = v_base;

    v_sub := v_base || '05';
    insert into public.chart_of_accounts (
      account_code, organization_id, name, type, parent_code, is_active, description,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
    ) values (
      v_sub, new.organization_id,
      v_nombre || ' por sede',
      v_tipo, v_base, true,
      'Subcuenta de sedes. El movimiento va al auxiliar.',
      v_nat, false, false,
      left(v_base, 1) in ('5', '6', '7')
    )
    on conflict (organization_id, account_code) do nothing;

    select coalesce(max(n), 0) + 1 into v_seq
    from (
      select case
        when sub_account_code ~ '^[0-9]{8}$' then right(sub_account_code, 2)::int
        when split_part(sub_account_code, '-', 2) ~ '^[0-9]+$' then split_part(sub_account_code, '-', 2)::int
        else 0
      end as n
      from public.branch_account_mappings
      where organization_id = new.organization_id
        and base_account_code in (v_base, v_preferida, v_legado)
      union all
      select right(account_code, 2)::int
      from public.chart_of_accounts
      where organization_id = new.organization_id
        and account_code ~ ('^' || v_sub || '[0-9]{2}$')
    ) s;

    if v_seq > 99 then
      raise exception 'codigo_puc_invalido: no hay auxiliar libre bajo %', v_sub;
    end if;

    v_aux := v_sub || lpad(v_seq::text, 2, '0');
    insert into public.chart_of_accounts (
      account_code, organization_id, name, type, parent_code, is_active, description,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
    ) values (
      v_aux, new.organization_id,
      v_nombre || ' - ' || new.name,
      v_tipo, v_sub, true,
      'Auxiliar de la sede ' || new.name,
      v_nat, true, false,
      left(v_base, 1) in ('5', '6', '7')
    )
    on conflict (organization_id, account_code) do nothing;

    insert into public.branch_account_mappings (
      organization_id, branch_id, base_account_code, sub_account_code
    ) values (
      new.organization_id, new.id, v_base, v_aux
    )
    on conflict (organization_id, branch_id, base_account_code) do nothing;
  end loop;
  return new;
end;
$$;

-- Reglas de una organización nueva. Misma lista que el plan COL, con los
-- códigos del decreto: venta 4135, devolución 4175, IVA 2408, mercancía 1435,
-- proveedor 2205, costo 6135. No actualiza las reglas de quien ya tiene.
create or replace function public.fn_create_default_accounting_rules(org_id integer, country_code text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.fn_assert_acceso_org(org_id);
  if country_code is null then
    null;
  end if;
  if exists (select 1 from public.accounting_rules where organization_id = org_id) then
    return;
  end if;

  insert into public.accounting_rules (
    organization_id, name, description, source_type, event_type,
    debit_account_code, credit_account_code, tax_account_code,
    use_tax_from_document, priority, is_active
  ) values
    (org_id, 'Venta a Credito', 'Facturacion de venta a credito', 'sale', 'created', '1305', '4135', '2408', true, 10, true),
    (org_id, 'Venta de Contado', 'Facturacion de venta al contado', 'sale', 'created', '1105', '4135', '2408', true, 11, true),
    (org_id, 'Cobro de Factura', 'Cobro de factura de cliente', 'sale_payment', 'paid', '1110', '1305', null, false, 20, true),
    (org_id, 'Cobro Parcial', 'Cobro parcial de factura', 'sale_payment', 'partial_paid', '1110', '1305', null, false, 21, true),
    (org_id, 'Compra a Credito', 'Compra de mercancia a credito', 'purchase', 'created', '1435', '2205', '2408', true, 10, true),
    (org_id, 'Compra de Contado', 'Compra de mercancia al contado', 'purchase', 'created', '1435', '1110', '2408', true, 11, true),
    (org_id, 'Pago a Proveedor', 'Pago a proveedor', 'purchase_payment', 'paid', '2205', '1110', null, false, 20, true),
    (org_id, 'Salida de Inventario (CMV)', 'Costo de mercancia vendida', 'inventory', 'adjusted', '6135', '1435', null, false, 30, true),
    (org_id, 'Pago de Nomina', 'Pago de nomina (cancela pasivo)', 'payroll', 'paid', '2505', '1110', null, false, 10, true),
    (org_id, 'Nomina por Pagar', 'Provision de nomina', 'payroll', 'created', '5105', '2505', null, false, 11, true),
    (org_id, 'Seguridad Social Empleador', 'Aportes a seguridad social (patronal)', 'payroll', 'created', '5195', '2370', null, false, 12, true),
    (org_id, 'Gasto Administrativo', 'Registro de gasto administrativo', 'expense', 'created', '5105', '1110', null, false, 13, true),
    (org_id, 'Devolucion de Venta', 'Nota credito por devolucion', 'sale_credit_note', 'created', '4175', '1305', '2408', true, 25, true),
    (org_id, 'Anulacion de Venta', 'Anulacion de factura', 'sale', 'voided', '4175', '1305', '2408', true, 26, true),
    (org_id, 'Reembolso a Cliente', 'Reembolso de pago a cliente', 'refund', 'refunded', '4175', '1110', null, false, 27, true),
    (org_id, 'Conciliacion Bancaria', 'Ajuste por conciliacion bancaria', 'bank', 'adjusted', '1110', '4250', null, false, 28, true),
    (org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5105', '1105', null, false, 30, true),
    (org_id, 'Movimiento de Caja', 'Movimiento de caja', 'cash_movement', 'created', '1105', '4135', null, false, 30, true),
    (org_id, 'Ajuste Inventario Ganancia', 'Ajuste positivo de inventario', 'inventory_adjustment', 'gain', '1435', '4250', null, false, 30, true),
    (org_id, 'Ajuste Inventario Perdida', 'Ajuste negativo de inventario', 'inventory_adjustment', 'loss', '5150', '1435', null, false, 31, true),
    (org_id, 'Orden de Compra Recibida', 'Recepcion de orden de compra', 'purchase_order', 'received', '1435', '2205', '2408', true, 30, true),
    (org_id, 'Membresia', 'Ingreso por membresia', 'membership', 'created', '1105', '4250', null, false, 30, true),
    (org_id, 'Sesion Parqueadero', 'Ingreso por sesion de parqueadero', 'parking', 'closed', '1105', '4235', null, false, 30, true),
    (org_id, 'Pase Parqueadero', 'Ingreso por pase de parqueadero', 'parking_pass', 'paid', '1105', '4235', null, false, 30, true),
    (org_id, 'Prestamo Empleado', 'Desembolso de prestamo a trabajador', 'loan', 'paid', '1365', '1105', null, false, 30, true),
    (org_id, 'Cuota Prestamo', 'Abono de prestamo a trabajador', 'installment', 'paid', '1105', '1365', null, false, 30, true),
    (org_id, 'Manifiesto Despacho', 'Manifiesto de transporte', 'manifest', 'created', '1435', '1110', null, false, 30, true),
    (org_id, 'Envio', 'Costo de envio', 'shipment', 'created', '5105', '1110', null, false, 30, true),
    (org_id, 'Viaje', 'Ingreso por viaje', 'trip', 'created', '1105', '4135', null, false, 30, true),
    (org_id, 'Incidente Transporte', 'Gasto por incidente de transporte', 'transport_incident', 'created', '5105', '1110', null, false, 30, true),
    (org_id, 'Cargo Folio Alimentos', 'Cargo a folio por alimentos', 'folio_item', 'created', '1305', '4110', null, false, 30, true),
    (org_id, 'Cargo Folio Servicios', 'Cargo a folio por servicios', 'folio_item', 'created', '1305', '4115', null, false, 31, true),
    (org_id, 'Pago Folio', 'Pago de folio', 'folio_payment', 'paid', '1105', '1305', null, false, 30, true),
    (org_id, 'Comision OTA', 'Comision del canal: gasto contra cuenta por pagar al canal', 'ota_commission', 'confirmed', '5235', '2335', null, false, 30, true),
    (org_id, 'Mantenimiento', 'Gasto de mantenimiento', 'maintenance', 'created', '5105', '1110', null, false, 30, true),
    (org_id, 'Reserva Confirmada', 'Reserva confirmada', 'reservation', 'confirmed', '1305', '4250', null, false, 30, true),
    (org_id, 'Costo Patronal', 'Provision de seguridad social patronal al aprobar el periodo', 'payroll_period', 'created', '5195', '2370', null, false, 5, true),
    (org_id, 'Pago Costo Patronal', 'Pago de obligaciones patronales al cerrar el periodo', 'payroll_period', 'paid', '2370', '1110', null, false, 5, true);
end;
$$;

revoke all on function public.fn_create_default_chart_of_accounts(integer, text) from public, anon;
revoke all on function public.fn_create_default_accounting_rules(integer, text) from public, anon;
revoke all on function public.fn_add_module_accounts(integer, text) from public, anon;
grant execute on function public.fn_create_default_chart_of_accounts(integer, text) to authenticated, service_role;
grant execute on function public.fn_create_default_accounting_rules(integer, text) to authenticated, service_role;
grant execute on function public.fn_add_module_accounts(integer, text) to authenticated, service_role;

revoke all on function public.fn_asegurar_cuenta_anticipos(integer) from public, anon, authenticated;
revoke all on function public.fn_asegurar_cuentas_retencion(integer) from public, anon, authenticated;
revoke all on function public.fn_asegurar_cuentas_comision_ota(integer) from public, anon, authenticated;
grant execute on function public.fn_asegurar_cuenta_anticipos(integer) to service_role;
grant execute on function public.fn_asegurar_cuentas_retencion(integer) to service_role;
grant execute on function public.fn_asegurar_cuentas_comision_ota(integer) to service_role;

-- Si la cuenta de la regla ya es de título (es_movimiento false), el asiento
-- usa el auxiliar de la sede. Un null legado no se sustituye: las
-- organizaciones actuales siguen contabilizando en la misma cuenta.
-- Sin auxiliar, no se inserta la línea: se registra el fallo y se devuelve
-- null, igual que una cuenta inexistente. El disparador de journal_lines
-- sigue siendo la red por si alguien inserta la línea directo.

create or replace function public.fn_puc_cuenta_de_sede(
  p_organization_id integer,
  p_branch_id integer,
  p_cuenta text
) returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_mov boolean;
  v_sub text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_cuenta is null then
    return null;
  end if;

  select es_movimiento into v_mov
  from public.chart_of_accounts
  where organization_id = p_organization_id
    and account_code = p_cuenta;

  if v_mov is distinct from false or p_branch_id is null then
    return p_cuenta;
  end if;

  select sub_account_code into v_sub
  from public.branch_account_mappings
  where organization_id = p_organization_id
    and branch_id = p_branch_id
    and base_account_code = p_cuenta
  limit 1;

  if v_sub is not null and exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id
      and account_code = v_sub
      and es_movimiento is distinct from false
  ) then
    return v_sub;
  end if;

  return p_cuenta;
end;
$$;

create or replace function public.fn_create_journal_entry(
  p_organization_id integer,
  p_branch_id integer,
  p_entry_date timestamp with time zone,
  p_memo text,
  p_source text,
  p_source_id text,
  p_debit_account text,
  p_credit_account text,
  p_amount numeric,
  p_tax_account text default null,
  p_tax_amount numeric default 0,
  p_created_by uuid default null,
  p_tax_is_credit boolean default false,
  p_fact_key text default null
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_entry_id integer;
  v_branch_id integer;
begin
  if p_fact_key is not null then
    select id into v_entry_id
    from journal_entries
    where organization_id = p_organization_id and fact_key = p_fact_key
    limit 1;

    if v_entry_id is not null then
      return v_entry_id;
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'amount_invalid', 'Importe nulo o no positivo');
    return null;
  end if;

  if p_debit_account is null or p_credit_account is null then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'account_null', 'La regla contable no trae cuenta de debito o de credito');
    return null;
  end if;

  if p_debit_account = p_credit_account then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'same_account', 'Debito y credito sobre la misma cuenta ' || p_debit_account);
    return null;
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_debit_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'debit_account_missing', 'La cuenta de debito ' || p_debit_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_credit_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'credit_account_missing', 'La cuenta de credito ' || p_credit_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if p_tax_account is not null and p_tax_amount > 0 and not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_tax_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'tax_account_missing', 'La cuenta de impuesto ' || p_tax_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not fn_is_period_open(p_organization_id, p_entry_date::date) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'period_closed', 'Periodo contable cerrado para la fecha ' || p_entry_date::date);
    return null;
  end if;

  if p_branch_id is null or p_branch_id = 0 or not exists (
    select 1 from branches where id = p_branch_id and organization_id = p_organization_id
  ) then
    select id into v_branch_id
    from branches
    where organization_id = p_organization_id and is_main = true and is_active = true
    limit 1;

    if v_branch_id is null then
      select min(id) into v_branch_id from branches where organization_id = p_organization_id;
    end if;
  else
    v_branch_id := p_branch_id;
  end if;

  p_debit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_debit_account);
  p_credit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_credit_account);
  if p_tax_account is not null then
    p_tax_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_tax_account);
  end if;

  if exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id
      and account_code in (p_debit_account, p_credit_account)
      and es_movimiento is false
  ) or (
    p_tax_account is not null and coalesce(p_tax_amount, 0) > 0 and exists (
      select 1 from chart_of_accounts
      where organization_id = p_organization_id
        and account_code = p_tax_account
        and es_movimiento is false
    )
  ) then
    perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'cuenta_no_es_de_movimiento', 'La cuenta es de titulo y no recibe asientos');
    return null;
  end if;

  begin
    insert into journal_entries (
      organization_id, branch_id, entry_date, memo,
      source, source_id, posted, created_by, fact_key
    ) values (
      p_organization_id, v_branch_id, p_entry_date, p_memo,
      p_source, p_source_id, true, p_created_by, p_fact_key
    ) returning id into v_entry_id;
  exception when unique_violation then
    if p_fact_key is null then
      raise;
    end if;

    select id into v_entry_id
    from journal_entries
    where organization_id = p_organization_id and fact_key = p_fact_key
    limit 1;
    return v_entry_id;
  end;

  if p_tax_is_credit then
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_debit_account, p_memo, p_amount, 0);

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount);
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount - coalesce(p_tax_amount, 0));
  else
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_debit_account, p_memo, p_amount - coalesce(p_tax_amount, 0), 0);

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0);
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount);
  end if;

  return v_entry_id;
end;
$$;

revoke all on function public.fn_puc_cuenta_de_sede(integer, integer, text) from public, anon, authenticated;
grant execute on function public.fn_puc_cuenta_de_sede(integer, integer, text) to service_role;
