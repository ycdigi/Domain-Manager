// Only an entire, recognizable PAT is a legacy credential; ordinary notes stay notes.
export const legacyGithubToken = (memo: unknown): string | null => typeof memo === 'string' && /^(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}$/.test(memo.trim()) ? memo.trim() : null
