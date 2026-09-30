-- Reversión de 20260930233000_reportes_v2_consultas_nuevas.
--
-- Borra las once funciones nuevas. No toca datos. Los reportes del frontend
-- que las llaman (contabilidad, tesorería, inventario valorizado, compras y
-- rentabilidad por producto) fallarán hasta revertir también su código.

drop function if exists public.fn_reporte_balance_prueba(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_reporte_libro_diario_origen(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_reporte_gastos_naturaleza(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_reporte_periodo_fiscal(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_reporte_resultados_desglose(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_reporte_bancos_conciliacion(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_reporte_caja_bancos_diario(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_reporte_rentabilidad_producto(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_reporte_movimiento_valorizado(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_reporte_compras_proveedor(bigint, timestamptz, timestamptz, bigint);
drop function if exists public.fn_reporte_ordenes_compra(bigint, timestamptz, timestamptz, bigint);
