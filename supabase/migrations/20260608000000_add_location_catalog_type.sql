alter table public.locations
add column if not exists catalog_type text not null default 'all';

alter table public.locations
drop constraint if exists locations_catalog_type_check;

alter table public.locations
add constraint locations_catalog_type_check
check (catalog_type in ('all', 'audio', 'watches'));

create index if not exists idx_locations_catalog_type
on public.locations (catalog_type);
