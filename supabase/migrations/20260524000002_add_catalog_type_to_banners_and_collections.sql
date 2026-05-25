alter table public.banners
add column if not exists catalog_type text;

update public.banners
set catalog_type = 'audio'
where catalog_type is null;

alter table public.banners
alter column catalog_type set default 'audio';

alter table public.banners
alter column catalog_type set not null;

create index if not exists idx_banners_catalog_type
on public.banners (catalog_type);

alter table public.collections
add column if not exists catalog_type text;

update public.collections
set catalog_type = 'audio'
where catalog_type is null;

alter table public.collections
alter column catalog_type set default 'audio';

alter table public.collections
alter column catalog_type set not null;

create index if not exists idx_collections_catalog_type
on public.collections (catalog_type);