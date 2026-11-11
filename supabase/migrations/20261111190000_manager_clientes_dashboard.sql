begin;

alter table public.etiquetas
  add column profesional_id uuid references public.profesionales(id) on delete cascade;

create unique index etiquetas_profesional_nombre_uidx
  on public.etiquetas (profesional_id, lower(btrim(nombre)))
  where profesional_id is not null;

drop policy etiquetas_select_authenticated on public.etiquetas;

create policy etiquetas_select_related
  on public.etiquetas for select to authenticated
  using (
    profesional_id is null
    or profesional_id = public.profesional_actual_id()
  );

grant insert, delete on public.cliente_etiqueta to authenticated;

create policy cliente_etiqueta_insert_professional
  on public.cliente_etiqueta for insert to authenticated
  with check (
    exists (
      select 1
      from public.profesional_cliente pc
      join public.profesionales p on p.id = pc.profesional_id
      where pc.cliente_id = cliente_etiqueta.cliente_id
        and p.auth_user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.etiquetas e
      where e.id = cliente_etiqueta.etiqueta_id
        and e.profesional_id = public.profesional_actual_id()
    )
  );

create policy cliente_etiqueta_delete_professional
  on public.cliente_etiqueta for delete to authenticated
  using (
    exists (
      select 1
      from public.profesional_cliente pc
      join public.profesionales p on p.id = pc.profesional_id
      where pc.cliente_id = cliente_etiqueta.cliente_id
        and p.auth_user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.etiquetas e
      where e.id = cliente_etiqueta.etiqueta_id
        and e.profesional_id = public.profesional_actual_id()
    )
  );

create or replace function public.crear_etiqueta(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profesional_id uuid := public.profesional_actual_id();
  v_nombre text := btrim(p_nombre);
  v_id uuid;
begin
  if v_profesional_id is null then
    raise exception 'No autorizado: el usuario actual no es un profesional registrado';
  end if;

  if v_nombre is null or v_nombre = '' or length(v_nombre) > 50 then
    raise exception 'La etiqueta debe tener entre 1 y 50 caracteres';
  end if;

  insert into public.etiquetas (profesional_id, nombre)
  values (v_profesional_id, v_nombre)
  on conflict (profesional_id, (lower(btrim(nombre))))
    where profesional_id is not null
    do update set nombre = excluded.nombre
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.crear_etiqueta(text) from public;
grant execute on function public.crear_etiqueta(text) to authenticated;

commit;
