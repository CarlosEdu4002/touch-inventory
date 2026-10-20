-- Anexos de cada execução; arquivos ficam no volume persistente uploads/ativos.
ALTER TABLE execucoes_checklist
    ADD COLUMN IF NOT EXISTS imagens JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'checklist_imagens_limite'
          AND conrelid = 'execucoes_checklist'::regclass
    ) THEN
        ALTER TABLE execucoes_checklist
            ADD CONSTRAINT checklist_imagens_limite
            CHECK (jsonb_typeof(imagens) = 'array' AND jsonb_array_length(imagens) <= 6);
    END IF;
END $$;
