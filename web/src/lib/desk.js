export function reviewBlockReason(repo) {
  if (!repo) return 'Select a volume from the catalogue first.';
  if (repo.status !== 'shelved') return 'Wait until the shelf is ready before reviewing.';
  return null;
}

/** Review needs a concrete volume. Prefer the current pick, else the first ready shelf. */
export function splitPatchLines(patch) {
  if (!patch) return [];
  return String(patch).split('\n').map((text) => {
    if (text.startsWith('@@')) return { kind: 'meta', text };
    if (text.startsWith('+') && !text.startsWith('+++')) return { kind: 'add', text };
    if (text.startsWith('-') && !text.startsWith('---')) return { kind: 'del', text };
    return { kind: 'ctx', text };
  });
}

export function pickReviewVolume(selected, items = []) {
  if (selected) return selected;
  return items.find((item) => item.status === 'shelved') ?? items[0] ?? null;
}
