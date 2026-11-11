-- Catálogo del PUC: los códigos de rango libre que usa la plantilla de GO Admin (respuesta del Contador, 2026-11-10).
--
-- ESTADO: APLICADA el 2026-11-10 (registro 20261111032016) por el MCP. puc_catalogo: decreto_2650 2.503 filas,
-- plantilla_go_admin 16; 0 códigos de puc_plantilla (1, 2, 4 o 6 dígitos) fuera del catálogo.
-- Sentencias aplicadas idénticas a las de este archivo; el comentario de cabecera se aplicó abreviado.
-- Reversión: supabase/rollbacks/20261111100100_puc_catalogo_origen_plantilla_rollback.sql.
-- Fecha: 2026-11-10. Va después de 20261111100000_puc_plantilla_alineada_decreto (8505, 8605, 9505 y 9605
-- nacen ahí).
--
-- El Decreto 2650 deja rangos libres («NN01 a NN99» en grupos sin cuentas, «NNNN01 a NNNN98» en cuentas sin
-- subcuentas) para que cada ente abra sus códigos. La plantilla de GO Admin usa algunos de esos rangos. El
-- Contador decidió que se quedan y que el catálogo los muestre como «código propio de la plantilla de GO Admin»,
-- no como «no está en el PUC».
--
-- 1. Columna origen: 'decreto_2650' (las 2.503 filas cargadas por 20261110220000/220010/220020) o
--    'plantilla_go_admin'. NOT NULL con DEFAULT: aditiva, las filas existentes quedan en 'decreto_2650'.
-- 2. Filas con origen 'plantilla_go_admin', con el nombre que tienen en public.puc_plantilla:
--    · Los 10 códigos de rango libre que el Contador revisó: 240805, 240810, 370505, 613505, 7105, 7205, 7305,
--      7405, 8205, 9205.
--    · Además, las 6 cuentas hijas de los grupos de contrapartida de orden, que tras 20261111100000 son
--      igualmente códigos de rango libre (el Decreto no fija cuentas en 84, 85, 86, 94, 95 ni 96): 8405, 8505,
--      8605, 9405, 9505, 9605. Sin ellas el aviso del plan las tomaría por «no está en el PUC».
--    Todos cuelgan de un grupo o cuenta que ya está en el catálogo (2408, 3705, 6135, 71, 72, 73, 74, 82, 84,
--    85, 86, 92, 94, 95, 96); el FK de padre y la restricción puc_catalogo_padre_prefijo lo comprueban.
--
-- Seguridad: sin cambios. RLS activado, SELECT para authenticated; anon y public sin privilegios.

alter table public.puc_catalogo
  add column if not exists origen text not null default 'decreto_2650'
    constraint puc_catalogo_origen_check check (origen in ('decreto_2650', 'plantilla_go_admin'));

comment on column public.puc_catalogo.origen is
  'decreto_2650: código del Decreto 2650 de 1993. plantilla_go_admin: código de un rango libre del Decreto que usa la plantilla de GO Admin (puc_plantilla).';

do $$
declare
  v_codigos text[] := array[
    '240805', '240810', '370505', '613505', '7105', '7205', '7305', '7405', '8205', '9205',
    '8405', '8505', '8605', '9405', '9505', '9605'
  ];
  v_n integer;
begin
  insert into public.puc_catalogo (codigo, nombre, padre, origen)
  select p.codigo, p.nombre, p.padre, 'plantilla_go_admin'
    from public.puc_plantilla p
   where p.codigo = any (v_codigos)
  on conflict (codigo) do nothing;

  select count(*) into v_n
    from public.puc_catalogo
   where codigo = any (v_codigos) and origen = 'plantilla_go_admin';
  if v_n <> cardinality(v_codigos) then
    raise exception 'puc_catalogo: se esperaban % códigos de la plantilla y quedaron %', cardinality(v_codigos), v_n;
  end if;
end $$;
