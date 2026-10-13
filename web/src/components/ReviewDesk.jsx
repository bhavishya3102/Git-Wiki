import { useEffect, useState } from 'react';
import { Loader2, PenLine, Send } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { api } from '@/lib/api';
import { reviewBlockReason, splitPatchLines } from '@/lib/desk';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function FileDiff({ file }) {
  const lines = splitPatchLines(file.patch);
  const binary = !file.patch;

  return (
    <section className="border border-rule/70 bg-card/80">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule/60 px-4 py-2.5">
        <p className="break-all font-mono text-[0.75rem] leading-snug">{file.filename}</p>
        <p className="label-cat normal-case tracking-normal">
          {file.status}
          {file.previous_filename ? ` ← ${file.previous_filename}` : ''}
          {` · +${file.additions ?? 0} / −${file.deletions ?? 0}`}
        </p>
      </header>
      {binary ? (
        <p className="px-4 py-6 font-body text-[0.875rem] italic text-muted-foreground">
          No unified diff — binary or too large for GitHub to send a patch.
        </p>
      ) : (
        <pre className="max-h-[28rem] overflow-auto px-0 py-1 font-mono text-[0.72rem] leading-[1.55]">
          {lines.map((line, i) => (
            <span
              key={`${file.filename}-${i}`}
              className={cn(
                'block whitespace-pre-wrap break-all px-4',
                line.kind === 'add' && 'bg-accent/15 text-accent',
                line.kind === 'del' && 'bg-primary/10 text-primary',
                line.kind === 'meta' && 'bg-foreground/[0.04] text-muted-foreground'
              )}
            >
              {line.text || ' '}
            </span>
          ))}
        </pre>
      )}
    </section>
  );
}

export function ReviewDesk({ repo }) {
  const blocked = reviewBlockReason(repo);
  const [pulls, setPulls] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [open, setOpen] = useState(null);
  const [inspect, setInspect] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!repo) return undefined;

    let alive = true;
    setLoadError(null);
    setPulls(null);
    setOpen(null);
    setInspect(null);
    setPreview(null);
    api
      .pulls(repo.url)
      .then(({ pulls: next }) => {
        if (alive) setPulls(next);
      })
      .catch((error) => {
        if (alive) {
          setPulls([]);
          setLoadError(error.message);
          toast.error('Could not fetch open proofs', { description: error.message });
        }
      });

    return () => {
      alive = false;
    };
  }, [repo]);

  async function inspectPull(pull) {
    if (open === pull.number) {
      setOpen(null);
      return;
    }

    setOpen(pull.number);
    setInspect(null);
    setPreview(null);
    setInspecting(true);
    try {
      const next = await api.inspectPull({ url: repo.url, number: pull.number });
      setInspect({ ...next, list: pull });
    } catch (error) {
      toast.error('Could not open that proof', { description: error.message });
      setOpen(null);
    } finally {
      setInspecting(false);
    }
  }

  async function markReview() {
    if (!inspect) return;
    setDrafting(true);
    try {
      const result = await api.draftReview({ url: repo.url, number: inspect.pull.number });
      setPreview({ ...result, pull: inspect.pull });
    } catch (error) {
      toast.error('The proof came back unmarked', { description: error.message });
    } finally {
      setDrafting(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setPublishing(true);
    try {
      const { comment } = await api.publishReview({
        url: repo.url,
        number: preview.number,
        body: preview.body,
      });
      toast.success('Posted to the folio', { description: comment.url });
      setPreview((cur) => (cur ? { ...cur, postedUrl: comment.url } : cur));
    } catch (error) {
      toast.error('GitHub refused the comment', { description: error.message });
    } finally {
      setPublishing(false);
    }
  }

  if (!repo) {
    return (
      <div className="animate-rise border-t border-rule/70 pt-14 pb-10" style={{ animationDelay: '160ms' }}>
        <p
          className="max-w-[34ch] font-display text-[1.9rem] leading-[1.2] tracking-[-0.015em] text-muted-foreground"
          style={{ fontStyle: 'italic', fontVariationSettings: "'SOFT' 30, 'WONK' 1" }}
        >
          The proofs are still in the bindery.
        </p>
        <p className="mt-4 max-w-[46ch] font-body text-[1.0625rem] leading-relaxed text-muted-foreground">
          Select a volume from the catalogue first.
        </p>
      </div>
    );
  }

  const stats = inspect?.pull;

  return (
    <div className="animate-rise space-y-10" style={{ animationDelay: '120ms' }}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="label-cat">Open proofs</span>
        <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">
          {repo.owner}/{repo.name}
        </span>
      </div>

      <p className="max-w-[48ch] font-body text-[0.9375rem] italic leading-relaxed text-muted-foreground">
        Open a row to read the diffs. Mark review only after you have seen the change.
      </p>

      {pulls === null && <p className="label-cat animate-pulse">Walking the pull requests…</p>}

      {loadError && (
        <p className="font-body text-[0.9375rem] italic text-destructive">{loadError}</p>
      )}

      {pulls?.length === 0 && !loadError && (
        <p className="max-w-[46ch] font-body text-[1.0625rem] italic leading-relaxed text-muted-foreground">
          No open pull requests on this volume. Open one on GitHub, then return to the desk.
        </p>
      )}

      {pulls?.length > 0 && (
        <ol className="divide-y divide-rule/60 border-y border-rule/60">
          {pulls.map((pull) => {
            const expanded = open === pull.number;
            return (
              <li key={pull.number}>
                <button
                  type="button"
                  onClick={() => inspectPull(pull)}
                  className={cn(
                    'grid w-full gap-3 py-5 text-left sm:grid-cols-[3rem_minmax(0,1fr)] sm:items-center',
                    expanded && 'bg-primary/[0.04]'
                  )}
                >
                  <span className="font-mono text-[0.75rem] tabular-nums text-muted-foreground">
                    {String(pull.number).padStart(3, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[1.2rem] leading-tight tracking-[-0.015em]">{pull.title}</p>
                    <p className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">
                      {pull.author}
                      {pull.draft ? ' · galley' : ''}
                      {pull.updatedAt ? ` · ${new Date(pull.updatedAt).toLocaleDateString()}` : ''}
                      <span className="ml-3 text-primary">{expanded ? 'close proof' : 'inspect'}</span>
                    </p>
                  </div>
                </button>

                {expanded && (
                  <div className="space-y-5 border-t border-rule/50 pb-8 pt-5">
                    {inspecting && <p className="label-cat animate-pulse">Pulling the galleys…</p>}

                    {stats && (
                      <>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                          {[
                            ['Commits', stats.commits],
                            ['Files', stats.changedFiles ?? inspect.files.length],
                            ['Added', `+${stats.additions ?? 0}`],
                            ['Removed', `−${stats.deletions ?? 0}`],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt className="label-cat">{label}</dt>
                              <dd className="mt-1 font-display text-[1.65rem] leading-none tracking-[-0.02em]">
                                {value ?? '—'}
                              </dd>
                            </div>
                          ))}
                        </dl>

                        <div className="space-y-4">
                          {inspect.files.map((file) => (
                            <FileDiff key={file.filename} file={file} />
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 pt-2">
                          <Button
                            type="button"
                            disabled={drafting || Boolean(blocked)}
                            title={blocked ?? undefined}
                            onClick={markReview}
                            className="h-9 rounded-none bg-foreground px-5 font-mono text-[0.6875rem] uppercase
                                       tracking-[0.18em] text-background hover:bg-foreground/85"
                          >
                            {drafting ? <Loader2 className="size-3.5 animate-spin" /> : <PenLine className="size-3.5" />}
                            {drafting ? 'Marking' : 'Mark review'}
                          </Button>
                          {blocked && (
                            <span className="font-body text-[0.8125rem] italic text-muted-foreground">{blocked}</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {preview && (
        <article className="border-t border-rule/70 pt-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-5">
            <span className="label-cat">Marked #{String(preview.number).padStart(3, '0')}</span>
            <span className="h-px w-6 bg-rule" />
            <span className="label-cat normal-case tracking-normal">{preview.pull.title}</span>
          </div>

          {preview.critical_fixes?.length > 0 && (
            <section className="mb-6 border-l-2 border-primary bg-primary/[0.05] px-4 py-3">
              <p className="label-cat pb-2 text-primary">Critical</p>
              <ul className="space-y-1 font-body text-[0.9375rem] leading-relaxed">
                {preview.critical_fixes.map((fix) => (
                  <li key={fix}>{fix}</li>
                ))}
              </ul>
            </section>
          )}

          <div className={cn('prose-archive max-w-[66ch]')}>
            <ReactMarkdown>{preview.body}</ReactMarkdown>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button
              type="button"
              disabled={publishing}
              onClick={confirm}
              className="h-9 rounded-none bg-primary px-5 font-mono text-[0.6875rem] uppercase
                         tracking-[0.18em] text-primary-foreground hover:bg-primary/90"
            >
              {publishing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {publishing ? 'Posting' : 'Confirm · post comment'}
            </Button>
            {preview.postedUrl && (
              <a
                href={preview.postedUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-accent underline underline-offset-4"
              >
                Open on GitHub
              </a>
            )}
          </div>
        </article>
      )}
    </div>
  );
}
