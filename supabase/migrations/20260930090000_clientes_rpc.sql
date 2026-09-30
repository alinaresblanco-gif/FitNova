begin;

create extension if not exists pgcrypto with schema extensions;

-- Devuelve el id de profesionales.id ligado al usuario autenticado actual, o null.
create or replace function public.profesional_actual_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profesionales p
  where p.auth_user_id = (select auth.uid());
$$;

revoke all on function public.profesional_actual_id() from public;
grant execute on function public.profesional_actual_id() to authenticated;

-- Autorregistro único del profesional autenticado (MVP: sin invitación de equipo todavía).
create or replace function public.registrar_profesional_actual(
  p_nombre varchar(100),
  p_apellidos varchar(150),
  p_rol text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_rol not in ('administrador', 'entrenador', 'nutricionista', 'colaborador') then
    raise exception 'Rol no válido';
  end if;

  select id into v_id from public.profesionales where auth_user_id = v_uid;
  if v_id is not null then
    return v_id;
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.profesionales (auth_user_id, nombre, apellidos, email, rol)
  values (v_uid, p_nombre, p_apellidos, lower(btrim(v_email)), p_rol)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.registrar_profesional_actual(varchar, varchar, text) from public;
grant execute on function public.registrar_profesional_actual(varchar, varchar, text) to authenticated;

-- Crea (o reutiliza) un cliente en estado "invitacion_enviada" y devuelve el token en claro una sola vez.
create or replace function public.crear_invitacion(
  p_nombre varchar(100),
  p_email varchar(254)
)
returns table (invitacion_id uuid, cliente_id uuid, token text, fecha_expiracion timestamptz)
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

  select id, estado into v_cliente_id, v_estado
  from public.clientes
  where lower(btrim(email)) = v_email;

  if v_cliente_id is null then
    insert into public.clientes (nombre, email, estado)
    values (p_nombre, v_email, 'invitacion_enviada')
    returning id into v_cliente_id;
  else
    if v_estado = 'activo' then
      raise exception 'Ya existe un cliente activo con ese email';
    end if;
    update public.clientes
      set estado = 'invitacion_enviada', nombre = p_nombre, actualizado_en = now()
      where id = v_cliente_id;
  end if;

  insert into public.profesional_cliente (cliente_id, profesional_id, rol)
  values (v_cliente_id, v_profesional_id, 'entrenador')
  on conflict (cliente_id, profesional_id, rol) do nothing;

  update public.invitaciones
    set estado = 'cancelada'
    where cliente_id = v_cliente_id
      and estado in ('pendiente', 'enviada');

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
  returning id into v_invitacion_id;

  return query select v_invitacion_id, v_cliente_id, v_token, v_expiracion;
end;
$$;

revoke all on function public.crear_invitacion(varchar, varchar) from public;
grant execute on function public.crear_invitacion(varchar, varchar) to authenticated;

-- Valida un token de invitación (llamable sin sesión, desde FitNova Go) y devuelve datos mínimos para el onboarding.
create or replace function public.obtener_invitacion(p_token text)
returns table (
  invitacion_id uuid,
  cliente_id uuid,
  nombre varchar(100),
  email varchar(254),
  estado text,
  fecha_expiracion timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash char(64) := encode(extensions.digest(p_token, 'sha256'), 'hex');
begin
  return query
    select i.id, c.id, c.nombre, c.email, i.estado, i.fecha_expiracion
    from public.invitaciones i
    join public.clientes c on c.id = i.cliente_id
    where i.token_hash = v_hash
      and i.estado in ('pendiente', 'enviada')
      and i.fecha_expiracion > now();

  if not found then
    raise exception 'Invitación no válida, ya usada o caducada';
  end if;
end;
$$;

revoke all on function public.obtener_invitacion(text) from public;
grant execute on function public.obtener_invitacion(text) to anon, authenticated;

-- Finaliza el onboarding de Go de forma atómica: perfil, objetivo, PAR-Q, medida inicial y consentimientos.
create or replace function public.completar_onboarding(
  p_token text,
  p_apellidos varchar(150),
  p_nombre_avatar varchar(40),
  p_telefono varchar(30),
  p_fecha_nacimiento date,
  p_genero text,
  p_objetivo_tipo text,
  p_altura_cm numeric,
  p_peso_inicial_kg numeric,
  p_peso_objetivo_kg numeric,
  p_notas_objetivo text,
  p_notas_lesiones text,
  p_parq jsonb,
  p_version_terminos varchar(40),
  p_version_privacidad varchar(40)
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash char(64) := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_invitacion_id uuid;
  v_cliente_id uuid;
  v_cliente_email text;
  v_auth_email text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select i.id, i.cliente_id into v_invitacion_id, v_cliente_id
  from public.invitaciones i
  where i.token_hash = v_hash
    and i.estado in ('pendiente', 'enviada')
    and i.fecha_expiracion > now();

  if v_cliente_id is null then
    raise exception 'Invitación no válida, ya usada o caducada';
  end if;

  select lower(btrim(email)) into v_cliente_email from public.clientes where id = v_cliente_id;
  select lower(btrim(email)) into v_auth_email from auth.users where id = v_uid;

  if v_cliente_email is distinct from v_auth_email then
    raise exception 'El email de la cuenta no coincide con el de la invitación';
  end if;

  if exists (select 1 from public.clientes where auth_user_id = v_uid and id <> v_cliente_id) then
    raise exception 'Esta cuenta ya está asociada a otro cliente';
  end if;

  update public.clientes set
    auth_user_id = v_uid,
    apellidos = p_apellidos,
    nombre_avatar = p_nombre_avatar,
    telefono = p_telefono,
    fecha_nacimiento = p_fecha_nacimiento,
    genero = p_genero,
    estado = 'activo',
    fecha_activacion = now(),
    ultima_actividad = now(),
    actualizado_en = now()
  where id = v_cliente_id;

  insert into public.clientes_objetivo (
    cliente_id, objetivo_tipo, altura_cm, peso_objetivo_kg, notas_objetivo, notas_lesiones
  )
  values (
    v_cliente_id, p_objetivo_tipo, p_altura_cm, p_peso_objetivo_kg, p_notas_objetivo, p_notas_lesiones
  )
  on conflict (cliente_id) do update set
    objetivo_tipo = excluded.objetivo_tipo,
    altura_cm = excluded.altura_cm,
    peso_objetivo_kg = excluded.peso_objetivo_kg,
    notas_objetivo = excluded.notas_objetivo,
    notas_lesiones = excluded.notas_lesiones;

  insert into public.clientes_salud_parq (
    cliente_id, enfermedad_cardiaca_supervisada, dolor_pecho_actividad, dolor_pecho_reposo,
    perdida_consciencia_mareo, alteracion_osea_articular, medicacion_presion_arterial, otra_razon_medica
  )
  values (
    v_cliente_id,
    (p_parq ->> 'enfermedad_cardiaca_supervisada')::boolean,
    (p_parq ->> 'dolor_pecho_actividad')::boolean,
    (p_parq ->> 'dolor_pecho_reposo')::boolean,
    (p_parq ->> 'perdida_consciencia_mareo')::boolean,
    (p_parq ->> 'alteracion_osea_articular')::boolean,
    (p_parq ->> 'medicacion_presion_arterial')::boolean,
    (p_parq ->> 'otra_razon_medica')::boolean
  )
  on conflict (cliente_id) do update set
    enfermedad_cardiaca_supervisada = excluded.enfermedad_cardiaca_supervisada,
    dolor_pecho_actividad = excluded.dolor_pecho_actividad,
    dolor_pecho_reposo = excluded.dolor_pecho_reposo,
    perdida_consciencia_mareo = excluded.perdida_consciencia_mareo,
    alteracion_osea_articular = excluded.alteracion_osea_articular,
    medicacion_presion_arterial = excluded.medicacion_presion_arterial,
    otra_razon_medica = excluded.otra_razon_medica,
    fecha_cumplimentado = now();

  insert into public.clientes_metricas (cliente_id, fecha, peso_kg, origen)
  values (v_cliente_id, now(), p_peso_inicial_kg, 'cliente');

  insert into public.consentimientos (cliente_id, tipo, version_documento)
  values
    (v_cliente_id, 'terminos', p_version_terminos),
    (v_cliente_id, 'privacidad', p_version_privacidad)
  on conflict (cliente_id, tipo, version_documento) do nothing;

  update public.invitaciones
    set estado = 'aceptada', fecha_aceptacion = now()
    where id = v_invitacion_id;

  return v_cliente_id;
end;
$$;

revoke all on function public.completar_onboarding(
  text, varchar, varchar, varchar, date, text, text, numeric, numeric, numeric, text, text, jsonb, varchar, varchar
) from public;
grant execute on function public.completar_onboarding(
  text, varchar, varchar, varchar, date, text, text, numeric, numeric, numeric, text, text, jsonb, varchar, varchar
) to authenticated;

-- Permite a cada profesional ver las invitaciones que él mismo ha enviado.
create policy invitaciones_select_propias
  on public.invitaciones for select to authenticated
  using (
    exists (
      select 1 from public.profesionales p
      where p.id = invitaciones.profesional_id
        and p.auth_user_id = (select auth.uid())
    )
  );

commit;
