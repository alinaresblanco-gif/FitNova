begin;

create function public.eliminar_sesion(p_sesion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profesional_id uuid := public.profesional_actual_id();
  v_cliente_id uuid;
begin
  if v_profesional_id is null then
    raise exception 'No autorizado: se necesita un perfil profesional';
  end if;

  delete from public.sesiones s
  where s.id = p_sesion_id and s.profesional_id = v_profesional_id
    and exists (
      select 1 from public.profesional_cliente pc
      where pc.profesional_id = v_profesional_id and pc.cliente_id = s.cliente_id
    )
  returning s.cliente_id into v_cliente_id;

  if v_cliente_id is null then
    raise exception 'Sesión no disponible para eliminar: comprueba permisos';
  end if;

  perform public.crear_aviso('cliente', v_cliente_id, 'agenda',
    'Se ha eliminado una cita de tu agenda.', null, v_cliente_id);
end;
$$;

revoke all on function public.eliminar_sesion(uuid) from public, anon, authenticated;
grant execute on function public.eliminar_sesion(uuid) to authenticated;

commit;
