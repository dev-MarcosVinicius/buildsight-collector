# BuildSight Collector

CLI para coletar commits e métricas de repositórios locais e enviar para a API do BuildSight.

Uso rápido

Instalar globalmente (após publicar no npm):

```bash
npm install -g buildsight-collector
```

Executar:

```bash
buildsight-collector <token>
```

Ou usar com npx (sem instalar globalmente):

```bash
npx buildsight-collector <token>
```

Parâmetros

- <token>: token de autenticação gerado pela API do BuildSight.

Publicação no npm

1. Verifique o `name` em `package.json` e confirme que está disponível no npm (se já estiver em uso, escolha um nome distinto ou um scope como `@seu-usuario/buildsight-collector`).
2. Faça login no npm:

```bash
npm login
```

3. Publicar (público):

```bash
npm publish --access public
```

Se usar um scoped package e quiser publicação pública, precisa `--access public`.

Observações

- Substitua `author` e `repository.url` em `package.json` pelos seus valores reais antes de publicar.
- Este pacote já inclui o `bin` apontando para `index.js`, que tem shebang para execução como CLI.
- Node.js mínimo sugerido: 14+.
