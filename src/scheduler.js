import { execSync } from "child_process";
import os from "os";
import chalk from "chalk";

export class Scheduler {
  constructor(token, intervalMinutes) {
    this.token = token;
    this.intervalMinutes = intervalMinutes;
    this.platform = this._detectPlatform();
  }

  setup() {
    console.log(chalk.cyan("\n⚙ Configuração de execução automática detectada."));

    if (this.platform === "linux" || this.platform === "mac") {
      this._setupUnix();
    } else if (this.platform === "windows") {
      this._setupWindows();
    } else {
      console.log(
        chalk.red("❌ Sistema operacional não suportado para execução automática.")
      );
    }
  }

  _detectPlatform() {
    const map = { linux: "linux", darwin: "mac", win32: "windows" };
    return map[os.platform()] ?? "unknown";
  }

  _setupUnix() {
    console.log(chalk.gray("➡ Sistema detectado: Linux/Mac"));
    const cronLine = `*/${this.intervalMinutes} * * * * npx buildsight-collector ${this.token}`;

    try {
      const current = execSync("crontab -l 2>/dev/null").toString();
      if (current.includes(cronLine)) {
        console.log(chalk.yellow("⚠ Cron já configurada anteriormente."));
        return;
      }
      execSync(`(crontab -l 2>/dev/null; echo "${cronLine}") | crontab -`);
      console.log(chalk.green("✓ Cron adicionada com sucesso!"));
    } catch (err) {
      console.log(chalk.red("❌ Falha ao configurar cron:", err.message));
    }
  }

  _setupWindows() {
    console.log(chalk.gray("➡ Sistema detectado: Windows"));
    const taskName = "BuildSightCollector";
    const cmd = `schtasks /Create /SC MINUTE /MO ${this.intervalMinutes} /TN "${taskName}" /TR "npx buildsight-collector ${this.token}" /F`;

    try {
      execSync(cmd);
      console.log(chalk.green("✓ Tarefa agendada criada com sucesso!"));
    } catch (err) {
      console.log(chalk.red("❌ Falha ao criar tarefa agendada:", err.message));
    }
  }
}
