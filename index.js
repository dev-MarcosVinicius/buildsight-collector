#!/usr/bin/env node

import axios from "axios";
import chalk from "chalk";
import ora from "ora";
import simpleGit from "simple-git";
import { spawn } from 'child_process';
import os from "os";
import { execSync } from "child_process";

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

async function main() {
    const token = process.argv[2];

    if (!token) {
        console.log(chalk.red("❌ Token de autenticação ausente."));
        console.log(chalk.yellow("Uso: npx buildsight-collector <token>"));
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

            // --- 🔹 4. Arquivos mais modificados ---
            const fileChangeCounts = {};
            for (const commit of log.all) {
                try {
                    const show = await git.raw(['show', '--stat', '--oneline', commit.hash]);
                    const files = Array.from(show.matchAll(/ ([^\s]+)\s+\|\s+\d+/g)).map(m => m[1]);
                    for (const file of files) {
                        fileChangeCounts[file] = (fileChangeCounts[file] || 0) + 1;
                    }
                } catch { }
            }

            // --- 🔹 5. Montar dados crus por commit ---
            const commits = await Promise.all(
                log.all.map(async (c) => {
                    const isMerge = c.message.startsWith("Merge");
                    const isRevert = /revert:/i.test(c.message);
                    const isFix = /^fix:/i.test(c.message);
                    const isFeat = /^feat:/i.test(c.message);
                    const isRefactor = /^refactor:/i.test(c.message);
                    const isHotfix = /hotfix|urgent/i.test(c.message);

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