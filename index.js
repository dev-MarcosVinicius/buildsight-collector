#!/usr/bin/env node

import axios from "axios";
import chalk from "chalk";
import ora from "ora";
import simpleGit from "simple-git";
import { spawn } from 'child_process';
import os from "os";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";

function getCurrentCron() {
    try {
        return execSync("crontab -l").toString();
    } catch {
        return "";
    }
}

function detectOS() {
    const platform = os.platform();

    if (platform === "linux") return "linux";
    if (platform === "darwin") return "mac";
    if (platform === "win32") return "windows";

    return "unknown";
}

async function setupAutomaticRun(token, intervalMinutes) {
    const platform = detectOS();
    const cronLine = `*/${intervalMinutes} * * * * npx buildsight-collector ${token}`;

    console.log(chalk.cyan("\n⚙ Configuração de execução automática detectada."));

    if (platform === "linux" || platform === "mac") {
        console.log(chalk.gray("➡ Sistema detected: Linux/Mac"));

        try {
            const current = getCurrentCron();
            if (current.includes(cronLine)) {
                console.log(chalk.yellow("⚠ Cron já configurada anteriormente."));
                return;
            }

            execSync(`(crontab -l 2>/dev/null; echo "${cronLine}") | crontab -`);

            console.log(chalk.green("✓ Cron adicionada com sucesso!"));
        } catch (err) {
            console.log(chalk.red("❌ Falha ao configurar cron:", err.message));
        }
    } else if (platform === "windows") {
        console.log(chalk.gray("➡ Sistema detected: Windows"));

        const taskName = "BuildSightCollector";
        const taskCmd = `schtasks /Create /SC MINUTE /MO ${intervalMinutes} /TN "${taskName}" /TR "npx buildsight-collector ${token}" /F`;

        try {
            execSync(taskCmd);
            console.log(chalk.green("✓ Tarefa agendada criada com sucesso!"));
        } catch (err) {
            console.log(chalk.red("❌ Falha ao criar tarefa agendada:", err.message));
        }
    } else {
        console.log(chalk.red("❌ Sistema operacional não suportado para execução automática."));
    }
}

const spinner = ora();

// ============================================
// CONFIG-REPOS: Configuração de repositórios
// ============================================

function findGitRepos(baseDir, maxDepth = 3, currentDepth = 0) {
    const repos = [];

    if (currentDepth > maxDepth) return repos;

    try {
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });

        // Verificar se o diretório atual é um repositório git
        const hasGit = entries.some(e => e.isDirectory() && e.name === '.git');
        if (hasGit) {
            repos.push({
                name: path.basename(baseDir),
                path: baseDir
            });
            return repos; // Não procurar subdiretórios de um repo git
        }

        // Procurar em subdiretórios
        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                const subPath = path.join(baseDir, entry.name);
                repos.push(...findGitRepos(subPath, maxDepth, currentDepth + 1));
            }
        }
    } catch (err) {
        // Ignorar erros de permissão
    }

    return repos;
}

function createCheckboxPrompt(items, selectedIndices) {
    console.clear();
    console.log(chalk.cyan.bold("\n🔧 BuildSight - Configuração de Repositórios\n"));
    console.log(chalk.gray("Use as setas ↑↓ para navegar, ESPAÇO para selecionar/desmarcar"));
    console.log(chalk.gray("Pressione ENTER para confirmar a seleção\n"));

    items.forEach((item, index) => {
        const isSelected = selectedIndices.has(index);
        const checkbox = isSelected ? chalk.green('◉') : chalk.gray('○');
        const cursor = item.isCursor ? chalk.cyan('❯ ') : '  ';
        const text = isSelected ? chalk.green(item.label) : item.label;
        console.log(`${cursor}${checkbox} ${text}`);
    });

    console.log(chalk.gray(`\n${selectedIndices.size} repositório(s) selecionado(s)`));
}

async function selectRepositories(repos) {
    return new Promise((resolve) => {
        if (repos.length === 0) {
            resolve([]);
            return;
        }

        const items = repos.map((repo, index) => ({
            label: `${repo.name} (${repo.path})`,
            value: repo,
            isCursor: index === 0
        }));

        const selectedIndices = new Set();
        let cursorIndex = 0;

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        const render = () => {
            items.forEach((item, index) => {
                item.isCursor = index === cursorIndex;
            });
            createCheckboxPrompt(items, selectedIndices);
        };

        render();

        const onKeypress = (str, key) => {
            if (key.name === 'up') {
                cursorIndex = cursorIndex > 0 ? cursorIndex - 1 : items.length - 1;
                render();
            } else if (key.name === 'down') {
                cursorIndex = cursorIndex < items.length - 1 ? cursorIndex + 1 : 0;
                render();
            } else if (key.name === 'space') {
                if (selectedIndices.has(cursorIndex)) {
                    selectedIndices.delete(cursorIndex);
                } else {
                    selectedIndices.add(cursorIndex);
                }
                render();
            } else if (key.name === 'return') {
                process.stdin.removeListener('keypress', onKeypress);
                if (process.stdin.isTTY) {
                    process.stdin.setRawMode(false);
                }
                console.clear();
                const selected = Array.from(selectedIndices).map(i => items[i].value);
                resolve(selected);
            } else if (key.name === 'c' && key.ctrl) {
                process.stdin.removeListener('keypress', onKeypress);
                if (process.stdin.isTTY) {
                    process.stdin.setRawMode(false);
                }
                console.log(chalk.yellow("\n\nOperação cancelada pelo usuário."));
                process.exit(0);
            }
        };

        process.stdin.on('keypress', onKeypress);
        process.stdin.resume();
    });
}

async function selectPeriod() {
    return new Promise((resolve) => {
        const options = [
            { label: '24 horas (1 dia)', value: 1 },
            { label: '7 dias', value: 7 },
            { label: '15 dias', value: 15 }
        ];

        let cursorIndex = 0;

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        const render = () => {
            console.clear();
            console.log(chalk.cyan.bold("\n🔧 BuildSight - Configuração de Repositórios\n"));
            console.log(chalk.white("Selecione o período de busca de commits:\n"));
            console.log(chalk.gray("Use as setas ↑↓ para navegar, ENTER para confirmar\n"));

            options.forEach((option, index) => {
                const cursor = index === cursorIndex ? chalk.cyan('❯ ') : '  ';
                const radio = index === cursorIndex ? chalk.cyan('●') : chalk.gray('○');
                const text = index === cursorIndex ? chalk.cyan(option.label) : option.label;
                console.log(`${cursor}${radio} ${text}`);
            });
        };

        render();

        const onKeypress = (str, key) => {
            if (key.name === 'up') {
                cursorIndex = cursorIndex > 0 ? cursorIndex - 1 : options.length - 1;
                render();
            } else if (key.name === 'down') {
                cursorIndex = cursorIndex < options.length - 1 ? cursorIndex + 1 : 0;
                render();
            } else if (key.name === 'return') {
                process.stdin.removeListener('keypress', onKeypress);
                if (process.stdin.isTTY) {
                    process.stdin.setRawMode(false);
                }
                console.clear();
                resolve(options[cursorIndex].value);
            } else if (key.name === 'c' && key.ctrl) {
                process.stdin.removeListener('keypress', onKeypress);
                if (process.stdin.isTTY) {
                    process.stdin.setRawMode(false);
                }
                console.log(chalk.yellow("\n\nOperação cancelada pelo usuário."));
                process.exit(0);
            }
        };

        process.stdin.on('keypress', onKeypress);
        process.stdin.resume();
    });
}

async function selectBaseDirectory() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const homeDir = os.homedir();
        const defaultDir = homeDir;

        console.log(chalk.cyan.bold("\n🔧 BuildSight - Configuração de Repositórios\n"));
        console.log(chalk.gray(`Diretório padrão: ${defaultDir}\n`));

        rl.question(chalk.white('Digite o diretório base para buscar repositórios (ou pressione ENTER para usar o padrão): '), (answer) => {
            rl.close();
            const inputDir = answer.trim() || defaultDir;
            const dir = path.resolve(inputDir); // Converte para path absoluto

            if (!fs.existsSync(dir)) {
                console.log(chalk.red(`\n❌ Diretório não encontrado: ${dir}`));
                process.exit(1);
            }

            resolve(dir);
        });
    });
}

async function configRepos(token) {
    // 1. Selecionar diretório base
    const baseDir = await selectBaseDirectory();

    // 2. Buscar repositórios git
    console.clear();
    spinner.start('Buscando repositórios git...');
    const repos = findGitRepos(baseDir);
    spinner.stop();

    if (repos.length === 0) {
        console.log(chalk.yellow(`\n⚠ Nenhum repositório git encontrado em: ${baseDir}`));
        console.log(chalk.gray('Tente especificar um diretório diferente ou verifique se existem repositórios git.'));
        process.exit(0);
    }

    console.log(chalk.green(`\n✓ Encontrados ${repos.length} repositórios git.\n`));
    await new Promise(r => setTimeout(r, 1000));

    // 3. Selecionar repositórios
    const selectedRepos = await selectRepositories(repos);

    if (selectedRepos.length === 0) {
        console.log(chalk.yellow("\n⚠ Nenhum repositório selecionado. Operação cancelada."));
        process.exit(0);
    }

    console.log(chalk.green(`\n✓ ${selectedRepos.length} repositório(s) selecionado(s).\n`));
    await new Promise(r => setTimeout(r, 500));

    // 4. Selecionar período
    const periodDays = await selectPeriod();

    console.log(chalk.green(`\n✓ Período selecionado: ${periodDays} dia(s).\n`));

    // 5. Enviar para a API
    console.log(chalk.cyan("\n📤 Enviando configurações para o BuildSight...\n"));

    let successCount = 0;
    let errorCount = 0;
    let existingCount = 0;

    for (const repo of selectedRepos) {
        spinner.start(`Configurando ${repo.name}...`);

        try {
            const payload = {
                token: token,
                name: repo.name,
                path: repo.path,
                periodDays: periodDays
            };

            const response = await axios.post('https://buildsight.app/api/collector/paths', payload);

            if (response.data?.message === 'already_exists') {
                spinner.warn(`${repo.name} - Já configurado anteriormente.`);
                existingCount++;
            } else {
                spinner.succeed(`${repo.name} - Configurado com sucesso!`);
                successCount++;
            }
        } catch (err) {
            const errorMessage = err.response?.data?.error || err.message;
            spinner.fail(`${repo.name} - Erro: ${errorMessage}`);
            errorCount++;
        }
    }

    // 6. Resumo final
    console.log(chalk.cyan.bold("\n📊 Resumo da Configuração:\n"));
    console.log(chalk.green(`   ✓ Configurados com sucesso: ${successCount}`));
    if (existingCount > 0) {
        console.log(chalk.yellow(`   ⚠ Já existentes: ${existingCount}`));
    }
    if (errorCount > 0) {
        console.log(chalk.red(`   ❌ Erros: ${errorCount}`));
    }

    console.log(chalk.cyan.bold("\n✅ Configuração concluída!"));
    console.log(chalk.gray("\nAgora você pode executar a coleta com:"));
    console.log(chalk.white(`   npx buildsight-collector <token>\n`));
}

async function main() {
    const arg1 = process.argv[2];
    const arg2 = process.argv[3];

    execSync('export NODE_TLS_REJECT_UNAUTHORIZED=0');

    // Verificar se é o comando config-repos
    if (arg1 === 'config-repos') {
        const token = arg2;

        if (!token) {
            console.log(chalk.red("❌ Token de autenticação ausente."));
            console.log(chalk.yellow("Uso: npx buildsight-collector config-repos <token>"));
            process.exit(1);
        }

        if (typeof token === 'string' && token.length < 200) {
            console.log(chalk.red("❌ Token inválido: tamanho menor que 200 caracteres."));
            console.log(chalk.yellow("Uso: npx buildsight-collector config-repos <token>"));
            process.exit(1);
        }

        await configRepos(token);
        process.exit(0);
    }

    // Fluxo normal de coleta
    const token = arg1;

    if (!token) {
        console.log(chalk.red("❌ Token de autenticação ausente."));
        console.log(chalk.yellow("Uso: npx buildsight-collector <token>"));
        console.log(chalk.yellow("     npx buildsight-collector config-repos <token>"));
        process.exit(1);
    }

    if (typeof token === 'string' && token.length < 200) {
        console.log(chalk.red("❌ Token inválido: tamanho menor que 200 caracteres."));
        console.log(chalk.yellow("Uso: npx buildsight-collector <token>"));
        process.exit(1);
    }

    console.log(chalk.cyan.bold("\n🔗 Iniciando BuildSight Collector..."));

    try {
        spinner.start("Buscando paths de repositórios configurados...");
        const { data } = await axios.get(
            `https://buildsight.app/api/collector/paths?token=${token}`
        );

        if (!data?.data?.length) {
            spinner.fail("Nenhum path configurado encontrado.");
            process.exit(0);
        }

        const paths = data?.data || [];
        const autoRunEnabled = data?.autoRunEnabled ?? false;
        const intervalMinutes = data?.intervalMinutes ?? 15;

        if (autoRunEnabled) {
            await setupAutomaticRun(token, intervalMinutes);
        }

        spinner.succeed(`Foram encontrados ${paths.length} paths.`);

        for (const repo of paths) {
            console.log(chalk.blue(`\n📂 Processando repositório:`), chalk.white(repo.name));
            const git = simpleGit(repo.path);
            const DAYS_RANGE = repo.periodDays || 1;
            const sinceDate = new Date();
            sinceDate.setDate(sinceDate.getDate() - DAYS_RANGE);

            console.log(chalk.gray(`Buscando commits desde: ${sinceDate.toISOString()}`));
            // Atualizar repositório antes de buscar commits
            try {
                spinner.start('Atualizando referências remotas (git fetch --all)...');
                await new Promise((resolve, reject) => {
                    const p = spawn('git', ['fetch', '--all'], {
                        cwd: repo.path,
                        stdio: 'inherit' // permite interação (senha, passphrase, etc.)
                    });
                    p.on('error', (err) => reject(err));
                    p.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(`git fetch --all exited with code ${code}`));
                    });
                });
                spinner.succeed('Referências remotas atualizadas.');
            } catch (fetchErr) {
                spinner.warn('Não foi possível atualizar referências remotas (git fetch --all). Usando dados locais.');
            }

            // --- 🔹 1. Commits detalhados ---
            const log = await git.log({
                '--all': null,
                '--since': sinceDate.toISOString(),
                '--stat': null, // inclui dados de arquivos alterados
            });

            // --- 🔹 2. Branches ---
            const branches = await git.branchLocal();
            const branchList = Object.keys(branches.branches);

            // --- 🔹 3. Merges locais ---
            const merges = await git.log({ '--merges': null });

            // --- 🔹 4. Arquivos mais modificados + Code Churn + Hot Spots ---
            const fileChangeCounts = {};
            const codeChurn = {}; // { file: { additions, deletions, commits, authors: Set } }
            const hotSpots = {}; // { file: { totalChanges, bugFixCount, authors: Set, lastModified } }

            for (const commit of log.all) {
                try {
                    // Obter estatísticas detalhadas do commit (linhas +/-)
                    const show = await git.raw(['show', '--stat', '--oneline', commit.hash]);
                    const fileMatches = Array.from(show.matchAll(/ ([^\s]+)\s+\|\s+(\d+)/g));

                    // Obter detalhes de adições/remoções por arquivo
                    const numstat = await git.raw(['show', '--numstat', '--oneline', commit.hash]);
                    const numstatLines = numstat.split('\n').slice(1).filter(line => line.trim());

                    const isBugFix = /^fix|bug|hotfix|urgent|patch/i.test(commit.message);

                    for (const line of numstatLines) {
                        const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
                        if (match) {
                            const additions = match[1] === '-' ? 0 : parseInt(match[1], 10);
                            const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10);
                            const file = match[3].trim();

                            // Atualizar fileChangeCounts
                            fileChangeCounts[file] = (fileChangeCounts[file] || 0) + 1;

                            // Atualizar Code Churn
                            if (!codeChurn[file]) {
                                codeChurn[file] = {
                                    additions: 0,
                                    deletions: 0,
                                    commits: 0,
                                    authors: new Set()
                                };
                            }
                            codeChurn[file].additions += additions;
                            codeChurn[file].deletions += deletions;
                            codeChurn[file].commits += 1;
                            codeChurn[file].authors.add(commit.author_email);

                            // Atualizar Hot Spots
                            if (!hotSpots[file]) {
                                hotSpots[file] = {
                                    totalChanges: 0,
                                    bugFixCount: 0,
                                    authors: new Set(),
                                    lastModified: commit.date
                                };
                            }
                            hotSpots[file].totalChanges += 1;
                            hotSpots[file].authors.add(commit.author_email);
                            if (isBugFix) {
                                hotSpots[file].bugFixCount += 1;
                            }
                            // Atualizar última modificação se mais recente
                            if (new Date(commit.date) > new Date(hotSpots[file].lastModified)) {
                                hotSpots[file].lastModified = commit.date;
                            }
                        }
                    }
                } catch { }
            }

            // Converter Sets para arrays e calcular métricas finais
            const codeChurnData = Object.entries(codeChurn).map(([file, data]) => ({
                file,
                additions: data.additions,
                deletions: data.deletions,
                totalChurn: data.additions + data.deletions,
                commits: data.commits,
                churnRate: data.commits > 0 ? (data.additions + data.deletions) / data.commits : 0,
                authors: Array.from(data.authors),
                authorCount: data.authors.size
            })).sort((a, b) => b.totalChurn - a.totalChurn);

            const hotSpotsData = Object.entries(hotSpots).map(([file, data]) => ({
                file,
                totalChanges: data.totalChanges,
                bugFixCount: data.bugFixCount,
                bugFixRatio: data.totalChanges > 0 ? data.bugFixCount / data.totalChanges : 0,
                authors: Array.from(data.authors),
                authorCount: data.authors.size,
                lastModified: data.lastModified,
                // Score composto: frequência de mudanças + proporção de bug fixes + número de autores
                hotSpotScore: (data.totalChanges * 0.4) + (data.bugFixCount * 0.4) + (data.authors.size * 0.2)
            })).sort((a, b) => b.hotSpotScore - a.hotSpotScore);

            // --- 🔹 5. Montar dados crus por commit ---
            const commits = await Promise.all(
                log.all.map(async (c) => {
                    const isMerge = c.message.startsWith("Merge");
                    const isRevert = /revert/i.test(c.message);
                    const isFix = /^fix/i.test(c.message);
                    const isFeat = /^(feat|feature)/i.test(c.message);
                    const isRefactor = /^refactor/i.test(c.message);
                    const isHotfix = /^(hotfix|urgent)/i.test(c.message);

                    let filesChanged = [];
                    try {
                        const show = await git.raw([
                            "show",
                            "--pretty=",
                            "--name-only",
                            c.hash,
                        ]);
                        filesChanged = show
                            .split("\n")
                            .filter((line) => line.trim() !== "");
                    } catch { }

                    // Branches que contêm o commit
                    let branchesContaining = [];
                    try {
                        const branchOutput = await git.raw(['branch', '--all', '--contains', c.hash]);
                        branchesContaining = branchOutput
                            .split("\n")
                            .map(b => b.trim())
                            .filter(Boolean);
                    } catch { }

                    return {
                        hash: c.hash,
                        author: c.author_name,
                        email: c.author_email,
                        date: c.date,
                        message: c.message,
                        isMerge,
                        isRevert,
                        isFix,
                        isFeat,
                        isRefactor,
                        isHotfix,
                        filesChanged,
                        branchesContaining,
                    };
                })
            );

            // --- 🔹 6. Dividir em lotes de 500 commits ---
            const batchSize = 500;
            const totalBatches = Math.ceil(commits.length / batchSize);

            for (let i = 0; i < totalBatches; i++) {
                const batch = commits.slice(i * batchSize, (i + 1) * batchSize);

                const payload = {
                    token: token,
                    repoName: repo.name,
                    part: i + 1,
                    totalParts: totalBatches,
                    metadata: {
                        branches: branchList,
                        merges: merges.all.map(m => ({
                            hash: m.hash,
                            author: m.author_name,
                            date: m.date,
                            message: m.message,
                        })),
                        fileChangeCounts, // 🔥 arquivos mais alterados
                        codeChurn: codeChurnData, // 🔄 detecção de code churn
                        hotSpots: hotSpotsData, // 🔥 identificação de hot spots
                    },
                    commits: batch,
                };

                spinner.start(
                    `Enviando lote ${i + 1}/${totalBatches} (${batch.length} commits) de ${repo.name}...`
                );

                await axios.post(`https://buildsight.app/api/collector/records`, payload);
                spinner.succeed(`Lote ${i + 1}/${totalBatches} de ${repo.name} enviado com sucesso!`);
            }
        }

        console.log(chalk.green.bold("\n✅ Coleta concluída com sucesso!"));
    } catch (err) {
        spinner.fail("Erro durante o processo de coleta.");
        console.error(chalk.red(err.message));
    }
}

main();