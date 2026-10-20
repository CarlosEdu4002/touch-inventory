-- Migração aditiva: não exclui nem reescreve ativos existentes.
ALTER TABLE ativos
    ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recuperavel_ate TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS excluido_por INTEGER,
    ADD COLUMN IF NOT EXISTS excluido_por_nome VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_ativos_lixeira_prazo ON ativos(recuperavel_ate)
    WHERE excluido_em IS NOT NULL;

-- Cópias de identificação sem FK: a auditoria sobrevive à remoção do ativo,
-- tipo, categoria, setor e usuário. Nunca guarda conteúdo dos campos ou arquivos.
CREATE TABLE IF NOT EXISTS log_exclusoes_ativos (
    id BIGSERIAL PRIMARY KEY,
    ativo_id INTEGER NOT NULL,
    patrimonio VARCHAR(50) NOT NULL,
    tipo_ativo_id INTEGER NOT NULL,
    tipo_nome VARCHAR(100) NOT NULL,
    categoria_id INTEGER NOT NULL,
    categoria_nome VARCHAR(100) NOT NULL,
    setor_proprietario_id INTEGER,
    usuario_id INTEGER,
    usuario_nome VARCHAR(100) NOT NULL,
    acao VARCHAR(30) NOT NULL CHECK (acao IN ('exclusao', 'restauracao', 'exclusao_definitiva')),
    excluido_em TIMESTAMPTZ NOT NULL,
    recuperavel_ate TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_log_exclusoes_ativo ON log_exclusoes_ativos(ativo_id, id DESC);
