begin;

create function public.manager_dashboard_contadores()
returns table (activos bigint, leads bigint, invitaciones bigint)
language sql stable security invoker set search_path = '' as $$
  select
    (select count(*) from public.clientes where estado = 'activo'),
    (select count(*) from public.clientes where estado = 'lead'),
    (select count(*) from public.invitaciones
      where estado in ('pendiente', 'enviada') and fecha_expiracion > now());
$$;
revoke all on function public.manager_dashboard_contadores() from public, anon;
grant execute on function public.manager_dashboard_contadores() to authenticated;

commit;
