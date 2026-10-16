ALTER TABLE product_images ADD COLUMN source_pathname text;
CREATE UNIQUE INDEX product_images_source_path_key ON product_images (source_pathname);

-- Rehearsal databases do not run Supabase Storage. In Supabase environments,
-- provision the private upload bucket and public derivative bucket as part of
-- the application migration so the app has the same contract in each stage.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES
        ('nextly-product-staging', 'nextly-product-staging', false, 10485760,
          ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]),
        ('nextly-product-images', 'nextly-product-images', true, 10485760,
          ARRAY['image/avif', 'image/webp']::text[])
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types
    $sql$;
  END IF;
END
$$;
