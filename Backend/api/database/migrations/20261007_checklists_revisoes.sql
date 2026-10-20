-- Aditiva e reaplicável. Aplicar somente após ensaio de recuperação (item 8).
BEGIN;
CREATE TABLE IF NOT EXISTS checklist_modelos (
 id BIGSERIAL PRIMARY KEY,
 tipo_ativo_id INTEGER NOT NULL REFERENCES tipos_ativo(id) ON DELETE CASCADE,
 versao INTEGER NOT NULL,
 perguntas JSONB NOT NULL,
 legado BOOLEAN NOT NULL DEFAULT FALSE,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(tipo_ativo_id, versao)
);
CREATE OR REPLACE FUNCTION publicar_modelo_checklist() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE numero INTEGER; itens JSONB;
BEGIN
 IF TG_OP='UPDATE' AND NEW.checklist_itens IS NOT DISTINCT FROM OLD.checklist_itens THEN RETURN NEW; END IF;
 SELECT COALESCE(MAX(versao),0)+1 INTO numero FROM checklist_modelos WHERE tipo_ativo_id=NEW.id;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',md5(random()::text || clock_timestamp()::text || ord::text),'texto',texto) ORDER BY ord),'[]')
 INTO itens FROM jsonb_array_elements_text(NEW.checklist_itens) WITH ORDINALITY AS p(texto,ord);
 INSERT INTO checklist_modelos(tipo_ativo_id,versao,perguntas) VALUES(NEW.id,numero,itens);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS publicar_checklist ON tipos_ativo;
CREATE TRIGGER publicar_checklist AFTER INSERT OR UPDATE OF checklist_itens ON tipos_ativo FOR EACH ROW EXECUTE FUNCTION publicar_modelo_checklist();
INSERT INTO checklist_modelos(tipo_ativo_id,versao,perguntas,legado)
 SELECT t.id,1,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',md5(t.id::text || ':' || p.ord::text),'texto',p.texto) ORDER BY p.ord)
 FROM jsonb_array_elements_text(t.checklist_itens) WITH ORDINALITY p(texto,ord)),'[]'),TRUE
 FROM tipos_ativo t WHERE NOT EXISTS(SELECT 1 FROM checklist_modelos m WHERE m.tipo_ativo_id=t.id);
CREATE TABLE IF NOT EXISTS checklist_ocorrencias (
 id BIGSERIAL PRIMARY KEY,
 ativo_id INTEGER NOT NULL REFERENCES ativos(id) ON DELETE CASCADE,
 modelo_id BIGINT NOT NULL REFERENCES checklist_modelos(id),
 vencimento DATE NOT NULL,
 situacao TEXT NOT NULL DEFAULT 'pendente' CHECK(situacao IN ('pendente','concluida')),
 legado BOOLEAN NOT NULL DEFAULT FALSE,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(ativo_id,vencimento)
);
ALTER TABLE checklist_ocorrencias ADD COLUMN IF NOT EXISTS agenda JSONB;
ALTER TABLE checklist_ocorrencias ADD COLUMN IF NOT EXISTS referencia DATE;
ALTER TABLE checklist_ocorrencias ADD COLUMN IF NOT EXISTS agenda_reconfigurada_em DATE;
-- Evidência compacta dos ciclos de calendário não atendidos ao trocar a regra.
-- O intervalo é inclusivo; a regra e a referência permitem reconstruir seus dias.
CREATE TABLE IF NOT EXISTS checklist_agenda_alteracoes (
 id BIGSERIAL PRIMARY KEY,
 ocorrencia_id BIGINT NOT NULL REFERENCES checklist_ocorrencias(id) ON DELETE CASCADE,
 referencia DATE NOT NULL,
 inicio DATE NOT NULL,
 fim DATE NOT NULL,
 configuracao_anterior JSONB NOT NULL,
 registrado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION preservar_agenda_checklist() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE hoje DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
 IF ROW(OLD.permite_checklist,OLD.checklist_recorrencia,OLD.checklist_intervalo_meses,OLD.checklist_modo,OLD.checklist_datas_personalizadas)
 IS NOT DISTINCT FROM ROW(NEW.permite_checklist,NEW.checklist_recorrencia,NEW.checklist_intervalo_meses,NEW.checklist_modo,NEW.checklist_datas_personalizadas) THEN RETURN NEW; END IF;
 IF OLD.permite_checklist AND (OLD.checklist_modo='calendario' OR OLD.checklist_recorrencia='personalizado') THEN
 INSERT INTO checklist_agenda_alteracoes(ocorrencia_id,referencia,inicio,fim,configuracao_anterior)
 SELECT o.id,COALESCE(o.referencia,o.vencimento),
 greatest(o.vencimento+1,(o.criado_em AT TIME ZONE 'America/Cuiaba')::date,COALESCE(o.agenda_reconfigurada_em+1,o.vencimento+1)),hoje,
 jsonb_build_object('recorrencia',OLD.checklist_recorrencia,'meses',OLD.checklist_intervalo_meses,'datas',OLD.checklist_datas_personalizadas)
 FROM checklist_ocorrencias o JOIN ativos a ON a.id=o.ativo_id
 WHERE a.tipo_ativo_id=NEW.id AND o.situacao='pendente'
 AND greatest(o.vencimento+1,(o.criado_em AT TIME ZONE 'America/Cuiaba')::date,COALESCE(o.agenda_reconfigurada_em+1,o.vencimento+1))<=hoje;
 END IF;
 UPDATE checklist_ocorrencias o SET agenda_reconfigurada_em=hoje FROM ativos a
 WHERE a.id=o.ativo_id AND a.tipo_ativo_id=NEW.id AND o.situacao='pendente';
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS preservar_agenda ON tipos_ativo;
CREATE TRIGGER preservar_agenda AFTER UPDATE ON tipos_ativo FOR EACH ROW EXECUTE FUNCTION preservar_agenda_checklist();
CREATE UNIQUE INDEX IF NOT EXISTS checklist_uma_pendencia ON checklist_ocorrencias(ativo_id) WHERE situacao='pendente';
ALTER TABLE execucoes_checklist ADD COLUMN IF NOT EXISTS ocorrencia_id BIGINT REFERENCES checklist_ocorrencias(id);
ALTER TABLE execucoes_checklist ADD COLUMN IF NOT EXISTS chave_reenvio TEXT;
ALTER TABLE execucoes_checklist ADD COLUMN IF NOT EXISTS pedido JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS checklist_execucao_unica ON execucoes_checklist(ocorrencia_id);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_chave_unica ON execucoes_checklist(chave_reenvio) WHERE chave_reenvio IS NOT NULL;
INSERT INTO checklist_ocorrencias(ativo_id,modelo_id,vencimento,legado)
 SELECT a.id,m.id,a.checklist_proxima_data,TRUE FROM ativos a
 JOIN LATERAL (SELECT id FROM checklist_modelos WHERE tipo_ativo_id=a.tipo_ativo_id ORDER BY versao DESC LIMIT 1) m ON TRUE
 WHERE a.checklist_proxima_data IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM checklist_ocorrencias o WHERE o.ativo_id=a.id)
 ON CONFLICT DO NOTHING;
UPDATE checklist_ocorrencias SET referencia=vencimento WHERE referencia IS NULL;
CREATE OR REPLACE FUNCTION agendar_ocorrencia_checklist() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.checklist_proxima_data IS NOT NULL THEN
 INSERT INTO checklist_ocorrencias(ativo_id,modelo_id,vencimento,agenda,referencia)
 SELECT NEW.id,m.id,NEW.checklist_proxima_data,
 (SELECT jsonb_build_object('recorrencia',t.checklist_recorrencia,'meses',t.checklist_intervalo_meses,'modo',t.checklist_modo,'datas',t.checklist_datas_personalizadas) FROM tipos_ativo t WHERE t.id=NEW.tipo_ativo_id),
 COALESCE((SELECT o.referencia FROM checklist_ocorrencias o WHERE o.ativo_id=NEW.id ORDER BY o.id DESC LIMIT 1),NEW.checklist_proxima_data) FROM checklist_modelos m
 WHERE m.tipo_ativo_id=NEW.tipo_ativo_id
 AND NOT EXISTS(SELECT 1 FROM checklist_ocorrencias o WHERE o.ativo_id=NEW.id AND o.situacao='pendente')
 ORDER BY m.versao DESC LIMIT 1 ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agendar_checklist ON ativos;
CREATE TRIGGER agendar_checklist AFTER INSERT OR UPDATE OF checklist_proxima_data ON ativos FOR EACH ROW EXECUTE FUNCTION agendar_ocorrencia_checklist();
ALTER TABLE ativos ADD COLUMN IF NOT EXISTS revisao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tipos_ativo ADD COLUMN IF NOT EXISTS revisao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE campos ADD COLUMN IF NOT EXISTS revisao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE grupos_ativos ADD COLUMN IF NOT EXISTS revisao INTEGER NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION incrementar_revisao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.revisao=OLD.revisao+1; RETURN NEW; END $$;
DO $$ DECLARE tabela TEXT; BEGIN
 FOREACH tabela IN ARRAY ARRAY['ativos','tipos_ativo','campos','grupos_ativos'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS incrementar_revisao ON %I',tabela);
 EXECUTE format('CREATE TRIGGER incrementar_revisao BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION incrementar_revisao()',tabela);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION revisar_tipo_campos() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN UPDATE tipos_ativo SET revisao=revisao WHERE id=OLD.tipo_ativo_id; END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.tipo_ativo_id<>OLD.tipo_ativo_id) THEN
 UPDATE tipos_ativo SET revisao=revisao WHERE id=NEW.tipo_ativo_id; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS revisar_tipo ON campos;
CREATE TRIGGER revisar_tipo AFTER INSERT OR UPDATE OR DELETE ON campos FOR EACH ROW EXECUTE FUNCTION revisar_tipo_campos();
CREATE OR REPLACE FUNCTION revisar_ativo_relacionado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN UPDATE ativos SET revisao=revisao WHERE id=OLD.ativo_id; END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.ativo_id<>OLD.ativo_id) THEN UPDATE ativos SET revisao=revisao WHERE id=NEW.ativo_id; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS revisar_ativo ON grupos_ativos_membros;
CREATE TRIGGER revisar_ativo AFTER INSERT OR UPDATE OR DELETE ON grupos_ativos_membros FOR EACH ROW EXECUTE FUNCTION revisar_ativo_relacionado();
DROP TRIGGER IF EXISTS revisar_ativo ON posicoes_ativos;
CREATE TRIGGER revisar_ativo AFTER INSERT OR UPDATE OR DELETE ON posicoes_ativos FOR EACH ROW EXECUTE FUNCTION revisar_ativo_relacionado();
CREATE OR REPLACE FUNCTION revisar_grupo_do_ativo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE grupos_ativos SET updated_at=NOW() WHERE id IN (SELECT grupo_id FROM grupos_ativos_membros WHERE ativo_id=NEW.id);
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS revisar_grupo ON ativos;
CREATE TRIGGER revisar_grupo AFTER UPDATE ON ativos FOR EACH ROW EXECUTE FUNCTION revisar_grupo_do_ativo();
DROP TRIGGER IF EXISTS revisar_ativo ON emprestimos_ativos;
CREATE TRIGGER revisar_ativo AFTER INSERT OR UPDATE OR DELETE ON emprestimos_ativos FOR EACH ROW EXECUTE FUNCTION revisar_ativo_relacionado();
COMMIT;
