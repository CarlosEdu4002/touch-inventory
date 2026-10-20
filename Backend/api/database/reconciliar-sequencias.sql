-- Invariante operacional, executada em cada inicialização depois das migrações.
-- setval não é transacional; lacunas de numeração são aceitáveis, recuo não é.
WITH limites AS (
    SELECT seq.last_value, seq.is_called,
           COALESCE((SELECT MAX(id)::bigint FROM public.unidades), 0) AS cadastrado,
           COALESCE((
               SELECT MAX(substring(nspname FROM 9)::bigint)
               FROM pg_namespace
               WHERE nspname ~ '^unidade_[1-9][0-9]*$' AND length(nspname) <= 18
           ), 0) AS esquema_existente
    FROM public.unidades_id_seq seq
)
SELECT setval(
    'public.unidades_id_seq'::regclass,
    GREATEST(last_value, cadastrado, esquema_existente, 1),
    is_called OR cadastrado >= last_value OR esquema_existente >= last_value
)
FROM limites;

-- O maior ID de ativo pode pertencer a qualquer unidade restaurada.
DO $$
DECLARE unidade RECORD; maior BIGINT := COALESCE((SELECT MAX(id) FROM public.ativos), 0); local_maior BIGINT;
BEGIN
    FOR unidade IN SELECT schema_nome FROM public.unidades WHERE schema_nome <> 'public' LOOP
        EXECUTE format('SELECT COALESCE(MAX(id),0) FROM %I.ativos', unidade.schema_nome) INTO local_maior;
        maior := GREATEST(maior, local_maior);
    END LOOP;
    PERFORM setval('public.ativos_id_seq'::regclass,
        GREATEST((SELECT last_value FROM public.ativos_id_seq), maior, 1), TRUE);
END $$;
