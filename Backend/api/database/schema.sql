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

ALTER TABLE categorias
    ADD COLUMN IF NOT EXISTS icone VARCHAR(32);

-- =========================
-- SETORES E ACESSO
-- =========================

CREATE TABLE IF NOT EXISTS setores (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Os setores são cadastrados pelo administrador dentro de cada unidade.

ALTER TABLE categorias
    ADD COLUMN IF NOT EXISTS setor_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = current_schema()::regnamespace AND conname = 'fk_categoria_setor'
    ) THEN
        ALTER TABLE categorias
            ADD CONSTRAINT fk_categoria_setor
            FOREIGN KEY (setor_id)
            REFERENCES setores(id);
    END IF;
END $$;

UPDATE categorias c
SET setor_id = s.id
FROM setores s
WHERE c.setor_id IS NULL
  AND (
      (LOWER(c.nome) = 'almoxarifado'
       AND s.nome = 'Almoxarifado')
      OR
      (LOWER(c.nome) IN
           ('tecnologia da informação', 'ti', 't.i.')
       AND s.nome = 'Tecnologia da Informação')
      OR
      (LOWER(c.nome) IN
           ('controle de qualidade', 'qualidade')
       AND s.nome = 'Controle de Qualidade')
      OR
      (LOWER(c.nome) IN
           ('mobiliário', 'mobiliario')
       AND s.nome = 'Controle de Qualidade')
  );

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
    permite_emprestimo BOOLEAN NOT NULL DEFAULT FALSE,
    permite_checklist BOOLEAN NOT NULL DEFAULT FALSE,
    checklist_intervalo_meses INTEGER,
    checklist_recorrencia VARCHAR(20) NOT NULL DEFAULT 'mensal',
    checklist_datas_personalizadas JSONB NOT NULL DEFAULT '[]'::JSONB,
    checklist_alerta_dias INTEGER NOT NULL DEFAULT 15,
    checklist_modo VARCHAR(20) NOT NULL DEFAULT 'conclusao',
    checklist_itens JSONB NOT NULL DEFAULT '[]'::JSONB,
    permite_vinculo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tipos_categoria
        FOREIGN KEY (categoria_id)
        REFERENCES categorias(id)
        ON DELETE CASCADE
);

ALTER TABLE tipos_ativo
    ADD COLUMN IF NOT EXISTS icone VARCHAR(32);

ALTER TABLE tipos_ativo
    ADD COLUMN IF NOT EXISTS permite_checklist BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS checklist_intervalo_meses INTEGER,
    ADD COLUMN IF NOT EXISTS checklist_recorrencia VARCHAR(20),
    ADD COLUMN IF NOT EXISTS checklist_datas_personalizadas JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS checklist_alerta_dias INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN IF NOT EXISTS checklist_modo VARCHAR(20) NOT NULL DEFAULT 'conclusao',
    ADD COLUMN IF NOT EXISTS checklist_itens JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS permite_vinculo BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE tipos_ativo
SET checklist_recorrencia = CASE checklist_intervalo_meses
    WHEN 3 THEN 'trimestral'
    WHEN 6 THEN 'semestral'
    WHEN 12 THEN 'anual'
    ELSE 'mensal'
END
WHERE checklist_recorrencia IS NULL;

ALTER TABLE tipos_ativo
    ALTER COLUMN checklist_recorrencia SET DEFAULT 'mensal',
    ALTER COLUMN checklist_recorrencia SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tipos_ativo_categoria_nome
    ON tipos_ativo (categoria_id, LOWER(nome));

-- Migração única: preserva o comportamento das Chaves e Ferramentas já existentes.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'tipos_ativo'
          AND column_name = 'permite_emprestimo'
    ) THEN
        ALTER TABLE tipos_ativo
            ADD COLUMN permite_emprestimo BOOLEAN NOT NULL DEFAULT FALSE;

        UPDATE tipos_ativo
        SET permite_emprestimo = TRUE
        WHERE LOWER(nome) IN ('chaves', 'ferramentas');
    END IF;
END $$;

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

ALTER TABLE ativos
    ADD COLUMN IF NOT EXISTS imagem VARCHAR(255);

ALTER TABLE ativos
    ADD COLUMN IF NOT EXISTS checklist_proxima_data DATE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = current_schema()::regnamespace AND conname = 'fk_ativo_setor'
    ) THEN
        ALTER TABLE ativos
            ADD CONSTRAINT fk_ativo_setor
            FOREIGN KEY (setor_id)
            REFERENCES setores(id);
    END IF;
END $$;

UPDATE ativos a
SET setor_id = s.id
FROM setores s
WHERE a.setor_id IS NULL
  AND (
      (s.nome = 'Tecnologia da Informação'
       AND LOWER(COALESCE(a.dados->>'setor', '')) IN
           ('ti', 't.i', 't.i.', 'tecnologia da informação'))
      OR
      (s.nome = 'Almoxarifado'
       AND LOWER(COALESCE(a.dados->>'setor', '')) = 'almoxarifado')
      OR
      (s.nome = 'Controle de Qualidade'
       AND LOWER(COALESCE(a.dados->>'setor', '')) IN
           ('qualidade', 'controle de qualidade'))
  );

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

-- =========================
-- CHECKLISTS PERIÓDICOS
-- =========================

CREATE TABLE IF NOT EXISTS execucoes_checklist (
    id BIGSERIAL PRIMARY KEY,
    ativo_id INTEGER REFERENCES ativos(id) ON DELETE SET NULL,
    patrimonio VARCHAR(50) NOT NULL,
    tipo_ativo_id INTEGER NOT NULL REFERENCES tipos_ativo(id),
    data_prevista DATE NOT NULL,
    executado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resultado VARCHAR(20) NOT NULL CHECK (resultado IN ('conforme', 'nao_conforme')),
    observacao TEXT,
    respostas JSONB NOT NULL DEFAULT '[]'::JSONB,
    proxima_data DATE NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_nome VARCHAR(100) NOT NULL
);

ALTER TABLE execucoes_checklist
    ALTER COLUMN proxima_data DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_execucoes_checklist_ativo
    ON execucoes_checklist (ativo_id, executado_em DESC);

CREATE INDEX IF NOT EXISTS idx_ativos_checklist_proxima_data
    ON ativos (checklist_proxima_data)
    WHERE checklist_proxima_data IS NOT NULL;

-- =========================
-- GRUPOS DE ATIVOS
-- =========================

CREATE TABLE IF NOT EXISTS grupos_ativos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grupos_ativos_membros (
    grupo_id INTEGER NOT NULL REFERENCES grupos_ativos(id) ON DELETE CASCADE,
    ativo_id INTEGER NOT NULL UNIQUE REFERENCES ativos(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (grupo_id, ativo_id)
);

CREATE INDEX IF NOT EXISTS idx_grupos_ativos_membros_grupo
    ON grupos_ativos_membros (grupo_id);

CREATE TABLE IF NOT EXISTS historico_icones (
    id BIGSERIAL PRIMARY KEY,
    entidade VARCHAR(20) NOT NULL,
    registro_id INTEGER NOT NULL,
    registro_nome VARCHAR(120) NOT NULL,
    icone_anterior VARCHAR(32),
    icone_novo VARCHAR(32),
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_nome VARCHAR(100) NOT NULL,
    setor_id INTEGER REFERENCES setores(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_historico_icones_entidade
        CHECK (entidade IN ('categoria', 'tipo_ativo'))
);

CREATE INDEX IF NOT EXISTS idx_historico_icones_registro
    ON historico_icones (entidade, registro_id, created_at DESC);

-- =========================
-- MAPA DE ATIVOS
-- =========================

CREATE TABLE IF NOT EXISTS plantas_baixas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    descricao VARCHAR(300),
    arquivo VARCHAR(255) NOT NULL,
    largura INTEGER NOT NULL CHECK (largura > 0),
    altura INTEGER NOT NULL CHECK (altura > 0),
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ambientes_mapa (
    id SERIAL PRIMARY KEY,
    planta_id INTEGER NOT NULL REFERENCES plantas_baixas(id) ON DELETE CASCADE,
    setor_id INTEGER NOT NULL REFERENCES setores(id),
    nome VARCHAR(120) NOT NULL,
    poligono JSONB NOT NULL,
    centro_x NUMERIC(9, 6) NOT NULL CHECK (centro_x BETWEEN 0 AND 1),
    centro_y NUMERIC(9, 6) NOT NULL CHECK (centro_y BETWEEN 0 AND 1),
    cor VARCHAR(20) NOT NULL DEFAULT '#2563eb',
    padrao BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ambientes_mapa_planta
    ON ambientes_mapa (planta_id);

CREATE INDEX IF NOT EXISTS idx_ambientes_mapa_setor
    ON ambientes_mapa (setor_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ambiente_padrao_setor
    ON ambientes_mapa (setor_id)
    WHERE padrao = TRUE;

CREATE TABLE IF NOT EXISTS posicoes_ativos (
    ativo_id INTEGER PRIMARY KEY REFERENCES ativos(id) ON DELETE CASCADE,
    ambiente_id INTEGER NOT NULL REFERENCES ambientes_mapa(id) ON DELETE CASCADE,
    x NUMERIC(9, 6) NOT NULL CHECK (x BETWEEN 0 AND 1),
    y NUMERIC(9, 6) NOT NULL CHECK (y BETWEEN 0 AND 1),
    atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posicoes_ativos_ambiente
    ON posicoes_ativos (ambiente_id);

-- =========================
-- MOVIMENTAÇÕES DE CHAVES
-- =========================

CREATE TABLE IF NOT EXISTS movimentacoes_chaves (
    id BIGSERIAL PRIMARY KEY,
    ativo_id INTEGER,
    patrimonio VARCHAR(50) NOT NULL,
    tipo_ativo_id INTEGER NOT NULL,
    acao VARCHAR(20) NOT NULL,
    responsavel VARCHAR(150),
    empresa_setor VARCHAR(150),
    setor_responsavel_id INTEGER,
    observacao TEXT,
    usuario_id INTEGER,
    usuario_nome VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_movimentacao_chave_acao
        CHECK (acao IN ('saida', 'devolucao')),
    CONSTRAINT fk_movimentacao_chave_ativo
        FOREIGN KEY (ativo_id) REFERENCES ativos(id) ON DELETE SET NULL,
    CONSTRAINT fk_movimentacao_chave_tipo
        FOREIGN KEY (tipo_ativo_id) REFERENCES tipos_ativo(id),
    CONSTRAINT fk_movimentacao_chave_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_movimentacao_chave_setor_responsavel
        FOREIGN KEY (setor_responsavel_id) REFERENCES setores(id)
);

ALTER TABLE movimentacoes_chaves
    ADD COLUMN IF NOT EXISTS setor_responsavel_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = current_schema()::regnamespace AND conname = 'fk_movimentacao_chave_setor_responsavel'
    ) THEN
        ALTER TABLE movimentacoes_chaves
            ADD CONSTRAINT fk_movimentacao_chave_setor_responsavel
            FOREIGN KEY (setor_responsavel_id) REFERENCES setores(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_movimentacoes_chaves_ativo
    ON movimentacoes_chaves (ativo_id, created_at DESC);

-- Retiradas e devoluções do tipo Ferramentas no Almoxarifado.
CREATE TABLE IF NOT EXISTS movimentacoes_ferramentas (
    id BIGSERIAL PRIMARY KEY,
    ativo_id INTEGER REFERENCES ativos(id) ON DELETE SET NULL,
    patrimonio VARCHAR(50) NOT NULL,
    tipo_ativo_id INTEGER NOT NULL REFERENCES tipos_ativo(id),
    acao VARCHAR(20) NOT NULL CHECK (acao IN ('saida', 'devolucao')),
    responsavel VARCHAR(150),
    empresa_setor VARCHAR(150),
    setor_responsavel_id INTEGER REFERENCES setores(id),
    observacao TEXT,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_nome VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_ferramentas_ativo
    ON movimentacoes_ferramentas (ativo_id, created_at DESC);

-- Empréstimos de qualquer tipo de ativo, com prazo e devolução auditáveis.
CREATE TABLE IF NOT EXISTS emprestimos_ativos (
    id BIGSERIAL PRIMARY KEY,
    ativo_id INTEGER REFERENCES ativos(id) ON DELETE SET NULL,
    patrimonio VARCHAR(50) NOT NULL,
    tipo_ativo_id INTEGER NOT NULL REFERENCES tipos_ativo(id),
    responsavel VARCHAR(150) NOT NULL,
    setor_responsavel_id INTEGER REFERENCES setores(id),
    observacao TEXT,
    status_anterior VARCHAR(30) NOT NULL DEFAULT 'disponivel',
    prazo_devolucao TIMESTAMPTZ NOT NULL,
    emprestado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    devolvido_em TIMESTAMPTZ,
    usuario_saida_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_saida_nome VARCHAR(100) NOT NULL,
    usuario_devolucao_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_devolucao_nome VARCHAR(100)
);

ALTER TABLE emprestimos_ativos
    ADD COLUMN IF NOT EXISTS status_anterior VARCHAR(30) NOT NULL DEFAULT 'disponivel';

CREATE UNIQUE INDEX IF NOT EXISTS idx_emprestimos_ativos_abertos
    ON emprestimos_ativos (ativo_id)
    WHERE devolvido_em IS NULL AND ativo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emprestimos_ativos_prazo
    ON emprestimos_ativos (prazo_devolucao)
    WHERE devolvido_em IS NULL;

-- Associação do UID físico ao ativo. Após o primeiro aprendizado da URL,
-- as leituras seguintes precisam somente do UID rápido da tag.
CREATE TABLE IF NOT EXISTS tags_nfc (
    uid VARCHAR(32) PRIMARY KEY,
    ativo_id INTEGER NOT NULL UNIQUE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tag_nfc_ativo
        FOREIGN KEY (ativo_id) REFERENCES ativos(id) ON DELETE CASCADE
);
