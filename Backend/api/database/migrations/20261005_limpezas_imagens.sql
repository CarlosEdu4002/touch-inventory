-- Aditiva e idempotente. Sem alteração/exclusão de ativos, histórico ou arquivos.
CREATE TABLE IF NOT EXISTS limpezas_imagens (
    arquivo TEXT PRIMARY KEY CHECK (arquivo ~* '^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'),
    tentativas INTEGER NOT NULL DEFAULT 0,
    ultimo_erro VARCHAR(300),
    proxima_tentativa TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_limpezas_imagens_proxima ON limpezas_imagens(proxima_tentativa);
