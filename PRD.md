# PRD Insta-Clerky - Integração Instagram para Automações

## Visao Geral

O Insta-Clerky permite que usuarios conectem contas do Instagram e criem automações para responder mensagens diretas, comentarios em posts e outras interacoes. O sistema funciona de forma similar a integracao existente com WhatsApp, mas adaptado para as especificidades da API do Instagram. 

note. o Insta-Clerky é um micro-serviço deve ser criado na pasta Insta-Clerky. assim como outros micro-serviços

## Objetivos

- Permitir conexao de contas Instagram via OAuth do Meta Developers
- Criar automações estaticas baseadas em palavras-chave para mensagens diretas
- Responder automaticamente comentarios em posts
- Enviar respostas via DM quando um comentario e detectado
- Armazenar relatorios em formato de planilha com todas as interacoes
- Integrar com a estrutura existente do Clerky

## Funcionalidades Principais

### Conexao de Contas Instagram

O usuario acessa a pagina de instancias e clica em criar nova instancia de Instagram. O sistema exibe um card representando a instancia e redireciona para a tela de autorizacao do Instagram. Apos login e concessao de permissoes, o usuario retorna para a pagina de gerenciamento de instancias onde pode visualizar e administrar sua conexao.

### Automações Estaticas

O sistema permite criar regras de automação baseadas em palavras-chave. Quando uma mensagem direta contem uma palavra especifica, o sistema retorna automaticamente uma mensagem predefinida. As automações podem ser configuradas por instancia conectada.

### Resposta a Comentarios

O sistema monitora comentarios em posts da conta conectada. Quando um comentario e detectado, o sistema pode responder diretamente no comentario ou enviar uma mensagem direta para o usuario que comentou. As regras podem ser configuradas por palavra-chave ou aplicadas a todos os comentarios.

### Relatorios e Historico

O sistema salva todas as interacoes em formato de planilha com os seguintes campos:
- Data e hora da interacao
- Comentario ID quando aplicavel
- Usuario ID do Instagram
- Midia ID quando aplicavel
- Username do usuario
- Texto do comentario ou mensagem
- Texto da resposta enviada
- Tipo de interacao (DM, comentario, resposta)

## Fluxo de Usuario

### Conexao Inicial

1. Usuario acessa pagina de instancias
2. Clica em criar nova instancia de Instagram
3. Sistema exibe card da instancia
4. Usuario e redirecionado para tela de autorizacao do Instagram
5. Usuario faz login no Instagram e concede permissoes
6. Sistema processa callback OAuth
7. Usuario retorna para pagina de gerenciamento de instancias
8. Instancia aparece como conectada e ativa

### Criacao de Automacao

1. Usuario seleciona instancia conectada
2. Acessa secao de automacoes
3. Cria nova automacao
4. Define tipo: mensagem direta ou comentario
5. Configura palavras-chave ou condicoes
6. Define texto da resposta
7. Salva automacao
8. Automacao fica ativa e comeca a processar interacoes

### Processamento de Interacoes

1. Webhook recebe evento do Instagram
2. Sistema identifica tipo de evento (DM ou comentario)
3. Sistema busca automacoes ativas para a instancia
4. Sistema verifica se evento corresponde a alguma regra
5. Se corresponder, sistema envia resposta automatica
6. Sistema registra interacao no relatorio
7. Frontend recebe atualizacao via WebSocket se necessario

## Arquitetura Tecnica

### Integracao com Backend Existente

O Insta-Clerky sera integrado ao backend principal do Clerky, utilizando a mesma estrutura de rotas, middlewares e servicos. As instancias do Instagram serao armazenadas no MongoDB junto com as instancias do WhatsApp, mas com schema diferenciado.

### Banco de Dados

MongoDB sera utilizado para armazenar as instancias do Instagram, seguindo o mesmo padrao das instancias do WhatsApp. PostgreSQL sera utilizado para armazenar mensagens, comentarios, templates de automacao e relatorios, similar ao sistema de CRM existente.

### Estrutura de Dados MongoDB

Collection instagram_instances:
- _id: ObjectId
- userId: ObjectId referencia para User
- instanceName: String nome unico da instancia
- name: String nome escolhido pelo usuario
- instagramAccountId: String ID da conta no Instagram
- username: String username do Instagram
- accessToken: String token de acesso long-lived
- pageId: String ID da pagina associada
- pageName: String nome da pagina
- tokenExpiresAt: Date data de expiracao do token
- status: String created, connecting, connected, disconnected, error
- webhookIds: Array de Strings IDs alternativos para webhooks
- createdAt: Date
- updatedAt: Date

### Estrutura de Dados PostgreSQL

Tabela instagram_messages:
- id: UUID
- instance_id: String referencia para instancia
- user_id: String referencia para usuario
- sender_id: String ID do remetente no Instagram
- recipient_id: String ID do destinatario
- message_id: String ID unico da mensagem
- text: String conteudo da mensagem
- timestamp: Timestamp
- replied: Boolean se foi respondida
- raw_data: JSONB dados completos do webhook
- created_at: Timestamp
- updated_at: Timestamp

Tabela instagram_comments:
- id: UUID
- instance_id: String referencia para instancia
- user_id: String referencia para usuario
- comment_id: String ID unico do comentario
- post_id: String ID do post
- media_id: String ID da midia
- from_user_id: String ID do usuario que comentou
- from_username: String username do usuario
- text: String texto do comentario
- timestamp: Timestamp
- replied: Boolean se foi respondido
- reply_text: String texto da resposta se houver
- raw_data: JSONB dados completos do webhook
- created_at: Timestamp
- updated_at: Timestamp

Tabela instagram_automations:
- id: UUID
- user_id: String referencia para usuario
- instance_id: String referencia para instancia
- name: String nome da automacao
- type: String dm ou comment
- trigger_type: String keyword ou all
- keywords: Array de Strings palavras-chave
- response_text: String texto da resposta
- response_type: String direct ou comment
- is_active: Boolean se esta ativa
- created_at: Timestamp
- updated_at: Timestamp

Tabela instagram_reports:
- id: UUID
- instance_id: String referencia para instancia
- user_id: String referencia para usuario
- interaction_type: String dm ou comment
- comment_id: String ID do comentario se aplicavel
- user_id_instagram: String ID do usuario no Instagram
- media_id: String ID da midia se aplicavel
- username: String username do usuario
- interaction_text: String texto da interacao
- response_text: String texto da resposta
- timestamp: Timestamp
- created_at: Timestamp

## Integracao com Meta Developers

### Configuracao OAuth

O sistema utilizara o fluxo OAuth do Instagram Business Login conforme documentacao oficial. As variaveis de ambiente necessarias sao:

META_GRAPH_VERSION=v24.0
META_APP_ID=1446559600506963
META_APP_SECRET=3061bb822fb6eba60f89c670a45eccec
META_REDIRECT_URI=https://back.clerky.com.br/api/instagram/callback
META_VERIFY_TOKEN=Tokenf7j4hd723fG5o2wle

### Permissoes Necessarias

O sistema solicitara as seguintes permissoes durante o OAuth:
- instagram_business_basic
- instagram_business_manage_messages
- instagram_business_manage_comments
- instagram_business_content_publish
- instagram_business_manage_insights

### Fluxo OAuth

1. Usuario clica em conectar Instagram
2. Sistema redireciona para URL de autorizacao do Instagram
3. Usuario faz login e concede permissoes
4. Instagram redireciona para callback com codigo de autorizacao
5. Sistema troca codigo por access token de curta duracao
6. Sistema troca token de curta duracao por long-lived token
7. Sistema obtem informacoes da conta Instagram
8. Sistema salva instancia no MongoDB
9. Sistema redireciona usuario para pagina de gerenciamento

### Webhooks

O sistema configurara webhooks no Meta App para receber eventos em tempo real. O endpoint de webhook sera:

POST /webhook/instagram/:instanceName

O webhook recebera eventos de:
- Mensagens diretas recebidas
- Comentarios em posts
- Respostas a comentarios
- Outras interacoes relevantes

## Automações

### Tipos de Automacao

Automacao por Palavra-Chave em DM:
- Usuario define palavras-chave
- Quando mensagem contem palavra-chave, sistema responde automaticamente
- Resposta pode ser texto predefinido

Automacao para Comentarios:
- Usuario pode configurar para responder todos os comentarios
- Ou configurar palavras-chave especificas
- Resposta pode ser no proprio comentario ou via DM

### Processamento de Automacoes

Quando um evento e recebido via webhook:
1. Sistema identifica instancia relacionada
2. Sistema busca automacoes ativas para aquela instancia
3. Sistema verifica se evento corresponde a alguma regra
4. Se corresponder, sistema executa resposta automatica
5. Sistema registra interacao no relatorio
6. Sistema atualiza status da automacao se necessario

## Relatorios

### Estrutura do Relatorio

Os relatorios serao armazenados na tabela instagram_reports do PostgreSQL e poderao ser exportados em formato CSV ou visualizados na interface web. Cada registro contem:

- Data e hora da interacao
- Tipo de interacao (DM ou comentario)
- ID do comentario se aplicavel
- ID do usuario no Instagram
- ID da midia se aplicavel
- Username do usuario
- Texto da interacao original
- Texto da resposta enviada
- Status da resposta (enviada, falha, pendente)

### Visualizacao de Relatorios

O frontend tera uma secao dedicada para visualizar relatorios, com opcoes de filtro por:
- Instancia
- Tipo de interacao
- Periodo de tempo
- Status da resposta
- Usuario especifico

## Requisitos Tecnicos

### Backend

- Integrar rotas de Instagram no backend principal
- Criar controller para gerenciar instancias do Instagram
- Criar service para processar webhooks do Instagram
- Criar service para gerenciar automacoes
- Criar service para gerar relatorios
- Implementar refresh automatico de tokens
- Implementar validacao de webhooks

### Frontend

- Adicionar opcao de criar instancia Instagram na pagina de instancias
- Criar interface para configurar automacoes
- Criar interface para visualizar relatorios
- Integrar com sistema de WebSocket existente para atualizacoes em tempo real
- Adicionar indicadores de status das instancias

### Banco de Dados

- Criar migrations para tabelas do PostgreSQL
- Criar indices para otimizar consultas
- Implementar constraints para garantir integridade
- Configurar backups automaticos

## Seguranca

- Tokens de acesso devem ser armazenados de forma segura
- Webhooks devem ser validados com verify token
- Todas as comunicacoes devem usar HTTPS
- Implementar rate limiting para evitar abuso
- Validar todas as entradas de usuario
- Implementar logs de auditoria para acoes importantes

## Consideracoes de Implementacao

- O sistema deve seguir os mesmos padroes de codigo do Clerky existente
- Reutilizar middlewares de autenticacao existentes
- Integrar com sistema de permissoes premium existente
- Manter consistencia com interface de instancias do WhatsApp
- Implementar tratamento de erros robusto
- Criar testes para fluxos criticos

## Referencias de Documentacao

- Instagram Business Login: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- Access Token: https://developers.facebook.com/docs/instagram-platform/reference/access_token
- OAuth Authorize: https://developers.facebook.com/docs/instagram-platform/reference/oauth-authorize
- Refresh Access Token: https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token

---

Este PRD serve como base para implementacao do Insta-Clerky, integrando-se perfeitamente com a arquitetura existente do sistema Clerky.
