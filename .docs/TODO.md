# TODO - BuildSight Collector

Roadmap de melhorias e novas features para expandir a coleta de métricas de desenvolvimento.

---

## 1. Métricas Avançadas de Git

### 1.1 Análise de Código por Commit
- [ ] Detecção de code churn (arquivos frequentemente reescritos)
- [ ] Identificação de arquivos "hot spots" (alta frequência de bugs/mudanças)

### 1.2 Métricas de Colaboração
- [ ] Co-autoria de commits (Co-authored-by)
- [ ] Frequência de pair programming (commits com múltiplos autores)
- [ ] Grafo de colaboração entre desenvolvedores (quem trabalha junto)
- [ ] Análise de code review (commits após review vs diretos)

### 1.3 Análise de Branches
- [ ] Tempo médio de vida de branches (feature branches)
- [ ] Branches órfãs ou abandonadas
- [ ] Frequência de conflitos de merge por branch
- [ ] Padrões de branching (GitFlow, trunk-based, etc.)

### 1.4 Métricas de Pull Requests
- [ ] Tempo entre abertura e merge do PR
- [ ] Número de revisões/comentários por PR
- [ ] Taxa de aprovação vs rejeição
- [ ] Tamanho médio dos PRs (arquivos/linhas)
- [ ] PRs sem review

### 1.5 Padrões de Trabalho
- [ ] Horários de commit por desenvolvedor (detectar overtime)
- [ ] Distribuição de commits por dia da semana
- [ ] Streaks de produtividade
- [ ] Gaps de atividade (férias, afastamentos)

---

## 2. Métricas de Qualidade

### 2.1 Conventional Commits
- [ ] Validação de padrão de mensagens (feat, fix, chore, etc.)
- [ ] Estatísticas de adesão ao padrão por desenvolvedor
- [ ] Detecção de commits mal formatados

### 2.2 Análise de Bugs e Fixes
- [ ] Correlação entre commits de fix e commits originais (git blame)
- [ ] Taxa de bugs introduzidos por desenvolvedor
- [ ] Tempo médio para correção de bugs (MTTR)
- [ ] Identificação de regressões

### 2.3 Testes
- [ ] Commits que alteram código de teste vs código de produção
- [ ] Proporção de código testado por commit
- [ ] Detecção de commits sem testes associados

---

## 3. Integrações Externas

### 3.1 Jira
- [ ] Vincular commits a tickets/issues do Jira (via regex no commit message)
- [ ] Tempo de ciclo por ticket (backlog → done)
- [ ] Story points entregues por sprint/desenvolvedor
- [ ] Taxa de tickets reabertos
- [ ] Distribuição de tipos de issue (bug, task, story, epic)
- [ ] Tempo em cada status do workflow

### 3.2 Trello
- [ ] Vincular commits a cards do Trello
- [ ] Métricas de throughput por lista/board
- [ ] Tempo médio de cards em cada coluna
- [ ] WIP (Work in Progress) por desenvolvedor

### 3.3 GitHub/GitLab Issues
- [ ] Sincronização de issues com commits
- [ ] Métricas de issues abertas vs fechadas
- [ ] Tempo médio de resolução de issues
- [ ] Labels mais frequentes

### 3.4 Slack/Teams
- [ ] Notificações de deploys e releases
- [ ] Alertas de métricas anômalas
- [ ] Resumos diários/semanais automáticos

### 3.5 CI/CD (GitHub Actions, GitLab CI, Jenkins)
- [ ] Taxa de builds quebrados por desenvolvedor/branch
- [ ] Tempo médio de build
- [ ] Frequência de deploys
- [ ] Rollbacks e suas causas

### 3.6 SonarQube/Code Climate
- [ ] Importar métricas de qualidade de código
- [ ] Debt técnico por módulo/desenvolvedor
- [ ] Evolução de code smells ao longo do tempo

---

## 4. Dashboards e Relatórios

### 4.1 Métricas de Time
- [ ] Velocity do time (commits, PRs, story points)
- [ ] Distribuição de carga de trabalho
- [ ] Bus factor (concentração de conhecimento)
- [ ] Onboarding progress (novos membros do time)

### 4.2 Métricas Individuais
- [ ] Perfil de contribuição por desenvolvedor
- [ ] Áreas de expertise (baseado em arquivos/pastas tocados)
- [ ] Evolução de produtividade ao longo do tempo
- [ ] Comparativo com média do time (sem exposição individual)

### 4.3 Health Checks
- [ ] Alerta de burnout (excesso de commits fora do horário)
- [ ] Detecção de silos de conhecimento
- [ ] Identificação de gargalos no processo

---

## 5. Melhorias Técnicas do Collector

### 5.1 Performance
- [ ] Cache local de commits já enviados (evitar reprocessamento)
- [ ] Processamento incremental (apenas novos commits)
- [ ] Paralelização da coleta de múltiplos repositórios

### 5.2 Configuração
- [ ] Arquivo de configuração local (.buildsightrc)
- [ ] Suporte a múltiplos tokens/workspaces
- [ ] Filtros de branches a ignorar
- [ ] Exclusão de paths/arquivos da análise

### 5.3 Segurança
- [ ] Anonimização opcional de emails
- [ ] Modo dry-run (ver dados sem enviar)
- [ ] Logs de auditoria local

### 5.4 Resiliência
- [ ] Retry automático em falhas de rede
- [ ] Queue offline (enviar quando reconectar)
- [ ] Validação de integridade dos dados

---

## 6. Priorização Sugerida

### Fase 1 - Quick Wins
1. Linhas adicionadas/removidas por commit
2. Horários de commit (padrões de trabalho)
3. Integração básica com Jira (via commit message)
4. Cache local de commits enviados

### Fase 2 - Colaboração
1. Métricas de Pull Requests (GitHub/GitLab API)
2. Co-autoria e grafo de colaboração
3. Tempo de vida de branches
4. Integração com GitHub Issues

### Fase 3 - Qualidade
1. Conventional commits validation
2. Integração com CI/CD
3. Correlação bugs/fixes
4. Integração com SonarQube

### Fase 4 - Integrações Completas
1. Jira completo (story points, sprints, workflow)
2. Trello
3. Slack/Teams notifications
4. Dashboards avançados

---

## Notas

- Todas as métricas devem respeitar a privacidade dos desenvolvedores
- Foco em métricas de time, não em vigilância individual
- Dados sensíveis devem ter opção de anonimização
- Integrações devem ser opcionais e configuráveis
