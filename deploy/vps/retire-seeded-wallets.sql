-- Deactivate the default Cash/Bank/Card/Other wallets that migration 0030
-- seeds into every fresh database, once the NextX import has brought the real
-- wallets. Automatic wallet selection (defaultWalletFor) takes the first active
-- wallet with a matching currency and kind, so an empty default must not
-- compete with the real location wallets.
--
-- A default wallet is only deactivated when no row anywhere references it
-- (every foreign key to wallets is checked). Deactivation is reversible:
--   UPDATE wallets SET active = true WHERE id = '<id>';
DO $$
DECLARE
  w record;
  fk record;
  used boolean;
  retired integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wallets WHERE name NOT IN ('Cash', 'Bank', 'Card', 'Other')
  ) THEN
    RAISE NOTICE 'No imported wallets found; the default wallets stay active';
    RETURN;
  END IF;

  FOR w IN
    SELECT id FROM public.wallets
     WHERE active AND name IN ('Cash', 'Bank', 'Card', 'Other')
  LOOP
    used := false;
    FOR fk IN
      SELECT c.conrelid::regclass AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f' AND c.confrelid = 'public.wallets'::regclass
    LOOP
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', fk.tbl, fk.col)
        INTO used USING w.id;
      EXIT WHEN used;
    END LOOP;

    IF NOT used THEN
      UPDATE public.wallets
         SET active = false,
             updated_at = now(),
             notes = concat_ws(' ', notes, '[Deactivated after the NextX import: unused default wallet]')
       WHERE id = w.id;
      retired := retired + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Deactivated % unused default wallets', retired;
END $$;
