-- Receipts contain private business and potentially customer payment data.
-- They stay in a private bucket and are served only through short-lived URLs
-- issued by authenticated server actions. Storage API operations are never
-- exposed to the browser with the Supabase secret key.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES
        ('nextly-expense-receipts', 'nextly-expense-receipts', false, 10485760,
          ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[])
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types
    $sql$;
  END IF;
END
$$;

--> statement-breakpoint
ALTER TABLE expenses ADD COLUMN receipt_number text;
