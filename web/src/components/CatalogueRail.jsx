import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookMarked, Check, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function AccessionForm({ onAccession }) {
  // null while GitHub is being asked for the user's public repos.
  const [options, setOptions] = useState(null);
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .githubRepos()
      .then(({ repos }) => setOptions(repos))
      .catch((error) => {
        setOptions([]);
        toast.error('Could not list your GitHub repositories', { description: error.message });
      });
  }, []);

  function choose(value) {
    setUrl(value);
    setBranch(options.find((r) => r.url === value)?.branch ?? '');
  }

  async function submit(event) {
    event.preventDefault();
    if (!url) {
      toast.error('Pick one of your repositories first.');
      return;
    }

    setBusy(true);
    try {
      const { repo } = await api.indexRepo({ url, branch: branch.trim() || undefined });
      onAccession(repo);
      setUrl('');
      setBranch('');
      toast.success('Sent to the bindery', {
        description: `${repo.owner}/${repo.name} is being read and shelved.`,
      });
    } catch (error) {
      toast.error('Could not accession that repository', { description: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="label-cat block" htmlFor="repo-url">
        Accession a repository
      </label>

      <Select value={url} onValueChange={choose} disabled={!options?.length}>
        <SelectTrigger
          id="repo-url"
          className="h-10 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 font-mono
                     text-[0.8125rem] shadow-none focus-visible:border-primary focus-visible:ring-0
                     dark:bg-transparent dark:hover:bg-transparent"
        >
          <SelectValue
            placeholder={
              options === null
                ? 'Reading your GitHub…'
                : options.length
                  ? 'Choose a public repository'
                  : 'No public repositories found'
            }
          />
        </SelectTrigger>
        <SelectContent position="popper" className="rounded-none">
          {options?.map((r) => (
            <SelectItem key={r.url} value={r.url} className="rounded-none font-mono text-[0.8125rem]">
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="label-cat block pb-1.5" htmlFor="repo-branch">
            Branch
          </label>
          <Input
            id="repo-branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="default"
            spellCheck={false}
            className="h-9 rounded-none border-0 border-b border-rule bg-transparent px-0 font-mono text-[0.8125rem]
                       shadow-none focus-visible:border-primary focus-visible:ring-0 dark:bg-transparent"
          />
        </div>

        <Button
          type="submit"
          disabled={busy}
          className="h-9 rounded-none bg-primary px-4 font-mono text-[0.6875rem] uppercase tracking-[0.18em]
                     text-primary-foreground transition-transform hover:bg-primary/90 active:translate-y-px"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Shelve
        </Button>
      </div>
    </form>
  );
}

function CatalogueCard({ item, active, onSelect, onRemove, onStatus }) {
  const [checking, setChecking] = useState(false);

  async function check(event) {
    event.stopPropagation();
    setChecking(true);
    try {
      const { matches } = await api.probe(item.url);
      const ready = matches.length > 0;
      onStatus(item.url, ready ? 'shelved' : 'queued');
      toast[ready ? 'success' : 'info'](
        ready ? 'Shelved and readable' : 'Still in the bindery',
        {
          description: ready
            ? `${item.owner}/${item.name} can be questioned now.`
            : 'Indexing has not finished writing pages yet.',
        }
      );
    } catch (error) {
      toast.error('Could not check the shelf', { description: error.message });
    } finally {
      setChecking(false);
    }
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        className={cn(
          'group relative w-full border-l-2 py-3 pl-4 pr-2 text-left transition-colors',
          active
            ? 'border-l-primary bg-primary/[0.05]'
            : 'border-l-rule/60 hover:border-l-muted-foreground hover:bg-foreground/[0.025]'
        )}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-display text-[1.05rem] leading-tight tracking-[-0.01em]">
            {item.name}
          </span>
          <span className="label-cat shrink-0 normal-case tracking-normal">{item.branch}</span>
        </span>

        <span className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">
            {item.owner}
          </span>

          <span className="flex items-center gap-1.5">
            {item.status === 'shelved' ? (
              <span className="flex items-center gap-1 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-accent">
                <Check className="size-3" strokeWidth={2.4} /> shelved
              </span>
            ) : (
              <span
                onClick={check}
                role="button"
                tabIndex={-1}
                className="flex items-center gap-1 font-mono text-[0.625rem] uppercase tracking-[0.16em]
                           text-muted-foreground transition-colors hover:text-primary"
              >
                {checking ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                check
              </span>
            )}

            <span
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.url);
              }}
              role="button"
              tabIndex={-1}
              aria-label="Remove from catalogue"
              className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
            >
              <X className="size-3" />
            </span>
          </span>
        </span>
      </button>
    </motion.li>
  );
}

export function CatalogueRail({ catalogue, selected, onSelect }) {
  const { items, add, setStatus, remove } = catalogue;

  return (
    <aside className="space-y-8">
      <AccessionForm
        onAccession={(repo) => {
          add(repo);
          onSelect(repo);
        }}
      />

      <div>
        <div className="flex items-center gap-3 pb-3">
          <span className="label-cat">The catalogue</span>
          <span className="h-px flex-1 bg-rule/70" />
        </div>

        {items.length === 0 ? (
          <p className="py-6 pr-4 font-body text-[0.9375rem] italic leading-relaxed text-muted-foreground">
            Nothing shelved yet. Accession a repository above and it will be read,
            cut into passages, and filed for questioning.
          </p>
        ) : (
          <ul className="space-y-px">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <CatalogueCard
                  key={item.url}
                  item={item}
                  active={selected?.url === item.url}
                  onSelect={onSelect}
                  onRemove={remove}
                  onStatus={setStatus}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <p className="flex items-start gap-2 border-t border-rule/60 pt-4 font-body text-[0.8125rem] leading-relaxed text-muted-foreground">
        <BookMarked className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
        Indexing runs in the background through Inngest. A large repository takes a
        few minutes before its pages are readable.
      </p>
    </aside>
  );
}
