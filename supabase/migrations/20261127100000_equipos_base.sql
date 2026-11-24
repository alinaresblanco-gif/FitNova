begin;

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  responsable_id uuid not null unique references public.profesionales(id) on delete restrict,
  creado_en timestamptz not null default now()
);

create table public.equipo_miembros (
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  rol text not null check (rol in ('entrenador', 'nutricionista', 'recepcion')),
  creado_en timestamptz not null default now(),
  primary key (equipo_id, profesional_id)
);

create table public.equipo_invitaciones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  rol text not null check (rol in ('entrenador', 'nutricionista', 'recepcion')),
  token_hash text not null unique,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'cancelada')),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  aceptada_en timestamptz,
  check (expira_en > creado_en),
  check ((estado = 'aceptada') = (aceptada_en is not null))
);

create unique index equipo_invitacion_pendiente_idx
  on public.equipo_invitaciones (equipo_id, email) where estado = 'pendiente';

alter table public.profesional_cliente
  add column asignacion_independiente boolean not null default true;

create table public.equipo_asignaciones (
  equipo_id uuid not null,
  profesional_id uuid not null,
  relacion_id uuid not null references public.profesional_cliente(id) on delete cascade,
  primary key (equipo_id, profesional_id, relacion_id),
  foreign key (equipo_id, profesional_id)
    references public.equipo_miembros(equipo_id, profesional_id) on delete restrict
);

alter table public.equipos enable row level security;
alter table public.equipo_miembros enable row level security;
alter table public.equipo_invitaciones enable row level security;
alter table public.equipo_asignaciones enable row level security;
revoke all on public.equipos, public.equipo_miembros, public.equipo_invitaciones, public.equipo_asignaciones from public, anon, authenticated;
grant select on public.equipos, public.equipo_miembros to authenticated;
grant select (id, equipo_id, email, rol, estado, creado_en, expira_en, aceptada_en)
  on public.equipo_invitaciones to authenticated;
grant all on public.equipos, public.equipo_miembros, public.equipo_invitaciones, public.equipo_asignaciones to service_role;

create function public.es_responsable_equipo(p_equipo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipos
    where id = p_equipo and responsable_id = public.profesional_actual_id());
$$;
create function public.es_miembro_equipo(p_equipo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipo_miembros
    where equipo_id = p_equipo and profesional_id = public.profesional_actual_id());
$$;
revoke all on function public.es_responsable_equipo(uuid), public.es_miembro_equipo(uuid) from public, anon;
grant execute on function public.es_responsable_equipo(uuid), public.es_miembro_equipo(uuid) to authenticated;

create policy equipos_leer on public.equipos for select to authenticated
  using (public.es_responsable_equipo(id) or public.es_miembro_equipo(id));
create policy equipo_miembros_leer on public.equipo_miembros for select to authenticated
  using (public.es_responsable_equipo(equipo_id) or profesional_id = public.profesional_actual_id());
create policy equipo_invitaciones_leer on public.equipo_invitaciones for select to authenticated
  using (public.es_responsable_equipo(equipo_id));

create function public.equipo_invitar(p_email text, p_rol text)
returns table (invitacion_id uuid, token text, expira_en timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_equipo uuid;
  v_email text := lower(btrim(p_email));
  v_token text;
  v_id uuid;
  v_expira timestamptz := now() + interval '7 days';
begin
  if v_profesional is null then raise exception 'Se necesita un perfil profesional.'; end if;
  if v_email is null or length(v_email) not between 3 and 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    then raise exception 'Correo no válido.'; end if;
  if p_rol is null or p_rol not in ('entrenador', 'nutricionista', 'recepcion')
    then raise exception 'Rol no válido.'; end if;
  if exists (select 1 from public.profesionales where id = v_profesional and lower(btrim(email)) = v_email)
    then raise exception 'No puedes invitarte a ti mismo.'; end if;

  insert into public.equipos (responsable_id) values (v_profesional)
    on conflict (responsable_id) do update set responsable_id = excluded.responsable_id
    returning id into v_equipo;
  if exists (select 1 from public.equipo_miembros m join public.profesionales p on p.id = m.profesional_id
    where m.equipo_id = v_equipo and lower(btrim(p.email)) = v_email)
    then raise exception 'Este profesional ya pertenece al equipo.'; end if;

  update public.equipo_invitaciones set estado = 'cancelada'
    where equipo_id = v_equipo and email = v_email and estado = 'pendiente';
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.equipo_invitaciones (equipo_id, email, rol, token_hash, expira_en)
    values (v_equipo, v_email, p_rol, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expira)
    returning id into v_id;
  return query select v_id, v_token, v_expira;
end;
$$;

create function public.equipo_aceptar_invitacion(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_email text;
  v_inv public.equipo_invitaciones%rowtype;
begin
  if v_profesional is null then raise exception 'Se necesita un perfil profesional.'; end if;
  select lower(btrim(email)) into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.equipo_invitaciones
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_inv.estado <> 'pendiente' or v_inv.expira_en <= now()
    then raise exception 'Invitación no válida, utilizada o caducada.'; end if;
  if v_email is distinct from v_inv.email then raise exception 'La invitación corresponde a otro correo.'; end if;
  if exists (select 1 from public.equipos where id = v_inv.equipo_id and responsable_id = v_profesional)
    then raise exception 'El responsable no puede incorporarse como colaborador.'; end if;
  insert into public.equipo_miembros (equipo_id, profesional_id, rol)
    values (v_inv.equipo_id, v_profesional, v_inv.rol);
  update public.equipo_invitaciones set estado = 'aceptada', aceptada_en = now() where id = v_inv.id;
  return v_inv.equipo_id;
end;
$$;

create function public.equipo_cancelar_invitacion(p_invitacion uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.equipo_invitaciones set estado = 'cancelada'
    where id = p_invitacion and estado = 'pendiente' and public.es_responsable_equipo(equipo_id);
  if not found then raise exception 'Invitación pendiente no encontrada o sin permiso.'; end if;
end;
$$;

create function public.equipo_asignar_cliente(p_miembro uuid, p_cliente uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_equipo uuid;
  v_rol text;
  v_relacion uuid;
begin
  select e.id, m.rol into v_equipo, v_rol
    from public.equipos e join public.equipo_miembros m on m.equipo_id = e.id
    where e.responsable_id = public.profesional_actual_id() and m.profesional_id = p_miembro
    for update of m;
  if v_equipo is null then raise exception 'Colaborador no encontrado en tu equipo.'; end if;
  if not exists (select 1 from public.profesional_cliente pc where pc.cliente_id = p_cliente
    and pc.profesional_id = public.profesional_actual_id() and pc.asignacion_independiente
    and pc.rol in ('entrenador', 'nutricionista')) then
    raise exception 'Solo puedes asignar clientes propios.';
  end if;
  insert into public.profesional_cliente (cliente_id, profesional_id, rol, asignacion_independiente)
    values (p_cliente, p_miembro, v_rol, false)
    on conflict (cliente_id, profesional_id, rol) do nothing;
  select id into v_relacion from public.profesional_cliente
    where cliente_id = p_cliente and profesional_id = p_miembro and rol = v_rol for update;
  insert into public.equipo_asignaciones (equipo_id, profesional_id, relacion_id)
    values (v_equipo, p_miembro, v_relacion) on conflict do nothing;
end;
$$;

create function public.equipo_retirar_cliente(p_miembro uuid, p_cliente uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_equipo uuid;
  v_relacion uuid;
  v_eliminada uuid;
begin
  select e.id into v_equipo from public.equipos e
    join public.equipo_miembros m on m.equipo_id = e.id
    where e.responsable_id = public.profesional_actual_id() and m.profesional_id = p_miembro
    for update of m;
  if v_equipo is null then raise exception 'Colaborador no encontrado en tu equipo.'; end if;
  lock table public.profesional_cliente in share row exclusive mode;
  select a.relacion_id into v_relacion from public.equipo_asignaciones a
    join public.profesional_cliente pc on pc.id = a.relacion_id
    where a.equipo_id = v_equipo and a.profesional_id = p_miembro and pc.cliente_id = p_cliente
    for update of pc;
  if v_relacion is null then raise exception 'Asignación del equipo no encontrada.'; end if;
  delete from public.equipo_asignaciones where equipo_id = v_equipo
    and profesional_id = p_miembro and relacion_id = v_relacion;
  delete from public.profesional_cliente pc where pc.id = v_relacion and not pc.asignacion_independiente
    and not exists (select 1 from public.equipo_asignaciones a where a.relacion_id = pc.id)
    returning pc.id into v_eliminada;
  if v_eliminada is not null and not exists (select 1 from public.profesional_cliente
    where profesional_id = p_miembro and cliente_id = p_cliente) then
    update public.sesiones set estado = 'cancelada'
      where profesional_id = p_miembro and cliente_id = p_cliente
        and estado = 'programada' and inicio > now();
  end if;
end;
$$;

create function public.sesion_exige_asignacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'programada' then
    perform 1 from public.profesional_cliente where profesional_id = new.profesional_id
      and cliente_id = new.cliente_id for key share;
    if not found then raise exception 'La sesión requiere un profesional asignado al cliente.'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sesion_exige_asignacion() from public, anon, authenticated;
create trigger sesion_asignacion_vigente before insert or update on public.sesiones
  for each row execute function public.sesion_exige_asignacion();

create function public.equipo_retirar_miembro(p_miembro uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_equipo uuid;
  v_cliente uuid;
begin
  select e.id into v_equipo from public.equipos e
    join public.equipo_miembros m on m.equipo_id = e.id
    where e.responsable_id = public.profesional_actual_id() and m.profesional_id = p_miembro
    for update of m;
  if v_equipo is null then raise exception 'Colaborador no encontrado en tu equipo.'; end if;
  for v_cliente in select pc.cliente_id from public.equipo_asignaciones a
    join public.profesional_cliente pc on pc.id = a.relacion_id
    where a.equipo_id = v_equipo and a.profesional_id = p_miembro
  loop
    perform public.equipo_retirar_cliente(p_miembro, v_cliente);
  end loop;
  delete from public.equipo_miembros where equipo_id = v_equipo and profesional_id = p_miembro;
end;
$$;

create function public.equipo_listar()
returns table (profesional_id uuid, nombre text, email text, rol text, clientes bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, btrim(p.nombre || ' ' || coalesce(p.apellidos,'')), p.email::text, m.rol,
    count(a.relacion_id)
  from public.equipos e join public.equipo_miembros m on m.equipo_id = e.id
    join public.profesionales p on p.id = m.profesional_id
    left join public.equipo_asignaciones a on a.equipo_id = m.equipo_id and a.profesional_id = m.profesional_id
  where e.responsable_id = public.profesional_actual_id()
  group by p.id, p.nombre, p.apellidos, p.email, m.rol
  order by 2;
$$;

create function public.equipo_clientes(p_miembro uuid)
returns table (cliente_id uuid, nombre text, asignado boolean)
language sql stable security definer set search_path = '' as $$
  select distinct c.id, btrim(c.nombre || ' ' || coalesce(c.apellidos,'')),
    exists (select 1 from public.equipo_asignaciones a
      join public.profesional_cliente r on r.id = a.relacion_id
      where a.equipo_id = e.id and a.profesional_id = p_miembro and r.cliente_id = c.id)
  from public.equipos e join public.equipo_miembros m on m.equipo_id = e.id and m.profesional_id = p_miembro
    join public.profesional_cliente pc on pc.profesional_id = e.responsable_id
      and pc.asignacion_independiente and pc.rol in ('entrenador','nutricionista')
    join public.clientes c on c.id = pc.cliente_id
  where e.responsable_id = public.profesional_actual_id()
  order by 2;
$$;

create or replace function public.crear_invitacion(p_nombre varchar(100), p_email varchar(254))
returns table (invitacion_id uuid, token text, expira_en timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_profesional_id uuid := public.profesional_actual_id();
  v_email text := lower(btrim(p_email));
  v_cliente_id uuid;
  v_estado text;
  v_token text;
  v_invitacion_id uuid;
  v_expiracion timestamptz := now() + interval '7 days';
begin
  if v_profesional_id is null then
    raise exception 'No autorizado: el usuario actual no es un profesional registrado';
  end if;
  select c.id, c.estado into v_cliente_id, v_estado from public.clientes c
    where lower(btrim(c.email)) = v_email;
  if v_cliente_id is null then
    insert into public.clientes (nombre, email, estado)
      values (p_nombre, v_email, 'invitacion_enviada') returning public.clientes.id into v_cliente_id;
  else
    if v_estado = 'activo' then raise exception 'Ya existe un cliente activo con ese email'; end if;
    update public.clientes c set estado = 'invitacion_enviada', nombre = p_nombre, actualizado_en = now()
      where c.id = v_cliente_id;
  end if;
  insert into public.profesional_cliente (cliente_id, profesional_id, rol, asignacion_independiente)
    values (v_cliente_id, v_profesional_id, 'entrenador', true)
    on conflict (cliente_id, profesional_id, rol) do update set asignacion_independiente = true;
  update public.invitaciones i set estado = 'cancelada'
    where i.cliente_id = v_cliente_id and i.estado in ('pendiente', 'enviada');
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitaciones (cliente_id, profesional_id, token_hash, email_destino,
    estado, fecha_envio, fecha_expiracion)
    values (v_cliente_id, v_profesional_id, encode(extensions.digest(v_token, 'sha256'), 'hex'),
      v_email, 'enviada', now(), v_expiracion) returning public.invitaciones.id into v_invitacion_id;
  return query select v_invitacion_id, v_token, v_expiracion;
end;
$$;

revoke all on function public.equipo_invitar(text,text), public.equipo_aceptar_invitacion(text),
  public.equipo_cancelar_invitacion(uuid), public.equipo_asignar_cliente(uuid,uuid),
  public.equipo_retirar_cliente(uuid,uuid), public.equipo_retirar_miembro(uuid),
  public.equipo_listar(), public.equipo_clientes(uuid) from public, anon;
grant execute on function public.equipo_invitar(text,text), public.equipo_aceptar_invitacion(text),
  public.equipo_cancelar_invitacion(uuid), public.equipo_asignar_cliente(uuid,uuid),
  public.equipo_retirar_cliente(uuid,uuid), public.equipo_retirar_miembro(uuid),
  public.equipo_listar(), public.equipo_clientes(uuid) to authenticated;

commit;
