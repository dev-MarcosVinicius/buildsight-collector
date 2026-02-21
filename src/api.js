import axios from "axios";

const BASE_URL = "https://buildsight.app";
const BATCH_SIZE = 500;

export class BuildSightApi {
  constructor(token, { dryRun = false } = {}) {
    this.token = token;
    this.dryRun = dryRun;
  }

  async fetchPaths() {
    const { data } = await axios.get(
      `${BASE_URL}/api/collector/paths?token=${this.token}`
    );
    return data;
  }

  async registerPath({ name, path, periodDays }) {
    const { data } = await axios.post(`${BASE_URL}/api/collector/paths`, {
      token: this.token,
      name,
      path,
      periodDays,
    });
    return data;
  }

  async sendBatch(repoName, batch, part, totalParts, metadata) {
    if (this.dryRun) {
      const { data } = await axios.post(`${BASE_URL}/api/collector/test`, {
        token: this.token,
        repoName,
        part,
        totalParts,
        metadata,
        commits: batch,
      });
      return data;
    }

    await axios.post(`${BASE_URL}/api/collector/records`, {
      token: this.token,
      repoName,
      part,
      totalParts,
      metadata,
      commits: batch,
    });
  }

  prepareBatches(commits) {
    const totalBatches = Math.ceil(commits.length / BATCH_SIZE) || 1;
    const batches = Array.from({ length: totalBatches }, (_, i) =>
      commits.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
    );
    return { batches, totalBatches };
  }
}
