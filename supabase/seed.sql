-- Assessment content is published by the Task 1 cutover migration.
insert into public.app_settings(id) values(true) on conflict do nothing;
