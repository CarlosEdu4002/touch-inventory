# Lista de melhorias do Touch Inventory

Atualizada em 20/10/2026. As marcações se referem ao código sincronizado, não à homologação de uma instalação.

- [x] Autenticação, autorização por unidade e setor e consulta NFC autenticada por unidade e ID permanente.
- [x] Validação de campos no servidor, transações, histórico e controle de concorrência.
- [x] Lixeira de ativos, checklists com anexos, grupos, mapas e exportações.
- [x] Interface e manual com identidade genérica; nome e logo de unidades continuam configuráveis.
- [x] Iniciar instalação Docker isolada na porta 3002 e aplicar migrações em banco novo de teste.
- [x] Comparar integralmente API, interface, migrações, dependências e testes com a origem e executar `npm test` em ambos usando banco descartável.
- [ ] Conferir fluxos autenticados em desktop e celular após o primeiro cadastro na instalação Docker de demonstração.
- [ ] Decidir como alinhar a persistência de anexos de checklist no Compose da origem, que não declara o volume adicional presente no Touch Inventory.
- [ ] Validar migração do banco antigo do Touch Inventory em cópia isolada, incluindo reconciliação de sequências.
- [ ] Ensaiar recuperação integral de banco e uploads com tempo medido.
- [ ] Homologar NFC físico, permissões, checklists, arquivos e exportações em instalação de teste.
- [ ] Configurar domínio estável, HTTPS e rotina de backup para cada implantação.
