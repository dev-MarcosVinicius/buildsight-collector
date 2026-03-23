import axios from "axios";
import simpleGit from "simple-git";

function extractSlug(url) {
  // SSH: git@github.com:owner/repo.git
  // HTTPS: https://github.com/owner/repo.git
  const sshMatch = url.match(/:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  const httpsMatch = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];
  const genericMatch = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (genericMatch) return genericMatch[1];
  return null;
}

function extractGitLabSlug(url) {
  const match = url.match(/gitlab[^/]*\/(.+?)(?:\.git)?$/);
  if (match) return match[1]; // may be owner/group/repo
  return extractSlug(url);
}

function extractAzureSlug(url) {
  // https://dev.azure.com/org/project/_git/repo
  const devAzure = url.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/);
  if (devAzure) return { org: devAzure[1], project: devAzure[2], repo: devAzure[3] };
  // https://org.visualstudio.com/project/_git/repo
  const vsMatch = url.match(/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/);
  if (vsMatch) return { org: vsMatch[1], project: vsMatch[2], repo: vsMatch[3] };
  return null;
}

function detectFromRemoteUrl(url, gitlabBaseUrl = null) {
  if (!url) return null;
  if (url.includes("github.com")) {
    return { provider: "github", slug: extractSlug(url) };
  }
  if (url.includes("dev.azure.com") || url.includes("visualstudio.com")) {
    return { provider: "azure", slug: extractAzureSlug(url) };
  }
  if (url.includes("gitlab.com") || url.match(/gitlab\./)) {
    return { provider: "gitlab", slug: extractGitLabSlug(url) };
  }
  // On-premise GitLab: check if the remote URL hostname matches the stored baseUrl
  if (gitlabBaseUrl) {
    try {
      const baseHostname = new URL(gitlabBaseUrl).hostname;
      const remoteHostname = url.includes("://")
        ? new URL(url).hostname
        : url.split(":")[0].split("@").pop();
      if (remoteHostname === baseHostname) {
        return { provider: "gitlab", slug: extractGitLabSlug(url) };
      }
    } catch {
      // ignore URL parse errors
    }
  }
  return null;
}

function diffHours(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / 3600000;
}

export class PrCollector {
  constructor(repoPath, sinceDate, credentials) {
    this.repoPath = repoPath;
    this.sinceDate = sinceDate;
    this.credentials = credentials;
    this.git = simpleGit(repoPath);
  }

  async detectProvider() {
    try {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin") ?? remotes[0];
      if (!origin) return null;
      const url = origin.refs.fetch || origin.refs.push;
      const gitlabBaseUrl = this.credentials.gitlab?.baseUrl ?? null;
      return detectFromRemoteUrl(url, gitlabBaseUrl);
    } catch {
      return null;
    }
  }

  async collect() {
    const info = await this.detectProvider();
    if (!info) return null;

    const token = this.credentials[info.provider]?.token;
    if (!token) return null;

    try {
      if (info.provider === "github") return await this._collectGitHub(info.slug, token);
      if (info.provider === "gitlab") return await this._collectGitLab(info.slug, token);
      if (info.provider === "azure") return await this._collectAzure(info.slug, token);
    } catch (err) {
      console.warn(`[pr-collector] Erro ao coletar PRs (${info.provider}):`, err.message);
    }
    return null;
  }

  async _collectGitHub(slug, token) {
    if (!slug) return null;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
    const since = this.sinceDate ? new Date(this.sinceDate).toISOString() : null;

    const prsRes = await axios.get(
      `https://api.github.com/repos/${slug}/pulls?state=all&sort=updated&direction=desc&per_page=100`,
      { headers }
    );

    const pullRequests = [];
    for (const pr of prsRes.data) {
      if (since && new Date(pr.updated_at) < new Date(since)) break;

      const reviews = await this._githubReviews(slug, pr.number, headers);

      const mergeDurationHours = pr.merged_at ? diffHours(pr.created_at, pr.merged_at) : null;
      const firstReview = reviews.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))[0];
      const timeToFirstReviewHours = firstReview ? diffHours(pr.created_at, firstReview.submittedAt) : null;

      pullRequests.push({
        externalId: pr.number,
        title: pr.title,
        state: pr.merged_at ? "merged" : pr.state,
        author: pr.user?.login ?? "",
        createdAt: pr.created_at,
        mergedAt: pr.merged_at ?? null,
        closedAt: pr.closed_at ?? null,
        linesAdded: pr.additions ?? 0,
        linesDeleted: pr.deletions ?? 0,
        commitsCount: pr.commits ?? 0,
        reviewCount: reviews.length,
        reviewerCount: new Set(reviews.map((r) => r.reviewer)).size,
        commentCount: pr.comments ?? 0,
        mergeDurationHours,
        timeToFirstReviewHours,
        reviews,
      });
    }

    return { provider: "github", pullRequests };
  }

  async _githubReviews(slug, prNumber, headers) {
    try {
      const res = await axios.get(
        `https://api.github.com/repos/${slug}/pulls/${prNumber}/reviews`,
        { headers }
      );
      return res.data.map((r) => ({
        reviewer: r.user?.login ?? "",
        state: r.state,
        submittedAt: r.submitted_at,
      }));
    } catch {
      return [];
    }
  }

  async _collectGitLab(slug, token) {
    if (!slug) return null;
    const headers = { "PRIVATE-TOKEN": token };
    const encodedSlug = encodeURIComponent(slug);
    const since = this.sinceDate ? new Date(this.sinceDate).toISOString() : null;
    const gitlabBase = (this.credentials.gitlab?.baseUrl ?? "https://gitlab.com").replace(/\/$/, "");

    const params = { state: "all", per_page: 100 };
    if (since) params.updated_after = since;

    const mrsRes = await axios.get(
      `${gitlabBase}/api/v4/projects/${encodedSlug}/merge_requests`,
      { headers, params }
    );

    const pullRequests = [];
    for (const mr of mrsRes.data) {
      const reviews = await this._gitlabReviews(encodedSlug, mr.iid, headers);

      const mergedAt = mr.merged_at ?? null;
      const mergeDurationHours = mergedAt ? diffHours(mr.created_at, mergedAt) : null;
      const firstReview = reviews.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))[0];
      const timeToFirstReviewHours = firstReview ? diffHours(mr.created_at, firstReview.submittedAt) : null;

      pullRequests.push({
        externalId: mr.iid,
        title: mr.title,
        state: mergedAt ? "merged" : mr.state === "closed" ? "closed" : "open",
        author: mr.author?.username ?? "",
        createdAt: mr.created_at,
        mergedAt,
        closedAt: mr.closed_at ?? null,
        linesAdded: mr.changes_count ?? 0,
        linesDeleted: 0,
        commitsCount: 0,
        reviewCount: reviews.length,
        reviewerCount: new Set(reviews.map((r) => r.reviewer)).size,
        commentCount: mr.user_notes_count ?? 0,
        mergeDurationHours,
        timeToFirstReviewHours,
        reviews,
      });
    }

    return { provider: "gitlab", pullRequests };
  }

  async _gitlabReviews(encodedSlug, iid, headers) {
    try {
      const gitlabBase = (this.credentials.gitlab?.baseUrl ?? "https://gitlab.com").replace(/\/$/, "");
      const [approvalsRes, notesRes] = await Promise.all([
        axios.get(`${gitlabBase}/api/v4/projects/${encodedSlug}/merge_requests/${iid}/approvals`, { headers }),
        axios.get(`${gitlabBase}/api/v4/projects/${encodedSlug}/merge_requests/${iid}/notes?per_page=100`, { headers }),
      ]);

      const reviews = [];
      for (const a of approvalsRes.data?.approved_by ?? []) {
        reviews.push({ reviewer: a.user?.username ?? "", state: "APPROVED", submittedAt: new Date().toISOString() });
      }
      for (const note of notesRes.data ?? []) {
        if (!note.system && note.author) {
          reviews.push({ reviewer: note.author.username ?? "", state: "COMMENTED", submittedAt: note.created_at });
        }
      }
      return reviews;
    } catch {
      return [];
    }
  }

  async _collectAzure(slugInfo, token) {
    if (!slugInfo || typeof slugInfo !== "object") return null;
    const { org, project, repo } = slugInfo;
    const headers = { Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}` };

    const prsRes = await axios.get(
      `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}/pullrequests?searchCriteria.status=all&api-version=7.1`,
      { headers }
    );

    const pullRequests = [];
    for (const pr of prsRes.data?.value ?? []) {
      const reviews = await this._azureReviews(org, project, repo, pr.pullRequestId, headers);

      const createdAt = pr.creationDate;
      const mergedAt = pr.status === "completed" ? pr.closedDate ?? null : null;
      const closedAt = pr.status === "abandoned" ? pr.closedDate ?? null : null;
      const mergeDurationHours = mergedAt ? diffHours(createdAt, mergedAt) : null;
      const firstReview = reviews.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))[0];
      const timeToFirstReviewHours = firstReview ? diffHours(createdAt, firstReview.submittedAt) : null;

      pullRequests.push({
        externalId: pr.pullRequestId,
        title: pr.title,
        state: mergedAt ? "merged" : closedAt ? "closed" : "open",
        author: pr.createdBy?.uniqueName ?? pr.createdBy?.displayName ?? "",
        createdAt,
        mergedAt,
        closedAt,
        linesAdded: 0,
        linesDeleted: 0,
        commitsCount: 0,
        reviewCount: reviews.length,
        reviewerCount: new Set(reviews.map((r) => r.reviewer)).size,
        commentCount: pr.reviewers?.length ?? 0,
        mergeDurationHours,
        timeToFirstReviewHours,
        reviews,
      });
    }

    return { provider: "azure", pullRequests };
  }

  async _azureReviews(org, project, repo, prId, headers) {
    try {
      const res = await axios.get(
        `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}/pullrequests/${prId}/reviewers?api-version=7.1`,
        { headers }
      );
      return (res.data?.value ?? []).map((r) => ({
        reviewer: r.uniqueName ?? r.displayName ?? "",
        state: r.vote === 10 ? "APPROVED" : r.vote === -10 ? "CHANGES_REQUESTED" : "COMMENTED",
        submittedAt: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }
}
