import readline from "readline";
import chalk from "chalk";
import os from "os";
import path from "path";
import fs from "fs";

export class ConfigWizard {
  async askBaseDirectory() {
    return new Promise((resolve) => {
      const defaultDir = os.homedir();
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log(chalk.cyan.bold("\n🔧 BuildSight - Configuração de Repositórios\n"));
      console.log(chalk.gray(`Diretório padrão: ${defaultDir}\n`));

      rl.question(
        chalk.white(
          "Digite o diretório base para buscar repositórios (ou ENTER para usar o padrão): "
        ),
        (answer) => {
          rl.close();
          const dir = path.resolve(answer.trim() || defaultDir);

          if (!fs.existsSync(dir)) {
            console.log(chalk.red(`\n❌ Diretório não encontrado: ${dir}`));
            process.exit(1);
          }

          resolve(dir);
        }
      );
    });
  }

  async selectRepositories(repos) {
    return new Promise((resolve) => {
      if (repos.length === 0) return resolve([]);

      const items = repos.map((repo, i) => ({
        label: `${repo.name} (${repo.path})`,
        value: repo,
        isCursor: i === 0,
      }));

      const selectedIndices = new Set();
      let cursorIndex = 0;

      this._enterRawMode();

      const render = () => {
        items.forEach((item, i) => {
          item.isCursor = i === cursorIndex;
        });
        this._renderCheckboxList(items, selectedIndices);
      };

      render();

      const onKeypress = (_, key) => {
        if (key.name === "up") {
          cursorIndex = cursorIndex > 0 ? cursorIndex - 1 : items.length - 1;
          render();
        } else if (key.name === "down") {
          cursorIndex = cursorIndex < items.length - 1 ? cursorIndex + 1 : 0;
          render();
        } else if (key.name === "space") {
          selectedIndices.has(cursorIndex)
            ? selectedIndices.delete(cursorIndex)
            : selectedIndices.add(cursorIndex);
          render();
        } else if (key.name === "return") {
          this._exitRawMode(onKeypress);
          resolve(Array.from(selectedIndices).map((i) => items[i].value));
        } else if (key.ctrl && key.name === "c") {
          this._exitRawMode(onKeypress);
          console.log(chalk.yellow("\n\nOperação cancelada pelo usuário."));
          process.exit(0);
        }
      };

      process.stdin.on("keypress", onKeypress);
      process.stdin.resume();
    });
  }

  async selectPeriod() {
    return new Promise((resolve) => {
      const options = [
        { label: "24 horas (1 dia)", value: 1 },
        { label: "7 dias", value: 7 },
        { label: "15 dias", value: 15 },
      ];

      let cursorIndex = 0;

      this._enterRawMode();

      const render = () => {
        console.clear();
        console.log(chalk.cyan.bold("\n🔧 BuildSight - Configuração de Repositórios\n"));
        console.log(chalk.white("Selecione o período de busca de commits:\n"));
        console.log(chalk.gray("Use as setas ↑↓ para navegar, ENTER para confirmar\n"));

        options.forEach((option, i) => {
          const cursor = i === cursorIndex ? chalk.cyan("❯ ") : "  ";
          const radio = i === cursorIndex ? chalk.cyan("●") : chalk.gray("○");
          const text = i === cursorIndex ? chalk.cyan(option.label) : option.label;
          console.log(`${cursor}${radio} ${text}`);
        });
      };

      render();

      const onKeypress = (_, key) => {
        if (key.name === "up") {
          cursorIndex = cursorIndex > 0 ? cursorIndex - 1 : options.length - 1;
          render();
        } else if (key.name === "down") {
          cursorIndex = cursorIndex < options.length - 1 ? cursorIndex + 1 : 0;
          render();
        } else if (key.name === "return") {
          this._exitRawMode(onKeypress);
          resolve(options[cursorIndex].value);
        } else if (key.ctrl && key.name === "c") {
          this._exitRawMode(onKeypress);
          console.log(chalk.yellow("\n\nOperação cancelada pelo usuário."));
          process.exit(0);
        }
      };

      process.stdin.on("keypress", onKeypress);
      process.stdin.resume();
    });
  }

  _renderCheckboxList(items, selectedIndices) {
    console.clear();
    console.log(chalk.cyan.bold("\n🔧 BuildSight - Configuração de Repositórios\n"));
    console.log(chalk.gray("Use as setas ↑↓ para navegar, ESPAÇO para selecionar/desmarcar"));
    console.log(chalk.gray("Pressione ENTER para confirmar a seleção\n"));

    items.forEach((item, i) => {
      const isSelected = selectedIndices.has(i);
      const checkbox = isSelected ? chalk.green("◉") : chalk.gray("○");
      const cursor = item.isCursor ? chalk.cyan("❯ ") : "  ";
      const text = isSelected ? chalk.green(item.label) : item.label;
      console.log(`${cursor}${checkbox} ${text}`);
    });

    console.log(chalk.gray(`\n${selectedIndices.size} repositório(s) selecionado(s)`));
  }

  _enterRawMode() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
  }

  _exitRawMode(listener) {
    process.stdin.removeListener("keypress", listener);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    console.clear();
  }
}
