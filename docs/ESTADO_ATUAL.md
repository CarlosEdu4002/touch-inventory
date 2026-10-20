# Estado atual — Touch Inventory

Atualizado em 20/10/2026, branch `codex/sincronizar-melhorias-interface`.

## Auditoria de paridade — 20/10/2026

- Comparados os arquivos de `Backend/api` e `FrontEnd` entre os dois projetos, sem dados locais nem dependências instaladas. Após normalizar somente marca, logo e favicon, 176 dos 180 arquivos textuais comuns coincidem. Os outros quatro são `package.json`, `package-lock.json` (nome/descrição genéricos), `rodape.js` (contato empresarial substituído) e `manual.html` (figuras da origem retiradas). O manual coincide integralmente após retirar as figuras e a frase sobre elas; dependências e scripts do pacote coincidem. Não restam arquivos exclusivos em `Backend/api` ou `FrontEnd`: três módulos legados sem uso foram removidos do destino.
- A suíte completa `npm test` passou nos dois códigos, em cópias separadas e no mesmo PostgreSQL novo e descartável. Cobriu segurança, permissões, NFC, transações, concorrência, multiunidades, migrações, lixeira, mapas, checklists e exportações. Cada execução terminou com `PASSOU: regressões de segurança e verificações solicitadas` e MU-06 com nove unidades; o banco de teste foi encerrado. Código e dados da origem permaneceram intactos.
- O Dockerfile é idêntico. No Compose, o destino mantém um volume adicional para anexos de checklist, evitando perda ao recriar o contêiner; a origem não declara esse volume. O fuso horário padrão e a instalação Docker local do destino foram alinhados a `America/Cuiaba`; o app da porta 3002 reiniciou sem recriar o banco e respondeu HTTP 200. A documentação, os roteiros de laboratório da origem e o inicializador Windows do destino também diferem por instalação; não alteram as regras de negócio verificadas.
- Busca pelas marcas, nomes e contatos da empresa de origem no destino: nenhuma ocorrência textual. `git diff --check` aprovado. Ainda faltam aceite visual autenticado em desktop/celular e teste NFC com dispositivo físico; o banco Docker da porta 3002 permanece sem administrador inicial.
- Próximo passo concreto: o administrador da instalação pode criar a conta inicial e a primeira unidade na porta 3002 e conferir os fluxos autenticados. Para equivalência operacional estrita, cabe ao administrador decidir se adiciona à origem a persistência dos anexos de checklist; a origem não foi modificada nesta auditoria.

## Ambiente Docker isolado — 19/10/2026

- Projeto Compose `touch-inventory-demo` iniciado na porta externa 3002, com PostgreSQL e volumes próprios para banco, ativos, plantas e anexos de checklist. O `.env` local foi criado com senha aleatória e continua ignorado pelo Git; os projetos nas portas 3000 e 3001 não foram alterados.
- A imagem `touch-inventory:1.3.1` foi construída. O banco novo ficou saudável, a API aplicou as migrações e confirmou um esquema patrimonial compatível. `/versao`, login, manual, logo e favicon responderam HTTP 200; `/api/ativos/1` sem sessão respondeu 401. `/api/auth/status` informou `configurado: false`, como esperado antes do primeiro administrador.
- Pendente: cadastrar a conta nominal inicial e a primeira unidade pela interface e testar os fluxos autenticados. A porta publicada é `http://localhost:3002`.

## Concluído no código

- Sincronizados frontend, API, serviços, models, migrações e testes da versão de origem 1.3.1, com marca e textos de Touch Inventory.
- Mantido o logo genérico do destino. Logos e nomes cadastrados para unidades continuam configuráveis.
- Preservados `.git`, `.env`, uploads, bancos e os sete arquivos locais modificados em cópia autorizada fora do projeto. As melhorias de histórico, status e células de tabela desses arquivos estão presentes na versão sincronizada.
- Manual HTML atualizado sem as capturas da instalação de origem; o conteúdo textual acompanha os fluxos atuais.

## Validação e limites da sincronização — 19/10/2026

- Sintaxe: 140 arquivos JavaScript/CJS aprovados por `node --check`. Testes unitários de campos, anexos e exportações: 16/16 aprovados; teste PDF de mapas: 1/1 aprovado em cópia isolada, sem tocar os uploads do projeto.
- HTTP sem banco: `/versao`, login, manual, logo e favicon responderam 200; ativos, NFC e arquivos de ativos/plantas sem sessão responderam 401. Foram verificadas 108 referências locais em 14 páginas HTML, sem arquivos ausentes. Busca por referências empresariais no código, documentação e configurações não retornou resultados. `git diff --check` aprovado.
- A conferência visual no navegador em desktop e celular não foi concluída: a política do navegador bloqueou o acesso ao arquivo local, sem permitir outro caminho para a mesma ação.
- Integração com PostgreSQL, escrita em banco de testes, migração do banco antigo, login autenticado e leitura de etiqueta NFC física não foram executados. Não havia banco de testes disponível. O banco do Touch Inventory não foi migrado nem teve dados apagados.
- Os arquivos legados `Backend/api/routes/publico.routes.js`, `Backend/api/controllers/publico.controller.js` e `FrontEnd/js/config/configCategoria.js` permaneceram nesta etapa; a auditoria de 20/10 confirmou que não eram usados e os removeu.

## Próximo passo registrado em 19/10/2026

Preparar um PostgreSQL de teste isolado, ensaiar a migração em cópia restaurada e conferir login, seleção de unidade, ativos, NFC, checklists, mapas e exportações em desktop e celular quando o navegador puder acessar o ambiente de teste.
