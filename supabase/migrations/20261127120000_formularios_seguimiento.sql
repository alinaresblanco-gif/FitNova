begin;

create table public.formularios_plantillas (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  titulo varchar(180) not null check (length(btrim(titulo)) > 0),
  preguntas jsonb not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create table public.formularios_enviados (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid references public.formularios_plantillas(id) on delete set null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  titulo varchar(180) not null,
  preguntas jsonb not null,
  respuestas jsonb,
  enviado_en timestamptz not null default now(),
  respondido_en timestamptz,
  check ((respuestas is null) = (respondido_en is null))
);
create index formularios_enviados_cliente_idx on public.formularios_enviados (cliente_id, enviado_en desc);
alter table public.formularios_plantillas enable row level security;
alter table public.formularios_enviados enable row level security;
revoke all on public.formularios_plantillas, public.formularios_enviados from public, anon, authenticated;
grant select on public.formularios_plantillas, public.formularios_enviados to authenticated;
grant all on public.formularios_plantillas, public.formularios_enviados to service_role;
create policy formularios_plantillas_leer on public.formularios_plantillas for select to authenticated
  using (profesional_id = public.profesional_actual_id());
create policy formularios_enviados_leer on public.formularios_enviados for select to authenticated
  using (public.can_access_client_health(cliente_id));

create function public.validar_preguntas_formulario(p_preguntas jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  q jsonb;
  opcion jsonb;
begin
  if jsonb_typeof(p_preguntas) is distinct from 'array' or length(p_preguntas::text) > 30000 then return false; end if;
  if jsonb_array_length(p_preguntas) not between 1 and 20 then return false; end if;
  for q in select value from jsonb_array_elements(p_preguntas) loop
    if jsonb_typeof(q) is distinct from 'object' or jsonb_typeof(q->'texto') is distinct from 'string'
      or length(btrim(q->>'texto')) not between 1 and 300
      or q->>'tipo' not in ('texto','numero','opcion') or q->>'tipo' is null
      or q - 'texto' - 'tipo' - 'opciones' <> '{}'::jsonb then return false; end if;
    if q->>'tipo' = 'opcion' then
      if jsonb_typeof(q->'opciones') is distinct from 'array' then return false; end if;
      if jsonb_array_length(q->'opciones') not between 2 and 10 then return false; end if;
      for opcion in select value from jsonb_array_elements(q->'opciones') loop
        if jsonb_typeof(opcion) is distinct from 'string'
          or length(btrim(opcion #>> '{}')) not between 1 and 100 then return false; end if;
      end loop;
      if (select count(distinct value) from jsonb_array_elements(q->'opciones')) <> jsonb_array_length(q->'opciones')
        then return false; end if;
    elsif q ? 'opciones' then return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.validar_preguntas_formulario(jsonb) from public, anon;
grant execute on function public.validar_preguntas_formulario(jsonb) to authenticated;

create function public.guardar_formulario(p_id uuid, p_titulo text, p_preguntas jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_id uuid;
begin
  if v_profesional is null then raise exception 'Se necesita un perfil profesional.'; end if;
  if p_titulo is null or length(btrim(p_titulo)) not between 1 and 180
    or not coalesce(public.validar_preguntas_formulario(p_preguntas),false)
    then raise exception 'Título o preguntas del formulario no válidos.'; end if;
  if p_id is null then
    insert into public.formularios_plantillas (profesional_id,titulo,preguntas)
      values (v_profesional,btrim(p_titulo),p_preguntas) returning id into v_id;
  else
    update public.formularios_plantillas set titulo=btrim(p_titulo), preguntas=p_preguntas, actualizado_en=now()
      where id=p_id and profesional_id=v_profesional returning id into v_id;
    if v_id is null then raise exception 'Formulario propio no encontrado.'; end if;
  end if;
  return v_id;
end;
$$;

create function public.eliminar_formulario(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.formularios_plantillas where id=p_id and profesional_id=public.profesional_actual_id();
  if not found then raise exception 'Formulario propio no encontrado.'; end if;
end;
$$;

create function public.enviar_formulario(p_plantilla uuid, p_cliente uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_id uuid;
begin
  if v_profesional is null or not coalesce(public.es_profesional_salud_de(p_cliente),false)
    or not exists (select 1 from public.clientes where id=p_cliente and estado='activo')
    then raise exception 'Selecciona un cliente activo asignado.'; end if;
  insert into public.formularios_enviados (plantilla_id,cliente_id,profesional_id,titulo,preguntas)
    select id,p_cliente,v_profesional,titulo,preguntas from public.formularios_plantillas
    where id=p_plantilla and profesional_id=v_profesional returning id into v_id;
  if v_id is null then raise exception 'Formulario propio no encontrado.'; end if;
  insert into public.notificaciones (destinatario_tipo,destinatario_id,tipo,titulo,referencia_id,cliente_id)
    values ('cliente',p_cliente,'formulario','Tienes un formulario de seguimiento',v_id::text,p_cliente);
  return v_id;
end;
$$;

create function public.responder_formulario(p_id uuid, p_respuestas jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_form public.formularios_enviados%rowtype;
  q jsonb;
  r jsonb;
  i integer;
begin
  select * into v_form from public.formularios_enviados
    where id=p_id and cliente_id=public.cliente_actual_id() for update;
  if not found or v_form.respondido_en is not null then raise exception 'Formulario no encontrado o ya respondido.'; end if;
  if jsonb_typeof(p_respuestas) is distinct from 'array' then raise exception 'Respuestas no válidas.'; end if;
  if length(p_respuestas::text) > 50000 then raise exception 'Respuestas demasiado largas.'; end if;
  if jsonb_array_length(p_respuestas) <> jsonb_array_length(v_form.preguntas) then raise exception 'Responde todas las preguntas.'; end if;
  for i in 0..jsonb_array_length(v_form.preguntas)-1 loop
    q := v_form.preguntas->i;
    r := p_respuestas->i;
    if q->>'tipo' = 'numero' then
      if jsonb_typeof(r) is distinct from 'number' then raise exception 'Respuesta numérica no válida.'; end if;
    elsif jsonb_typeof(r) is distinct from 'string' or length(btrim(r #>> '{}')) not between 1 and 2000 then
      raise exception 'Respuesta de texto no válida.';
    elsif q->>'tipo' = 'opcion' and not (q->'opciones' @> jsonb_build_array(r)) then
      raise exception 'Opción no válida.';
    end if;
  end loop;
  update public.formularios_enviados set respuestas=p_respuestas, respondido_en=now() where id=p_id;
  if exists (select 1 from public.profesional_cliente where cliente_id=v_form.cliente_id
    and profesional_id=v_form.profesional_id and rol in ('entrenador','nutricionista')) then
    insert into public.notificaciones (destinatario_tipo,destinatario_id,tipo,titulo,referencia_id,cliente_id)
      values ('profesional',v_form.profesional_id,'formulario','Un cliente ha respondido un formulario',p_id::text,v_form.cliente_id);
  end if;
end;
$$;

create function public.cancelar_formulario(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.formularios_enviados where id=p_id and profesional_id=public.profesional_actual_id()
    and respondido_en is null and public.es_profesional_salud_de(cliente_id);
  if not found then raise exception 'Formulario pendiente no encontrado o sin permiso.'; end if;
end;
$$;
revoke all on function public.guardar_formulario(uuid,text,jsonb), public.eliminar_formulario(uuid),
  public.enviar_formulario(uuid,uuid), public.responder_formulario(uuid,jsonb),
  public.cancelar_formulario(uuid) from public, anon;
grant execute on function public.guardar_formulario(uuid,text,jsonb), public.eliminar_formulario(uuid),
  public.enviar_formulario(uuid,uuid), public.responder_formulario(uuid,jsonb),
  public.cancelar_formulario(uuid) to authenticated;

commit;
