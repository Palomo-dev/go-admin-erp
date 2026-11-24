-- Reversión de 20261123195525_ventas_nombre_modulo: vuelve el nombre de antes.
update public.modules
   set name = 'Ventas (POS)',
       description = null
 where code = 'pos';
