# Instalação e atualização

Requisitos: Node.js 22, PostgreSQL 17 e acesso a um banco dedicado. Não use um banco de produção para ensaios.

1. Em uma instalação nova, copie `.env.example` da raiz para `.env` e defina `DB_NAME`, `DB_USER` e `DB_PASSWORD`. Não registre valores reais no repositório.
2. Use `docker compose up --build` na raiz, ou instale as dependências com `npm ci` em `Backend/api` e execute `npm start` apontando para um PostgreSQL dedicado.
3. No primeiro acesso, cadastre uma conta nominal de administrador, crie a unidade e, se desejar, envie o logo dessa unidade. Depois cadastre setores, usuários, categorias e tipos.
4. A API aplica, na inicialização, os esquemas e migrações versionadas em `Backend/api/database/`. A tabela `public.migracoes_aplicadas` registra escopo, versão e checksum. A inicialização recusa uma migração previamente aplicada cujo conteúdo tenha mudado.

## Atualização de banco existente

Antes de iniciar a versão nova, faça cópia integral do banco e dos uploads e teste a restauração em ambiente separado. A migração para multiunidades altera esquema e identidade dos ativos; execute primeiro em cópia isolada e confira contagens, imagens, permissões e links NFC. Não substitua nem apague dados existentes para resolver incompatibilidades. A reversão pode exigir restaurar banco e arquivos juntos.

As etiquetas novas usam `ativo.html?unidade=ID_DA_UNIDADE&ativo=ID_DO_ATIVO`. URLs antigas por tipo/patrimônio precisam ser regravadas após a homologação do endereço definitivo.

## Testes

Em `Backend/api`, consulte os scripts de `package.json`. Execute testes unitários com `node --test tests/campos.unit.cjs tests/mapas-pdf.unit.js tests/exportacoes.unit.js tests/checklists-imagens.unit.js`. Os testes de integração e de escrita exigem banco de testes isolado e configuração adequada; não os aponte para a instalação existente.
