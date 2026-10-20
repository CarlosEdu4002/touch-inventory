# Touch Inventory

Sistema web genérico de gestão de ativos com leitura autenticada por etiquetas NFC. Permite cadastrar unidades com nome e logo próprios, setores, usuários, categorias, tipos, campos personalizados e status.

Inclui histórico de ativos, empréstimos, grupos, mapas, checklists com anexos, lixeira recuperável e exportações CSV/PDF. A API usa Node.js 22, Express e PostgreSQL 17; a interface usa HTML, CSS e JavaScript.

## Instalação

Consulte [Instalação](docs/operacao/INSTALACAO.md). Para desenvolvimento, configure um PostgreSQL exclusivo de testes, instale as dependências em `Backend/api` com `npm ci` e inicie com `npm start`. O Compose da raiz oferece aplicação e banco isolados por volumes próprios. Não execute migrações diretamente em um banco com dados existentes sem cópia de segurança e ensaio de restauração.

Na primeira entrada, crie uma conta nominal de administrador e a primeira unidade. O nome e o logo dessa unidade são dados configuráveis na interface, inclusive em instalações com várias unidades. A aplicação não impõe marca empresarial.

## NFC e acesso

As etiquetas novas devem apontar para `ativo.html?unidade=ID_DA_UNIDADE&ativo=ID_DO_ATIVO` no endereço estável da instalação. Após a leitura, o sistema exige login e seleciona a unidade indicada quando a conta possui acesso. Endereços antigos por tipo e patrimônio precisam ser regravados. A leitura contínua da lista aceita leitores que digitam a URL e leitores NFC-X compatíveis.

## Estrutura e documentação

- `Backend/api`: API, regras de negócio, models, migrações e testes.
- `FrontEnd`: interface, ajuda e biblioteca PDF.js com sua licença.
- `Imagens`: marca genérica do Touch Inventory; o logo de cada unidade é cadastrado pelo administrador.
- `uploads`: dados locais; preservar em atualizações.
- `docs/README.md`: índice, estado atual e planejamento.

O [manual no sistema](FrontEnd/manual.html) descreve os fluxos. As capturas da instalação de origem foram retiradas para não distribuir dados nem identidade de outra organização.
