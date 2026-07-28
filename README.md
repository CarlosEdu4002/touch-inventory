# Touch Inventory

Sistema web genérico para gestão de ativos, controle patrimonial e consulta rápida por etiquetas NFC.

O Touch Inventory foi projetado para organizações de diferentes segmentos. Cada instalação pode cadastrar seus próprios setores, usuários, categorias, tipos de ativo, campos personalizados e status, sem depender de uma estrutura empresarial predefinida.

## Funcionalidades

- Cadastro, edição, consulta e remoção de ativos;
- categorias e tipos de ativo configuráveis;
- campos personalizados por tipo de ativo;
- organização e transferência de ativos entre setores;
- histórico de alterações e movimentações;
- painel com indicadores do inventário;
- status personalizáveis, com nome, cor e ordem;
- usuários administradores e usuários vinculados a setores;
- gerenciamento de contas e encerramento de sessões;
- consulta pública de ativos por links gravados em etiquetas NFC;
- impressão de etiquetas;
- interface responsiva.

## Tecnologias

### Front-end

- HTML5;
- CSS3;
- JavaScript;
- Fetch API.

### Back-end

- Node.js 18 ou superior;
- Express 5;
- PostgreSQL;
- `pg`;
- `dotenv`;
- `cors`.

## Estrutura

```text
Touch Inventory/
├── Backend/
│   └── api/
│       ├── controllers/
│       ├── database/
│       ├── middlewares/
│       ├── models/
│       ├── routes/
│       ├── services/
│       ├── utils/
│       ├── .env.example
│       ├── package.json
│       └── server.js
├── Exec/
│   └── iniciar.bat
├── FrontEnd/
│   ├── css/
│   ├── js/
│   └── *.html
├── Imagens/
└── README.md
```

## Pré-requisitos

- [Node.js](https://nodejs.org/) 18 ou superior;
- [PostgreSQL](https://www.postgresql.org/);
- [Git](https://git-scm.com/), caso queira clonar o projeto.

## Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/SEU-USUARIO/touch-inventory.git
cd touch-inventory/Backend/api
```

Substitua `SEU-USUARIO` pelo proprietário do repositório.

### 2. Instale as dependências

```bash
npm install
```

### 3. Crie o banco

```sql
CREATE DATABASE touch_inventory;
```

O sistema cria e atualiza as tabelas automaticamente ao iniciar.

### 4. Configure o ambiente

Copie `.env.example` para `.env` e informe as credenciais do PostgreSQL:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=touch_inventory
DB_USER=postgres
DB_PASSWORD=sua_senha
```

O `.env` está ignorado pelo Git e não deve ser publicado.

### 5. Inicie

```bash
npm start
```

Acesse [http://localhost:3000](http://localhost:3000).

Durante o desenvolvimento, também é possível reiniciar automaticamente após alterações:

```bash
npm run dev
```

## Configuração inicial

No primeiro acesso, crie a senha da conta `admin`. Essa conta possui acesso completo e permite configurar a instalação:

1. abra **Gestão do sistema**;
2. cadastre os setores da organização;
3. adicione os usuários e vincule-os aos setores;
4. configure os status dos ativos;
5. abra **Administração**;
6. cadastre categorias, tipos de ativo e seus campos personalizados.

Nenhum setor ou usuário operacional é criado automaticamente.

## Etiquetas NFC

Depois de cadastrar um ativo, use a opção **Imprimir etiqueta**. O endereço público possui o formato:

```text
https://inventario.exemplo.com/ativo.html?tipo=TIPO&id=PATRIMONIO
```

Grave esse endereço na tag NFC. Em uma rede local, substitua o domínio pelo endereço IP do servidor. Não use `localhost` na tag, pois ele aponta para o dispositivo que realizou a leitura.

## Execução no Windows

O arquivo `Exec/iniciar.bat` localiza o projeto por meio do próprio diretório, instala as dependências quando necessário, inicia o servidor e abre o navegador. Ele não contém caminhos pessoais e pode ser usado em diferentes computadores.

## API

As rotas administrativas exigem autenticação. A consulta usada pelas etiquetas NFC é pública.

| Recurso | Caminho base |
|---|---|
| Autenticação | `/api/auth` |
| Consulta pública | `/api/publico/ativos` |
| Ativos e histórico | `/api` |
| Categorias | `/api/categorias` |
| Tipos de ativo | `/api/tipos` |
| Campos personalizados | `/api/campos` |
| Setores | `/api/setores` |
| Usuários, status e painel | `/api/gestao` |

## Segurança

- Senhas protegidas com `scrypt` e salt individual;
- tokens armazenados no banco somente na forma de hash;
- sessões com expiração de oito horas;
- autorização por perfil;
- cookies seguros quando `NODE_ENV=production`;
- limite de tentativas de autenticação.

Em produção, utilize HTTPS, restrinja o acesso ao PostgreSQL, configure credenciais fortes e mantenha as dependências atualizadas.

## Personalização

O projeto pode ser adaptado sem modificar suas regras centrais:

- cadastre a estrutura da organização pela interface;
- substitua `Imagens/logo.svg` pela identidade visual desejada;
- ajuste cores nos arquivos em `FrontEnd/css`;
- configure o endereço público usado nas etiquetas;
- acrescente campos adequados a cada tipo de ativo.

## Contribuição

Contribuições são bem-vindas. Abra uma issue para relatar problemas ou sugerir melhorias e envie um pull request com alterações objetivas.

## Autor

Desenvolvido por **Carlos Eduardo Gonçalves de Carvalho**.
