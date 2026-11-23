begin;

-- Sobrescribe también los privilegios por defecto del proyecto de Supabase.
revoke all on public.sesiones from anon, authenticated;
grant select on public.sesiones to authenticated;
revoke all on function public.guardar_sesion(uuid, text, text, timestamptz, timestamptz, text, uuid) from anon;
revoke all on function public.cambiar_estado_sesion(uuid, text) from anon;

commit;
