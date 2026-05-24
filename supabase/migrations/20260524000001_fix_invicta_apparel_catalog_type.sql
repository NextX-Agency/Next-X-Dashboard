update public.categories
set catalog_type = 'watches'
where lower(name) = 'invicta apparel'
  and catalog_type <> 'watches';