# Pulse & Pace | Gestão de Atacado

Painel de gestão de camisetas personalizadas. Reúne clientes, catálogo, preços de atacado, orçamentos, pedidos, etapas de produção e controle financeiro.

O Estúdio de Personalização permite aplicar logos e criar artes de sublimação total. O editor aceita imagens para frente, costas, mangas e ombros, com posições predefinidas, ajuste de escala e rotação e prévia em 2D. A versão da arte acompanha o orçamento e fica vinculada ao pedido gerado.

## Stack e pré-requisitos

- Node.js 22.13.0 ou superior e npm
- Git para clonar o repositório
- TypeScript, React e Next.js App Router, executados com Vinext e Vite
- Cloudflare Workers, D1 e R2. O Wrangler disponibiliza D1 e R2 localmente. O Drizzle mantém as migrações SQL.

## Instalar e rodar no Windows

Execute no PowerShell, na raiz do projeto.

1. Copie o manifesto de exemplo para ativar os bindings locais e instale as dependências do lockfile.

   ```powershell
   Copy-Item .openai/hosting.example.json .openai/hosting.json
   npm run install:ci
   ```

2. Gere a configuração do Wrangler e aplique a migração inicial ao banco local. Aplique essa migração uma vez por banco novo.

   ```powershell
   npm run build
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cheerful_the_call.sql
   ```

3. Inicie o ambiente de desenvolvimento.

   ```powershell
   npm run dev -- --host 127.0.0.1
   ```

   Abra a URL local impressa pelo terminal, normalmente `http://127.0.0.1:5173/`. Clique em **Entrar com ChatGPT** para usar a identidade simulada do ambiente de desenvolvimento local. A primeira conta a entrar em um banco novo recebe o perfil de administrador. Cadastre um cliente e um produto para começar a usar o estúdio.

## Configuração e variáveis de ambiente

O desenvolvimento local dispensa arquivo `.env` e chaves de API. O exemplo de manifesto configura os bindings `DB` (D1, registros) e `BUCKET` (R2, imagens e prévias). No ambiente hospedado, o Sites fornece esses bindings e a identidade autenticada do ChatGPT.

As variáveis abaixo são opcionais para ajustar o ambiente local. Os padrões ficam em `scripts/tool-environment.mjs`.

| Variável | Finalidade |
| --- | --- |
| `SITES_RUNTIME_ROOT` | Altera o caminho base do estado das ferramentas locais. |
| `CLOUDFLARE_CF_FETCH_ENABLED` | Habilita a busca de metadados de requisição no ambiente local. |
| `WRANGLER_SEND_METRICS` | Ativa o envio de métricas do Wrangler. |
| `WRANGLER_WRITE_LOGS` | Ativa a gravação de logs do Wrangler. |
| `WRANGLER_LOG_PATH`, `WRANGLER_REGISTRY_PATH`, `MINIFLARE_REGISTRY_PATH` | Alteram os caminhos locais de logs e registros. |

A configuração de hospedagem vinculada a uma instância, os bancos e arquivos locais de usuários e quaisquer credenciais ficam fora do controle de versão. Guarde os valores de produção no ambiente de hospedagem.

## Comandos do projeto

| Comando | Ação |
| --- | --- |
| `npm run dev` | Inicia o servidor de desenvolvimento. |
| `npm run build` | Gera o Worker e os arquivos do cliente em `dist/`. |
| `npm start` | Abre localmente o Worker compilado com Wrangler. A identidade simulada está disponível pelo servidor de desenvolvimento. |
| `npm run lint` | Executa a análise estática do ESLint. |
| `npm run db:generate` | Gera migrações a partir do schema Drizzle. |
