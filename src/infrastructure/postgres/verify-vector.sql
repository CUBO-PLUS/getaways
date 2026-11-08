DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector is not enabled';
  END IF;
  IF '[1,2]'::vector <-> '[4,6]'::vector <> 5 THEN
    RAISE EXCEPTION 'pgvector distance calculation failed';
  END IF;
END
$$;
