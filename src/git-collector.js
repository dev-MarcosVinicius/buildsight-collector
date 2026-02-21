import simpleGit from "simple-git";
import { spawn } from "child_process";

const DEFAULT_BRANCHES = /^(master|main|develop|dev|trunk|release)$/i;
const SPECIFIC_BRANCH = /^(feature|hotfix|fix|feat|refactor|chore|release|bugfix|improvement)[\/-]/i;

function pickBestBranch(branchesContaining) {
  if (!branchesContaining?.length) return null;
  // Remove HEAD refs and stash entries, clean leading "* " marker
  const clean = branchesContaining
    .filter((b) => !b.includes("HEAD") && !b.includes("refs/stash"))
    .map((b) => b.replace(/^\*\s+/, "").trim())
    .filter(Boolean);
  if (!clean.length) return null;

  const local = clean.filter((b) => !b.startsWith("remotes/"));
  const remotes = clean
    .filter((b) => b.startsWith("remotes/"))
    .map((b) => b.replace(/^remotes\/[^/]+\//, ""));

  // 1. Prefer specific local branches (feature/, hotfix/, fix/, etc.)
  const specificLocal = local.find((b) => SPECIFIC_BRANCH.test(b));
  if (specificLocal) return specificLocal;

  // 2. Prefer specific remote branches
  const specificRemote = remotes.find((b) => SPECIFIC_BRANCH.test(b));
  if (specificRemote) return specificRemote;

  // 3. Fall back to any local non-default branch
  const otherLocal = local.find((b) => !DEFAULT_BRANCHES.test(b));
  if (otherLocal) return otherLocal;

  // 4. Fall back to default local branch (master/main/develop)
  if (local.length > 0) return local[0];

  // 5. Last resort: remote
  return remotes[0] || null;
}

export class GitCollector {
  constructor(repoPath, sinceDate) {
    this.repoPath = repoPath;
    this.sinceDate = sinceDate;
    this.git = simpleGit(repoPath);
  }

  async fetchRemote() {
    return new Promise((resolve, reject) => {
      const p = spawn("git", ["fetch", "--all"], {
        cwd: this.repoPath,
        stdio: "inherit",
      });
      p.on("error", reject);
      p.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`git fetch --all exited with code ${code}`))
      );
    });
  }

  async collect() {
    const log = await this._fetchLog();
    const [branches, merges] = await Promise.all([
      this._fetchBranches(),
      this._fetchMerges(),
    ]);
    const fileMetrics = await this._collectFileMetrics(log);
    const commits = await this._collectCommits(log);

    return { branches, merges, ...fileMetrics, commits };
  }

  async _fetchLog() {
    return this.git.log({
      "--all": null,
      "--since": this.sinceDate.toISOString(),
      "--stat": null,
    });
  }

  async _fetchBranches() {
    const result = await this.git.branchLocal();
    return Object.keys(result.branches);
  }

  async _fetchMerges() {
    const result = await this.git.log({ "--merges": null });
    return result.all.map((m) => ({
      hash: m.hash,
      author: m.author_name,
      date: m.date,
      message: m.message,
    }));
  }

  async _collectFileMetrics(log) {
    const fileChangeCounts = {};
    const codeChurn = {};
    const hotSpots = {};

    for (const commit of log.all) {
      try {
        const numstat = await this.git.raw([
          "show",
          "--numstat",
          "--oneline",
          commit.hash,
        ]);
        const lines = numstat.split("\n").slice(1).filter((l) => l.trim());
        const isBugFix = /^fix|bug|hotfix|urgent|patch/i.test(commit.message);

        for (const line of lines) {
          const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
          if (!match) continue;

          const additions = match[1] === "-" ? 0 : parseInt(match[1], 10);
          const deletions = match[2] === "-" ? 0 : parseInt(match[2], 10);
          const file = match[3].trim();

          fileChangeCounts[file] = (fileChangeCounts[file] || 0) + 1;
          this._accumulateChurn(codeChurn, file, additions, deletions, commit.author_email);
          this._accumulateHotSpot(hotSpots, file, isBugFix, commit);
        }
      } catch {
        // ignore commits with no numstat (e.g. binary files, merge commits)
      }
    }

    return {
      fileChangeCounts: this._serializeFileChangeCounts(fileChangeCounts),
      codeChurn: this._serializeCodeChurn(codeChurn),
      hotSpots: this._serializeHotSpots(hotSpots),
    };
  }

  _accumulateChurn(map, file, additions, deletions, authorEmail) {
    if (!map[file]) {
      map[file] = { additions: 0, deletions: 0, commits: 0, authors: new Set() };
    }
    map[file].additions += additions;
    map[file].deletions += deletions;
    map[file].commits += 1;
    map[file].authors.add(authorEmail);
  }

  _accumulateHotSpot(map, file, isBugFix, commit) {
    if (!map[file]) {
      map[file] = {
        totalChanges: 0,
        bugFixCount: 0,
        authors: new Set(),
        lastModified: commit.date,
      };
    }
    map[file].totalChanges += 1;
    map[file].authors.add(commit.author_email);
    if (isBugFix) map[file].bugFixCount += 1;
    if (new Date(commit.date) > new Date(map[file].lastModified)) {
      map[file].lastModified = commit.date;
    }
  }

  _serializeFileChangeCounts(map) {
    return Object.entries(map)
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count);
  }

  _serializeCodeChurn(map) {
    return Object.entries(map)
      .map(([file, data]) => ({
        file,
        additions: data.additions,
        deletions: data.deletions,
        totalChurn: data.additions + data.deletions,
        commits: data.commits,
        churnRate:
          data.commits > 0
            ? (data.additions + data.deletions) / data.commits
            : 0,
        authors: Array.from(data.authors),
        authorCount: data.authors.size,
      }))
      .sort((a, b) => b.totalChurn - a.totalChurn);
  }

  _serializeHotSpots(map) {
    return Object.entries(map)
      .map(([file, data]) => {
        const authorCount = data.authors.size;
        return {
          file,
          totalChanges: data.totalChanges,
          bugFixCount: data.bugFixCount,
          bugFixRatio:
            data.totalChanges > 0
              ? data.bugFixCount / data.totalChanges
              : 0,
          authors: Array.from(data.authors),
          authorCount,
          lastModified: data.lastModified,
          hotSpotScore:
            data.totalChanges * 0.4 +
            data.bugFixCount * 0.4 +
            authorCount * 0.2,
        };
      })
      .sort((a, b) => b.hotSpotScore - a.hotSpotScore);
  }

  async _collectCommits(log) {
    return Promise.all(log.all.map((c) => this._enrichCommit(c)));
  }

  async _enrichCommit(c) {
    const [filesChanged, branchesContaining] = await Promise.all([
      this._getFilesChanged(c.hash),
      this._getBranchesContaining(c.hash),
    ]);

    return {
      hash: c.hash,
      author: c.author_name,
      email: c.author_email,
      date: c.date,
      message: c.message,
      branch: pickBestBranch(branchesContaining),
      filesChanged,
      branchesContaining,
    };
  }

  async _getFilesChanged(hash) {
    try {
      const output = await this.git.raw([
        "show",
        "--pretty=",
        "--name-only",
        hash,
      ]);
      return output.split("\n").filter((line) => line.trim() !== "");
    } catch {
      return [];
    }
  }

  async _getBranchesContaining(hash) {
    try {
      const output = await this.git.raw([
        "branch",
        "--all",
        "--contains",
        hash,
      ]);
      return output
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}
