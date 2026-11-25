-- Reversión de 20261125220000_logistica_envio_fragil.
--
-- Antes de quitar la columna devuelve la marca a donde vivía (`metadata.is_fragile = true`), así
-- ningún envío marcado como frágil pierde el dato: el formulario viejo lo sigue leyendo de ahí.
-- Antes de aplicarla, retirar del ERP la lectura y escritura de `shipments.is_fragile`
-- (enviosService.ts, despachoService.ts › enviosParaGuias, DialogosEnvios.tsx).

do $reversion$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'shipments' and column_name = 'is_fragile'
  ) then
    execute $u$
      update public.shipments
         set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('is_fragile', true)
       where is_fragile = true
         and coalesce(metadata->>'is_fragile', '') <> 'true'
    $u$;
  end if;
end;
$reversion$;

alter table public.shipments drop column if exists is_fragile;
