import fs from "fs";
import path from "path";

export class RepoFinder {
  constructor(maxDepth = 3) {
    this.maxDepth = maxDepth;
  }

  find(baseDir, currentDepth = 0) {
    if (currentDepth > this.maxDepth) return [];

    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });

      if (entries.some((e) => e.isDirectory() && e.name === ".git")) {
        return [{ name: path.basename(baseDir), path: baseDir }];
      }

      return entries
        .filter(
          (e) =>
            e.isDirectory() &&
            !e.name.startsWith(".") &&
            e.name !== "node_modules"
        )
        .flatMap((e) =>
          this.find(path.join(baseDir, e.name), currentDepth + 1)
        );
    } catch {
      return [];
    }
  }
}
