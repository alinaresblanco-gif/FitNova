begin;

create policy foto_perfil_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'progreso-fotos'
    and name = public.cliente_actual_id()::text || '/perfil/avatar.jpg'
  )
  with check (
    bucket_id = 'progreso-fotos'
    and name = public.cliente_actual_id()::text || '/perfil/avatar.jpg'
  );

commit;
