#!/usr/bin/env node

import axios from "axios";
import chalk from "chalk";
import ora from "ora";
import simpleGit from "simple-git";

const spinner = ora();

async function main() {
    const token = process.argv[2];

    if (!token) {
        console.log(chalk.red("❌ Token de autenticação ausente."));
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

        spinner.succeed(`Foram encontrados ${data.data.length} paths.`);

        for (const repo of data.data) {
            console.log(chalk.blue(`\n📂 Processando repositório:`), chalk.white(repo.name));
            const git = simpleGit(repo.path);
            const DAYS_RANGE = repo.periodDays || 1;
            const sinceDate = new Date();
            sinceDate.setDate(sinceDate.getDate() - DAYS_RANGE);

            console.log(chalk.gray(`Buscando commits desde: ${sinceDate.toISOString()}`));

            // --- 🔹 1. Commits detalhados ---
            const log = await git.log({
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