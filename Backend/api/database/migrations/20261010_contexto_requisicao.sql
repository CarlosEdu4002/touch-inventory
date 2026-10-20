-- Invalida formulários abertos em outra unidade ou setor da mesma sessão.
ALTER TABLE public.sessoes
    ADD COLUMN IF NOT EXISTS contexto_versao BIGINT NOT NULL DEFAULT 0;
