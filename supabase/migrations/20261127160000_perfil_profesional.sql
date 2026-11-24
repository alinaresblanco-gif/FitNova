begin;

alter table public.profesionales add column foto_perfil boolean not null default false;

revoke update on public.profesionales from anon, authenticated;
grant update (nombre, apellidos, foto_perfil) on public.profesionales to authenticated;

create policy profesionales_update_own on public.profesionales for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

create function public.puede_ver_foto_profesional(p_profesional uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_profesional = public.profesional_actual_id()
    or exists (
      select 1 from public.profesional_cliente pc
      join public.clientes c on c.id = pc.cliente_id
      where pc.profesional_id = p_profesional and c.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.equipos e
      where (e.responsable_id = p_profesional or exists (
        select 1 from public.equipo_miembros m where m.equipo_id = e.id and m.profesional_id = p_profesional
      ))
      and (e.responsable_id = public.profesional_actual_id() or exists (
        select 1 from public.equipo_miembros m where m.equipo_id = e.id and m.profesional_id = public.profesional_actual_id()
      ))
    );
$$;
revoke all on function public.puede_ver_foto_profesional(uuid) from public, anon;
grant execute on function public.puede_ver_foto_profesional(uuid) to authenticated;

create function public.equipo_companeros()
returns table (id uuid, nombre text, foto_perfil boolean)
language sql stable security definer set search_path = '' as $$
  select distinct p.id, btrim(p.nombre || ' ' || coalesce(p.apellidos, '')), p.foto_perfil
  from public.profesionales p
  where p.id <> public.profesional_actual_id()
    and exists (
      select 1 from public.equipos e
      where (e.responsable_id = public.profesional_actual_id() or exists (
        select 1 from public.equipo_miembros m where m.equipo_id = e.id and m.profesional_id = public.profesional_actual_id()
      ))
      and (e.responsable_id = p.id or exists (
        select 1 from public.equipo_miembros m where m.equipo_id = e.id and m.profesional_id = p.id
      ))
    )
  order by 2;
$$;
revoke all on function public.equipo_companeros() from public, anon;
grant execute on function public.equipo_companeros() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profesionales-fotos', 'profesionales-fotos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy profesionales_fotos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'profesionales-fotos'
    and name = public.cliente_de_ruta_foto(name)::text || '/perfil.jpg'
    and public.puede_ver_foto_profesional(public.cliente_de_ruta_foto(name))
  );
create policy profesionales_fotos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profesionales-fotos'
    and name = public.profesional_actual_id()::text || '/perfil.jpg'
  );
create policy profesionales_fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'profesionales-fotos' and name = public.profesional_actual_id()::text || '/perfil.jpg')
  with check (bucket_id = 'profesionales-fotos' and name = public.profesional_actual_id()::text || '/perfil.jpg');
create policy profesionales_fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'profesionales-fotos' and name = public.profesional_actual_id()::text || '/perfil.jpg');

commit;
