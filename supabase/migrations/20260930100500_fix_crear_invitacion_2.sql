begin;

-- Elimina la columna "cliente_id" del resultado de crear_invitacion: no la usa el frontend
-- y su nombre colisionaba con columnas reales de invitaciones/profesional_cliente,
-- provocando "column reference is ambiguous" en varias sentencias (incluida ON CONFLICT).
drop function if exists public.crear_invitacion(varchar, varchar);

create function public.crear_invitacion(
  p_nombre varchar(100),
  p_email varchar(254)
)
returns table (invitacion_id uuid, token text, expira_en timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profesional_id uuid := public.profesional_actual_id();
  v_email text := lower(btrim(p_email));
  v_cliente_id uuid;
  v_estado text;
  v_token text;
  v_token_hash char(64);
  v_invitacion_id uuid;
  v_expiracion timestamptz := now() + interval '7 days';
begin
  if v_profesional_id is null then
    raise exception 'No autorizado: el usuario actual no es un profesional registrado';
  end if;

  select c.id, c.estado into v_cliente_id, v_estado
  from public.clientes c
  where lower(btrim(c.email)) = v_email;

  if v_cliente_id is null then
    insert into public.clientes (nombre, email, estado)
    values (p_nombre, v_email, 'invitacion_enviada')
    returning public.clientes.id into v_cliente_id;
  else
    if v_estado = 'activo' then
      raise exception 'Ya existe un cliente activo con ese email';
    end if;
    update public.clientes c
      set estado = 'invitacion_enviada', nombre = p_nombre, actualizado_en = now()
      where c.id = v_cliente_id;
  end if;

  insert into public.profesional_cliente (cliente_id, profesional_id, rol)
  values (v_cliente_id, v_profesional_id, 'entrenador')
  on conflict (cliente_id, profesional_id, rol) do nothing;

  update public.invitaciones i
    set estado = 'cancelada'
    where i.cliente_id = v_cliente_id
      and i.estado in ('pendiente', 'enviada');

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.invitaciones (
    cliente_id, profesional_id, token_hash, email_destino,
    estado, fecha_envio, fecha_expiracion
  )
  values (
    v_cliente_id, v_profesional_id, v_token_hash, v_email,
    'enviada', now(), v_expiracion
  )
  returning public.invitaciones.id into v_invitacion_id;

  return query select v_invitacion_id, v_token, v_expiracion;
end;
$$;

revoke all on function public.crear_invitacion(varchar, varchar) from public;
grant execute on function public.crear_invitacion(varchar, varchar) to authenticated;

commit;
