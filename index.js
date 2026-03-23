#!/usr/bin/env node

import chalk from "chalk";
import ora from "ora";
import { BuildSightApi } from "./src/api.js";
import { GitCollector } from "./src/git-collector.js";
import { Scheduler } from "./src/scheduler.js";
import { RepoFinder } from "./src/repo-finder.js";
import { ConfigWizard } from "./src/config-wizard.js";
import { authWizard, loadCredentials } from "./src/auth-wizard.js";
import { PrCollector } from "./src/pr-collector.js";

const MIN_TOKEN_LENGTH = 200;
const spinner = ora();

function validateToken(token, usage) {
  if (!token) {
    console.log(chalk.red("❌ Token de autenticação ausente."));
    console.log(chalk.yellow(`Uso: ${usage}`));
    process.exit(1);
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    console.log(chalk.red("❌ Token inválido: tamanho menor que 200 caracteres."));
    console.log(chalk.yellow(`Uso: ${usage}`));
    process.exit(1);
  }
}

async function runConfigRepos(token) {
  const api = new BuildSightApi(token);
  const wizard = new ConfigWizard();
  const finder = new RepoFinder();

  const baseDir = await wizard.askBaseDirectory();

  console.clear();
  spinner.start("Buscando repositórios git...");
  const repos = finder.find(baseDir);
  spinner.stop();

  if (repos.length === 0) {
    console.log(chalk.yellow(`\n⚠ Nenhum repositório git encontrado em: ${baseDir}`));
    console.log(chalk.gray("Tente especificar um diretório diferente ou verifique se existem repositórios git."));
    process.exit(0);
  }

  console.log(chalk.green(`\n✓ Encontrados ${repos.length} repositórios git.\n`));
  await new Promise((r) => setTimeout(r, 1000));

  const selectedRepos = await wizard.selectRepositories(repos);

  if (selectedRepos.length === 0) {
    console.log(chalk.yellow("\n⚠ Nenhum repositório selecionado. Operação cancelada."));
    process.exit(0);
  }

  console.log(chalk.green(`\n✓ ${selectedRepos.length} repositório(s) selecionado(s).\n`));
  await new Promise((r) => setTimeout(r, 500));

  const periodDays = await wizard.selectPeriod();
  console.log(chalk.green(`\n✓ Período selecionado: ${periodDays} dia(s).\n`));
  console.log(chalk.cyan("\n📤 Enviando configurações para o BuildSight...\n"));

  let successCount = 0;
  let existingCount = 0;
  let errorCount = 0;

  for (const repo of selectedRepos) {
    spinner.start(`Configurando ${repo.name}...`);
    try {
      const result = await api.registerPath({
        name: repo.name,
        path: repo.path,
        periodDays,
      });
      if (result?.message === "already_exists") {
        spinner.warn(`${repo.name} - Já configurado anteriormente.`);
        existingCount++;
      } else {
        spinner.succeed(`${repo.name} - Configurado com sucesso!`);
        successCount++;
      }
    } catch (err) {
      spinner.fail(`${repo.name} - Erro: ${err.response?.data?.error || err.message}`);
      errorCount++;
    }
  }

  console.log(chalk.cyan.bold("\n📊 Resumo da Configuração:\n"));
  console.log(chalk.green(`   ✓ Configurados com sucesso: ${successCount}`));
  if (existingCount > 0) console.log(chalk.yellow(`   ⚠ Já existentes: ${existingCount}`));
  if (errorCount > 0) console.log(chalk.red(`   ❌ Erros: ${errorCount}`));

  console.log(chalk.cyan.bold("\n✅ Configuração concluída!"));
  console.log(chalk.gray("\nAgora você pode executar a coleta com:"));
  console.log(chalk.white("   npx buildsight-collector <token>\n"));
}

async function runCollection(token) {
  const api = new BuildSightApi(token);

  console.log(chalk.cyan.bold("\n🔗 Iniciando BuildSight Collector..."));

  spinner.start("Buscando paths de repositórios configurados...");
  const response = await api.fetchPaths();

  if (!response?.data?.length) {
    spinner.fail("Nenhum path configurado encontrado.");
    process.exit(0);
  }

  const { data: paths, autoRunEnabled, intervalMinutes = 15 } = response;

  if (autoRunEnabled) {
    new Scheduler(token, intervalMinutes).setup();
  }

  spinner.succeed(`Foram encontrados ${paths.length} paths.`);

  for (const repo of paths) {
    console.log(chalk.blue("\n📂 Processando repositório:"), chalk.white(repo.name));

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - (repo.periodDays || 1));
    console.log(chalk.gray(`Buscando commits desde: ${sinceDate.toISOString()}`));

    const collector = new GitCollector(repo.path, sinceDate);

    try {
      spinner.start("Atualizando referências remotas (git fetch --all)...");
      await collector.fetchRemote();
      spinner.succeed("Referências remotas atualizadas.");
    } catch {
      spinner.warn("Não foi possível atualizar referências remotas. Usando dados locais.");
    }

    spinner.start("Coletando dados do repositório...");
    const { branches, merges, fileChangeCounts, codeChurn, hotSpots, commits } =
      await collector.collect();
    spinner.succeed(`Dados coletados: ${commits.length} commits encontrados.`);

    const metadata = { branches, merges, fileChangeCounts, codeChurn, hotSpots };
    const { batches, totalBatches } = api.prepareBatches(commits);

    for (let i = 0; i < batches.length; i++) {
      spinner.start(
        `Enviando lote ${i + 1}/${totalBatches} (${batches[i].length} commits) de ${repo.name}...`
      );
      await api.sendBatch(repo.name, batches[i], i + 1, totalBatches, metadata);
      spinner.succeed(`Lote ${i + 1}/${totalBatches} de ${repo.name} enviado com sucesso!`);
    }

    // Coletar PRs se houver credenciais de provider
    const credentials = loadCredentials();
    if (credentials && Object.keys(credentials).length > 0) {
      spinner.start("Coletando métricas de Pull Requests...");
      try {
        const prCollector = new PrCollector(repo.path, sinceDate, credentials);
        const prData = await prCollector.collect();
        if (prData && prData.pullRequests.length > 0) {
          await api.sendPullRequests(repo.name, prData.provider, prData.pullRequests);
          spinner.succeed(`${prData.pullRequests.length} PRs coletados e enviados (${prData.provider}).`);
        } else {
          spinner.stop();
        }
      } catch (err) {
        spinner.warn(`Coleta de PRs falhou: ${err.message}`);
      }
    }
  }

  console.log(chalk.green.bold("\n✅ Coleta concluída com sucesso!"));
}

async function runDryRun(token) {
  const api = new BuildSightApi(token, { dryRun: true });

  console.log(chalk.yellow.bold("\n🧪 Modo Dry-Run — nenhum dado será gravado em produção.\n"));

  spinner.start("Buscando paths de repositórios configurados...");
  const response = await api.fetchPaths();

  if (!response?.data?.length) {
    spinner.fail("Nenhum path configurado encontrado.");
    process.exit(0);
  }

  const { data: paths } = response;
  spinner.succeed(`Foram encontrados ${paths.length} paths.`);

  for (const repo of paths) {
    console.log(chalk.blue("\n📂 Testando repositório:"), chalk.white(repo.name));

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - (repo.periodDays || 1));
    console.log(chalk.gray(`Período: últimos ${repo.periodDays || 1} dia(s) (desde ${sinceDate.toLocaleDateString()})`));

    const collector = new GitCollector(repo.path, sinceDate);

    try {
      spinner.start("Atualizando referências remotas...");
      await collector.fetchRemote();
      spinner.succeed("Referências remotas atualizadas.");
    } catch {
      spinner.warn("Não foi possível atualizar referências remotas. Usando dados locais.");
    }

    spinner.start("Coletando dados do repositório...");
    const { branches, merges, fileChangeCounts, codeChurn, hotSpots, commits } =
      await collector.collect();
    spinner.succeed(`Dados coletados: ${commits.length} commits encontrados localmente.`);

    const metadata = { branches, merges, fileChangeCounts, codeChurn, hotSpots };
    const { batches, totalBatches } = api.prepareBatches(commits);

    const totals = { received: 0, valid: 0, invalid: 0, alreadyExist: 0, wouldInsert: 0 };

    for (let i = 0; i < batches.length; i++) {
      spinner.start(`Simulando envio do lote ${i + 1}/${totalBatches}...`);
      const result = await api.sendBatch(repo.name, batches[i], i + 1, totalBatches, metadata);
      spinner.stop();

      if (result?.commits) {
        totals.received += result.commits.received ?? 0;
        totals.valid += result.commits.validAfterNormalization ?? 0;
        totals.invalid += result.commits.invalid ?? 0;
        totals.alreadyExist += result.commits.alreadyExist ?? 0;
        totals.wouldInsert += result.commits.wouldInsert ?? 0;
      }

      if (result?.sample?.length > 0 && i === 0) {
        console.log(chalk.gray("\n   Amostra de commits que seriam inseridos:"));
        for (const s of result.sample) {
          console.log(
            chalk.gray(`   • [${s.hash.slice(0, 7)}] ${s.author} — ${s.message.slice(0, 60)}`)
          );
        }
      }
    }

    console.log(chalk.cyan.bold(`\n   📊 Resultado para ${repo.name}:`));
    console.log(chalk.white(`      Commits coletados localmente : ${commits.length}`));
    console.log(chalk.white(`      Commits válidos              : ${totals.valid}`));
    if (totals.invalid > 0)
      console.log(chalk.red(`      Commits inválidos            : ${totals.invalid}`));
    console.log(chalk.yellow(`      Já existem no banco         : ${totals.alreadyExist}`));
    console.log(chalk.green(`      Seriam inseridos             : ${totals.wouldInsert}`));
    console.log(chalk.gray(`      Branches detectadas          : ${branches.length}`));
    console.log(chalk.gray(`      Arquivos com métricas        : ${fileChangeCounts.length}`));
  }

  console.log(chalk.yellow.bold("\n✅ Dry-run concluído. Nenhum dado foi gravado.\n"));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRunIndex = args.indexOf("--dry-run");
  const isDryRun = dryRunIndex !== -1;
  if (isDryRun) args.splice(dryRunIndex, 1);

  const [arg1, arg2] = args;

  if (arg1 === "auth") {
    const urlFlagIndex = args.indexOf("--url");
    const authOptions = urlFlagIndex !== -1 ? { url: args[urlFlagIndex + 1] } : {};
    await authWizard(arg2, args[2], authOptions);
    process.exit(0);
  }

  if (arg1 === "config-repos") {
    validateToken(arg2, "npx buildsight-collector config-repos <token>");
    await runConfigRepos(arg2);
    process.exit(0);
  }

  const usage =
    "npx buildsight-collector <token>\n" +
    "     npx buildsight-collector <token> --dry-run\n" +
    "     npx buildsight-collector config-repos <token>\n" +
    "     npx buildsight-collector auth <github|gitlab|azure|status>";

  validateToken(arg1, usage);

  try {
    if (isDryRun) {
      await runDryRun(arg1);
    } else {
      await runCollection(arg1);
    }
  } catch (err) {
    spinner.fail(isDryRun ? "Erro durante o dry-run." : "Erro durante o processo de coleta.");
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}

main();
