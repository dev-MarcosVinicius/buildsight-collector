# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BuildSight Collector is a CLI tool that collects commits and metrics from local git repositories and sends them to the BuildSight API. It's published on npm as `buildsight-collector`.

## Commands

```bash
# Run locally during development
npm start -- <token>

# Or directly with node
node index.js <token>

# Install globally and run
npm install -g .
buildsight-collector <token>

# Test with npx (as end users would)
npx buildsight-collector <token>
```

## Architecture

The project is a single-file CLI (`index.js`) using ES modules. Main flow:

1. **Token validation** - Requires a 200+ character authentication token
2. **Fetch repository paths** - GET request to `buildsight.app/api/collector/paths` returns configured repo paths and auto-run settings
3. **Optional auto-run setup** - Configures cron (Linux/Mac) or Task Scheduler (Windows) for periodic execution
4. **For each repository**:
   - Fetches remote references (`git fetch --all`)
   - Collects commits from the configured period using `simple-git`
   - Gathers metadata: branches, merges, file change counts
   - Classifies commits by type (merge, revert, fix, feat, refactor, hotfix)
   - Sends data in batches of 500 commits to `buildsight.app/api/collector/records`

## Key Dependencies

- `simple-git` - Git operations
- `axios` - HTTP requests to BuildSight API
- `chalk` / `ora` - CLI output formatting and spinners

## Notes

- Requires Node.js 14+
- The codebase is primarily in Portuguese (variable names, messages)
- API endpoints are hardcoded to `https://buildsight.app`
