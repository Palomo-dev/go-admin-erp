-- Revierte 20261023084931_centros_costo_siembra.
-- Quita el disparador que mantiene sincronizado el modo con el booleano y las
-- funciones de resolución y de siembra interna. Restaura fn_exigencias_cuenta
-- al cuerpo de 20261022020232_comprobantes_asientos_catalogo, que lee el
-- booleano sin mirar si la organización tiene centros activos.
-- Hay que correrlo antes del rollback de 20261023080217: si el disparador
-- sigue puesto, restaurar el booleano volvería a reescribir el modo.
-- Antes también hay que revertir los parches, porque esas funciones todavía
-- llaman a fn_centro_para_cuenta y a fn_centro_defecto.

do $orden$
begin
  if to_regprocedure('public.fn_create_journal_entry(integer,integer,timestamptz,text,text,text,text,text,numeric,text,numeric,uuid,boolean,text,uuid,text)') is not null
     and position('fn_centro_para_cuenta' in pg_get_functiondef('public.fn_create_journal_entry(integer,integer,timestamptz,text,text,text,text,text,numeric,text,numeric,uuid,boolean,text,uuid,text)'::regprocedure)) > 0 then
    raise exception 'Revierte primero 20261023085110_centros_costo_parches';
  end if;
end
$orden$;

drop trigger if exists trg_sync_centro_costo_modo on public.chart_of_accounts;
drop trigger if exists trg_sync_centro_costo_modo on public.puc_plantilla;

drop function if exists public.fn_sembrar_centros_costo_interno(integer, text, boolean);
drop function if exists public.fn_centro_asegurar(integer, text, text, uuid, integer, smallint, text, text, boolean, boolean);
drop function if exists public.fn_centro_documento(integer, integer, text, uuid);
drop function if exists public.fn_centro_para_cuenta(integer, integer, text, uuid, text);
drop function if exists public.fn_centro_defecto(integer, integer);
drop function if exists public.fn_modo_centro(integer, text);
drop function if exists public.fn_sync_centro_costo_modo();

create or replace function public.fn_exigencias_cuenta(
  p_organization_id integer,
  p_cuenta text,
  out requiere_tercero boolean,
  out requiere_centro_costo boolean
) returns record
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(a.requiere_tercero, false), coalesce(a.requiere_centro_costo, false)
    from public.chart_of_accounts a
   where a.organization_id = p_organization_id
     and a.account_code = nullif(btrim(p_cuenta), '');
$fn$;

revoke all on function public.fn_exigencias_cuenta(integer, text) from public, anon, authenticated;
