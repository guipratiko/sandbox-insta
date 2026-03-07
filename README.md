# Insta-Clerky

Microserviço de Instagram para Clerky - Sistema de automações para mensagens diretas e comentários.

## Descrição

O Insta-Clerky permite que usuários conectem contas do Instagram e criem automações para responder mensagens diretas, comentários em posts e outras interações.

## Funcionalidades

- Conexão de contas Instagram via OAuth do Meta Developers
- Automações baseadas em palavras-chave para mensagens diretas
- Resposta automática a comentários em posts
- Envio de respostas via DM quando um comentário é detectado
- Relatórios e histórico de todas as interações

## Estrutura

```
Insta-Clerky/
├── src/
│   ├── config/          # Configurações (constants, databases)
│   ├── controllers/     # Controllers das rotas
│   ├── services/        # Lógica de negócio
│   ├── routes/          # Definição de rotas
│   ├── middleware/      # Middlewares (auth, errorHandler)
│   ├── models/          # Modelos MongoDB
│   ├── socket/          # Cliente Socket.io
│   ├── utils/           # Utilitários
│   └── server.ts        # Servidor principal
```

## Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
PORT=4335
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRE=7d

# PostgreSQL
POSTGRES_URI=postgres://user:password@localhost:5432/clerky_db

# MongoDB
MONGODB_URI=mongodb://localhost:27017/clerky

# Socket.io (Backend Principal)
SOCKET_URL=http://localhost:4331

# Meta/Instagram API
META_GRAPH_VERSION=v24.0
META_APP_ID=your-app-id
META_APP_SECRET=your-app-secret
META_REDIRECT_URI=https://back.clerky.com.br/api/instagram/callback
META_VERIFY_TOKEN=your-verify-token
```

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Produção

```bash
npm start
```

## Porta

O microserviço roda na porta **4335** por padrão.

## Endpoints

### Instâncias
- `POST /api/instagram/instances` - Criar instância
- `GET /api/instagram/instances` - Listar instâncias
- `GET /api/instagram/instances/:id` - Obter instância
- `PUT /api/instagram/instances/:id` - Atualizar instância
- `DELETE /api/instagram/instances/:id` - Deletar instância
- `GET /api/instagram/instances/:id/oauth` - Iniciar OAuth
- `GET /api/instagram/oauth/callback` - Callback OAuth
- `POST /api/instagram/instances/:id/refresh-token` - Renovar token

### Automações
- `POST /api/instagram/automations` - Criar automação
- `GET /api/instagram/automations` - Listar automações
- `GET /api/instagram/automations/:id` - Obter automação
- `PUT /api/instagram/automations/:id` - Atualizar automação
- `DELETE /api/instagram/automations/:id` - Deletar automação
- `POST /api/instagram/automations/:id/toggle` - Ativar/Desativar

### Relatórios
- `GET /api/instagram/reports` - Listar relatórios
- `GET /api/instagram/reports/export` - Exportar relatórios
- `GET /api/instagram/reports/stats` - Estatísticas

### Webhooks
- `GET /webhook/instagram/:instanceName` - Verificação do webhook
- `POST /webhook/instagram/:instanceName` - Receber eventos do Meta

## Integração com Backend Principal

O backend principal deve ter um proxy configurado para redirecionar requisições de `/api/instagram/*` para este microserviço.

## Status

🚧 **Em Desenvolvimento** - Estrutura base criada, implementação das funcionalidades em andamento.
