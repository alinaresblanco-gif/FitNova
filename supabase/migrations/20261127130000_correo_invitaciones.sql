begin;

create table public.correo_invitacion_intentos (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id),
  tipo text not null check (tipo in ('cliente', 'equipo')),
  invitacion_id uuid not null,
  estado text not null default 'reservado' check (estado in ('reservado', 'aceptado', 'error')),
  proveedor_id text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index correo_invitacion_intentos_fecha_idx on public.correo_invitacion_intentos (creado_en);
create index correo_invitacion_intentos_profesional_idx on public.correo_invitacion_intentos (profesional_id, creado_en);
create index correo_invitacion_intentos_invitacion_idx on public.correo_invitacion_intentos (tipo, invitacion_id, creado_en);
alter table public.correo_invitacion_intentos enable row level security;
revoke all on public.correo_invitacion_intentos from public, anon, authenticated;
grant all on public.correo_invitacion_intentos to service_role;

create function public.correo_preparar_invitacion(p_usuario uuid, p_tipo text, p_invitacion uuid, p_token text)
returns table (intento_id uuid, destinatario text, ya_aceptado boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid;
  v_email text;
  v_hash text;
  v_intento uuid;
begin
  if p_tipo not in ('cliente', 'equipo') or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitación no válida.';
  end if;
  select id into v_profesional from public.profesionales where auth_user_id = p_usuario;
  if v_profesional is null then raise exception 'Invitación no válida o sin permiso.'; end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  if p_tipo = 'cliente' then
    select i.email_destino into v_email from public.invitaciones i
    where i.id = p_invitacion and i.profesional_id = v_profesional
      and i.token_hash = v_hash and i.estado in ('pendiente', 'enviada')
      and i.fecha_expiracion > now();
  else
    select i.email into v_email from public.equipo_invitaciones i
    join public.equipos e on e.id = i.equipo_id
    where i.id = p_invitacion and e.responsable_id = v_profesional
      and i.token_hash = v_hash and i.estado = 'pendiente' and i.expira_en > now();
  end if;
  if v_email is null then raise exception 'Invitación no válida o sin permiso.'; end if;

  perform pg_advisory_xact_lock(724369081);
  if exists (select 1 from public.correo_invitacion_intentos
    where tipo = p_tipo and invitacion_id = p_invitacion and estado = 'aceptado') then
    return query select null::uuid, v_email, true;
    return;
  end if;
  if exists (select 1 from public.correo_invitacion_intentos
    where tipo = p_tipo and invitacion_id = p_invitacion and estado = 'reservado'
      and creado_en > now() - interval '2 minutes') then
    raise exception 'Hay un envío en curso. Espera antes de reintentar.';
  end if;
  if (select count(*) from public.correo_invitacion_intentos
      where profesional_id = v_profesional and creado_en > now() - interval '1 hour') >= 30
    or (select count(*) from public.correo_invitacion_intentos
      where creado_en > now() - interval '1 day') >= 300 then
    raise exception 'Límite de envíos alcanzado. Comparte el enlace manualmente o inténtalo más tarde.';
  end if;
  insert into public.correo_invitacion_intentos (profesional_id, tipo, invitacion_id)
    values (v_profesional, p_tipo, p_invitacion) returning id into v_intento;
  return query select v_intento, v_email, false;
end;
$$;

create function public.correo_finalizar_intento(p_intento uuid, p_aceptado boolean, p_proveedor_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_aceptado is null or (p_aceptado and (p_proveedor_id is null or length(p_proveedor_id) > 200)) then
    raise exception 'Resultado de envío no válido.';
  end if;
  update public.correo_invitacion_intentos set
    estado = case when p_aceptado then 'aceptado' else 'error' end,
    proveedor_id = case when p_aceptado then p_proveedor_id else null end,
    actualizado_en = now()
  where id = p_intento and estado = 'reservado';
  if not found then raise exception 'Intento no encontrado.'; end if;
end;
$$;

revoke all on function public.correo_preparar_invitacion(uuid, text, uuid, text),
  public.correo_finalizar_intento(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.correo_preparar_invitacion(uuid, text, uuid, text),
  public.correo_finalizar_intento(uuid, boolean, text) to service_role;

commit;
