# BuildSight Collector

CLI para coletar commits e métricas de repositórios locais e enviar para a API do BuildSight.

## Instalação

Instalar globalmente:

```bash
npm install -g buildsight-collector
```

Ou usar diretamente com npx (sem instalar):

```bash
npx buildsight-collector <token>
```

## Comandos

### Coletar e enviar dados

Executa a coleta dos repositórios configurados e envia os commits para o BuildSight.

```bash
npx buildsight-collector <token>
```

### Configurar repositórios

Abre o assistente interativo para selecionar quais repositórios locais serão monitorados.

```bash
npx buildsight-collector config-repos <token>
```

### Dry-run (testar sem gravar)

Executa toda a pipeline de coleta e validação, mas **não grava nenhum dado em produção**.
Útil para verificar o funcionamento antes de subir uma atualização.

```bash
npx buildsight-collector <token> --dry-run
```

O dry-run realiza as mesmas etapas da coleta normal — autenticação, leitura do git, normalização dos commits — e consulta o banco de dados para checar duplicatas, mas não escreve nada. Ao final, exibe um relatório:

```text
🧪 Modo Dry-Run — nenhum dado será gravado em produção.

📂 Testando repositório: meu-projeto
   Período: últimos 7 dia(s) (desde 14/02/2026)

   Amostra de commits que seriam inseridos:
   • [a1b2c3d] João Silva — fix: corrige validação do formulário
   • [e4f5g6h] Maria Santos — feat: adiciona exportação CSV

   📊 Resultado para meu-projeto:
      Commits coletados localmente : 50
      Commits válidos              : 48
      Já existem no banco          : 10
      Seriam inseridos             : 38
      Branches detectadas          : 4
      Arquivos com métricas        : 120

✅ Dry-run concluído. Nenhum dado foi gravado.
```

## Parâmetros

| Parâmetro     | Descrição                                              |
|---------------|--------------------------------------------------------|
| `<token>`     | Token de autenticação gerado pelo BuildSight           |
| `--dry-run`   | Simula a coleta sem gravar nada no banco de dados      |

## Requisitos

- Node.js 14+
