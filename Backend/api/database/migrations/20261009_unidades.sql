-- Identidades e sessões permanecem globais; os dados patrimoniais da instalação
-- existente continuam no esquema public, que passa a ser a primeira unidade.
CREATE TABLE IF NOT EXISTS public.unidades (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL UNIQUE,
    schema_nome VARCHAR(80) NOT NULL UNIQUE,
    logo BYTEA,
    logo_mime VARCHAR(30),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.usuario_unidades (
    usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    unidade_id INTEGER NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    setor_id INTEGER NOT NULL,
    PRIMARY KEY (usuario_id, unidade_id, setor_id)
);

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS ck_usuario_setor;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS fk_usuario_setor;
ALTER TABLE public.sessoes
    ADD COLUMN IF NOT EXISTS unidade_id INTEGER REFERENCES public.unidades(id);
ALTER TABLE public.sessoes
    ADD COLUMN IF NOT EXISTS setor_id INTEGER;

-- Preserva os dados e os IDs existentes, sem mover nem apagar registros.
-- A importação de vínculos legados ocorre somente quando a primeira unidade
-- é criada. Reinicializações não restauram acessos que o administrador revogou.
WITH primeira AS (
    INSERT INTO public.unidades (id, nome, schema_nome)
    SELECT 1, 'Unidade existente', 'public'
    WHERE EXISTS (SELECT 1 FROM public.usuarios)
       OR EXISTS (SELECT 1 FROM public.ativos)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
)
INSERT INTO public.usuario_unidades (usuario_id, unidade_id, setor_id)
SELECT u.id, p.id, u.setor_id
FROM public.usuarios u CROSS JOIN primeira p
WHERE u.perfil = 'setor' AND u.setor_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Nunca recua a sequência. Esquemas órfãos de tentativas antigas são
-- preservados e reservam seus IDs até reparação manual após backup.
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

-- Novos ativos de todas as unidades compartilham a sequência de IDs.
SELECT setval(
    pg_get_serial_sequence('public.ativos', 'id'),
    GREATEST(
        (SELECT last_value FROM public.ativos_id_seq),
        COALESCE((SELECT MAX(id) FROM public.ativos), 0)
    ),
    TRUE
);