-- Phase 3: what a videographer can see.
-- Admins may plan a task for any client, not only the ones linked to the videographer,
-- so a videographer can also read the clients behind the tasks they can see
-- (tasks RLS applies inside the subquery: own tasks in published plans only).

drop policy clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.videographer_clients vc
      where vc.client_id = clients.id and vc.videographer_id = (select auth.uid())
    )
    or exists (select 1 from public.tasks t where t.client_id = clients.id)
  );
