import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import chalk from "chalk";
import ora from "ora";

const CREDENTIALS_PATH = path.join(os.homedir(), ".buildsight", "credentials.json");
const BASE_URL = "https://buildsight.app";

function loadCredentials() {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) return {};
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveCredentials(data) {
  const dir = path.dirname(CREDENTIALS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

async function fetchClientIds() {
  try {
    const { data } = await axios.get(`${BASE_URL}/api/collector/auth-config`);
    return data;
  } catch {
    return {};
  }
}

async function authGitHub(clientId) {
  if (!clientId) {
    console.log(chalk.red("❌ GITHUB_OAUTH_CLIENT_ID não configurado no BuildSight."));
    return;
  }

  const spinner = ora("Iniciando autenticação com GitHub...").start();

  const deviceRes = await axios.post(
    "https://github.com/login/device/code",
    { client_id: clientId, scope: "repo" },
    { headers: { Accept: "application/json" } }
  );
  spinner.stop();

  const { device_code, user_code, verification_uri, expires_in, interval } = deviceRes.data;

  console.log(chalk.cyan("\n  Acesse:"), chalk.bold(verification_uri));
  console.log(chalk.cyan("  Código: "), chalk.bold.yellow(user_code));
  console.log(chalk.gray("\n  Aguardando autorização...\n"));

  const pollInterval = (interval ?? 5) * 1000;
  const expiresAt = Date.now() + (expires_in ?? 900) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      const tokenRes = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: clientId,
          device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        },
        { headers: { Accept: "application/json" } }
      );
      const { access_token, error } = tokenRes.data;
      if (error === "authorization_pending") continue;
      if (error === "slow_down") { await new Promise((r) => setTimeout(r, 5000)); continue; }
      if (error) { console.log(chalk.red(`\n❌ Erro: ${error}`)); return; }

      if (access_token) {
        const creds = loadCredentials();
        creds.github = { token: access_token, scope: "repo", authorizedAt: new Date().toISOString() };
        saveCredentials(creds);
        console.log(chalk.green("✓ GitHub autenticado com sucesso!\n"));
        return;
      }
    } catch {
      // continue polling
    }
  }

  console.log(chalk.red("❌ Tempo expirado. Tente novamente."));
}

async function authGitLab(clientId) {
  if (!clientId) {
    console.log(chalk.red("❌ GITLAB_OAUTH_CLIENT_ID não configurado no BuildSight."));
    return;
  }

  const spinner = ora("Iniciando autenticação com GitLab...").start();

  const deviceRes = await axios.post(
    "https://gitlab.com/oauth/authorize_device",
    { client_id: clientId, scope: "read_api" },
    { headers: { Accept: "application/json" } }
  );
  spinner.stop();

  const { device_code, user_code, verification_uri, expires_in, interval } = deviceRes.data;

  console.log(chalk.cyan("\n  Acesse:"), chalk.bold(verification_uri));
  console.log(chalk.cyan("  Código: "), chalk.bold.yellow(user_code));
  console.log(chalk.gray("\n  Aguardando autorização...\n"));

  const pollInterval = (interval ?? 5) * 1000;
  const expiresAt = Date.now() + (expires_in ?? 900) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      const tokenRes = await axios.post(
        "https://gitlab.com/oauth/token",
        {
          client_id: clientId,
          device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        },
        { headers: { Accept: "application/json" } }
      );
      const { access_token, error } = tokenRes.data;
      if (error === "authorization_pending") continue;
      if (error) { console.log(chalk.red(`\n❌ Erro: ${error}`)); return; }

      if (access_token) {
        const creds = loadCredentials();
        creds.gitlab = { token: access_token, scope: "read_api", authorizedAt: new Date().toISOString() };
        saveCredentials(creds);
        console.log(chalk.green("✓ GitLab autenticado com sucesso!\n"));
        return;
      }
    } catch {
      // continue polling
    }
  }

  console.log(chalk.red("❌ Tempo expirado. Tente novamente."));
}

async function authAzure(clientId) {
  if (!clientId) {
    console.log(chalk.red("❌ AZURE_OAUTH_CLIENT_ID não configurado no BuildSight."));
    return;
  }

  const spinner = ora("Iniciando autenticação com Azure DevOps...").start();

  const deviceRes = await axios.post(
    "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode",
    new URLSearchParams({
      client_id: clientId,
      scope: "499b84ac-1321-427f-aa17-267ca6975798/vso.code_read offline_access",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  spinner.stop();

  const { device_code, user_code, verification_uri, expires_in, interval } = deviceRes.data;

  console.log(chalk.cyan("\n  Acesse:"), chalk.bold(verification_uri));
  console.log(chalk.cyan("  Código: "), chalk.bold.yellow(user_code));
  console.log(chalk.gray("\n  Aguardando autorização...\n"));

  const pollInterval = (interval ?? 5) * 1000;
  const expiresAt = Date.now() + (expires_in ?? 900) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      const tokenRes = await axios.post(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        new URLSearchParams({
          client_id: clientId,
          device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      const { access_token, refresh_token, expires_in: expiresInSec, error } = tokenRes.data;
      if (error === "authorization_pending") continue;
      if (error === "slow_down") { await new Promise((r) => setTimeout(r, 5000)); continue; }
      if (error) { console.log(chalk.red(`\n❌ Erro: ${error}`)); return; }

      if (access_token) {
        const creds = loadCredentials();
        creds.azure = {
          token: access_token,
          refreshToken: refresh_token ?? null,
          expiresAt: new Date(Date.now() + (expiresInSec ?? 3600) * 1000).toISOString(),
          authorizedAt: new Date().toISOString(),
        };
        saveCredentials(creds);
        console.log(chalk.green("✓ Azure DevOps autenticado com sucesso!\n"));
        return;
      }
    } catch {
      // continue polling
    }
  }

  console.log(chalk.red("❌ Tempo expirado. Tente novamente."));
}

function showStatus() {
  const creds = loadCredentials();
  const providers = ["github", "gitlab", "azure"];
  console.log(chalk.bold("\n  Status das conexões BuildSight:\n"));
  for (const p of providers) {
    if (creds[p]?.token) {
      const date = new Date(creds[p].authorizedAt).toLocaleString("pt-BR");
      console.log(chalk.green(`  ✓ ${p.padEnd(8)}`), chalk.gray(`autenticado em ${date}`));
    } else {
      console.log(chalk.gray(`  ○ ${p.padEnd(8)}`), chalk.gray("não conectado"));
    }
  }
  console.log();
}

function logout(provider) {
  const creds = loadCredentials();
  if (!creds[provider]) {
    console.log(chalk.yellow(`⚠ ${provider} não está autenticado.`));
    return;
  }
  delete creds[provider];
  saveCredentials(creds);
  console.log(chalk.green(`✓ ${provider} desconectado.`));
}

export async function authWizard(provider, subcommand) {
  if (provider === "status") { showStatus(); return; }
  if (provider === "logout") { logout(subcommand); return; }

  const clientIds = await fetchClientIds();

  if (provider === "github") { await authGitHub(clientIds.github); return; }
  if (provider === "gitlab") { await authGitLab(clientIds.gitlab); return; }
  if (provider === "azure") { await authAzure(clientIds.azure); return; }

  console.log(chalk.yellow("Uso: npx buildsight-collector auth <github|gitlab|azure|status>"));
  console.log(chalk.yellow("     npx buildsight-collector auth logout <github|gitlab|azure>"));
}

export { loadCredentials };
