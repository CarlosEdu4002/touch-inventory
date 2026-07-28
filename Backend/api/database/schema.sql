-- =========================
-- CATEGORIAS
-- =========================

CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    setor_id INTEGER,
    icone VARCHAR(100),
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- SETORES E ACESSO
-- =========================

CREATE TABLE IF NOT EXISTS setores (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE categorias
    ADD COLUMN IF NOT EXISTS setor_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_categoria_setor'
    ) THEN
        ALTER TABLE categorias
            ADD CONSTRAINT fk_categoria_setor
            FOREIGN KEY (setor_id)
            REFERENCES setores(id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    login VARCHAR(60) NOT NULL UNIQUE,
    nome VARCHAR(100) NOT NULL,
    senha_hash TEXT NOT NULL,
    perfil VARCHAR(20) NOT NULL,
    setor_id INTEGER,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_usuario_perfil
        CHECK (perfil IN ('admin', 'setor')),
    CONSTRAINT ck_usuario_setor
        CHECK (
            (perfil = 'admin' AND setor_id IS NULL)
            OR
            (perfil = 'setor' AND setor_id IS NOT NULL)
        ),
    CONSTRAINT fk_usuario_setor
        FOREIGN KEY (setor_id)
        REFERENCES setores(id)
);

CREATE TABLE IF NOT EXISTS sessoes (
    token_hash CHAR(64) PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    expira_em TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sessao_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessoes_expiracao
    ON sessoes (expira_em);

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMP;

-- =========================
-- TIPOS DE ATIVO
-- =========================

CREATE TABLE IF NOT EXISTS tipos_ativo (
    id SERIAL PRIMARY KEY,
    categoria_id INTEGER NOT NULL,
    nome VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tipos_categoria
        FOREIGN KEY (categoria_id)
        REFERENCES categorias(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tipos_ativo_categoria_nome
    ON tipos_ativo (categoria_id, LOWER(nome));

-- =========================
-- CAMPOS
-- =========================

CREATE TABLE IF NOT EXISTS campos (
    id SERIAL PRIMARY KEY,
    tipo_ativo_id INTEGER NOT NULL,

    nome VARCHAR(100) NOT NULL,
    label VARCHAR(100) NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    opcoes JSONB NOT NULL DEFAULT '[]'::JSONB,

    obrigatorio BOOLEAN DEFAULT FALSE,
    editavel BOOLEAN DEFAULT TRUE,
    visivel BOOLEAN DEFAULT TRUE,

    ordem INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_campos_tipo
        FOREIGN KEY (tipo_ativo_id)
        REFERENCES tipos_ativo(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campos_tipo_nome
    ON campos (tipo_ativo_id, LOWER(nome));

ALTER TABLE campos
    ADD COLUMN IF NOT EXISTS opcoes JSONB NOT NULL DEFAULT '[]'::JSONB;

-- =========================
-- ATIVOS
-- =========================

CREATE TABLE IF NOT EXISTS ativos (
    id SERIAL PRIMARY KEY,
    tipo_ativo_id INTEGER NOT NULL,
    setor_id INTEGER,

    patrimonio VARCHAR(50) UNIQUE NOT NULL,
    dados JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ativo_tipo
        FOREIGN KEY (tipo_ativo_id)
        REFERENCES tipos_ativo(id),

    CONSTRAINT fk_ativo_setor
        FOREIGN KEY (setor_id)
        REFERENCES setores(id)
);

-- Compatibilidade com bancos criados antes da coluna JSONB.
ALTER TABLE ativos
    ADD COLUMN IF NOT EXISTS dados JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ativos
    ADD COLUMN IF NOT EXISTS setor_id INTEGER;

ALTER TABLE ativos
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'em_uso';

ALTER TABLE ativos
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_ativo_setor'
    ) THEN
        ALTER TABLE ativos
            ADD CONSTRAINT fk_ativo_setor
            FOREIGN KEY (setor_id)
            REFERENCES setores(id);
    END IF;
END $$;

UPDATE ativos a
SET setor_id = c.setor_id
FROM tipos_ativo t
INNER JOIN categorias c ON c.id = t.categoria_id
WHERE a.tipo_ativo_id = t.id
  AND a.setor_id IS NULL
  AND c.setor_id IS NOT NULL;

-- =========================
-- STATUS E AUDITORIA
-- =========================

CREATE TABLE IF NOT EXISTS status_ativos (
    codigo VARCHAR(30) PRIMARY KEY,
    nome VARCHAR(60) NOT NULL UNIQUE,
    cor VARCHAR(20) NOT NULL DEFAULT '#64748b',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO status_ativos (codigo, nome, cor, ordem)
VALUES
    ('em_uso', 'Em uso', '#2563eb', 1),
    ('disponivel', 'Disponível', '#16a34a', 2),
    ('em_manutencao', 'Em manutenção', '#d97706', 3),
    ('emprestado', 'Emprestado', '#7c3aed', 4),
    ('baixado', 'Baixado', '#64748b', 5),
    ('extraviado', 'Extraviado', '#dc2626', 6)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS historico_ativos (
    id BIGSERIAL PRIMARY KEY,
    ativo_id INTEGER,
    patrimonio VARCHAR(50) NOT NULL,
    tipo_ativo_id INTEGER,
    usuario_id INTEGER,
    usuario_nome VARCHAR(100) NOT NULL,
    acao VARCHAR(30) NOT NULL,
    descricao TEXT,
    setor_anterior_id INTEGER,
    setor_novo_id INTEGER,
    status_anterior VARCHAR(30),
    status_novo VARCHAR(30),
    dados_anteriores JSONB,
    dados_novos JSONB,
    campos_alterados JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_historico_ativo
        FOREIGN KEY (ativo_id) REFERENCES ativos(id) ON DELETE SET NULL,
    CONSTRAINT fk_historico_tipo
        FOREIGN KEY (tipo_ativo_id) REFERENCES tipos_ativo(id),
    CONSTRAINT fk_historico_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_historico_setor_anterior
        FOREIGN KEY (setor_anterior_id) REFERENCES setores(id),
    CONSTRAINT fk_historico_setor_novo
        FOREIGN KEY (setor_novo_id) REFERENCES setores(id)
);

CREATE INDEX IF NOT EXISTS idx_historico_ativo
    ON historico_ativos (ativo_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_historico_setor
    ON historico_ativos (setor_novo_id, created_at DESC);
