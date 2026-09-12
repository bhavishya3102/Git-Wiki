import { useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { Masthead } from '@/components/Masthead';
import { CatalogueRail } from '@/components/CatalogueRail';
import { Composer } from '@/components/Composer';
import { AnswerPlate } from '@/components/AnswerPlate';
import { Skeleton } from '@/components/ui/skeleton';
import { api, LOGIN_URL } from '@/lib/api';
import { useCatalog } from '@/lib/useCatalog';

function ReadingDesk() {
  return (
    <div className="animate-rise border-t border-rule/70 pt-14 pb-10" style={{ animationDelay: '200ms' }}>
      <p className="max-w-[34ch] font-display text-[1.9rem] leading-[1.2] tracking-[-0.015em] text-muted-foreground"
         style={{ fontStyle: 'italic', fontVariationSettings: "'SOFT' 30, 'WONK' 1" }}>
        The desk is clear.
      </p>
      <p className="mt-4 max-w-[46ch] font-body text-[1.0625rem] leading-relaxed text-muted-foreground">
        Shelve a repository, then ask it something. Answers are drawn only from the
        passages actually retrieved — each one is numbered in the margin, so you can
        check the work rather than trust it.
      </p>
    </div>
  );
}

function Consulting() {
  return (
    <div className="border-t border-rule/70 pt-8">
      <div className="flex items-center gap-3 pb-6">
        <span className="label-cat animate-pulse">Consulting the shelf</span>
        <span className="h-px flex-1 bg-rule/70" />
      </div>
      <div className="grid gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,66ch)_14rem] xl:justify-start">
        <div className="space-y-3">
          {[100, 96, 92, 98, 70].map((w, i) => (
            <Skeleton
              key={i}
              className="h-[13px] rounded-none bg-foreground/[0.07]"
              style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton
              key={i}
              className="h-12 rounded-none bg-foreground/[0.05]"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SignIn() {
  return (
    <div className="min-h-screen">
      <Masthead />

      <main className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="animate-rise max-w-[46ch] py-16" style={{ animationDelay: '120ms' }}>
          <p className="font-display text-[1.9rem] leading-[1.2] tracking-[-0.015em]"
             style={{ fontStyle: 'italic', fontVariationSettings: "'SOFT' 30, 'WONK' 1" }}>
            The reading room keeps a register.
          </p>
          <p className="mt-4 font-body text-[1.0625rem] leading-relaxed text-muted-foreground">
            Sign in with GitHub to shelve your public repositories and question them.
            Only your public profile is read — no access to your repositories is requested.
          </p>
          <a
            href={LOGIN_URL}
            className="mt-8 inline-flex h-10 items-center gap-2 bg-primary px-5 font-mono text-[0.6875rem]
                       uppercase tracking-[0.18em] text-primary-foreground transition-transform
                       hover:bg-primary/90 active:translate-y-px"
          >
            <LogIn className="size-3.5" />
            Sign in with GitHub
          </a>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  // undefined while checking the session cookie, null when signed out.
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return null;
  if (!user) return <SignIn />;

  return <ReadingRoom user={user} onSignOut={() => api.logout().finally(() => setUser(null))} />;
}

function ReadingRoom({ user, onSignOut }) {
  const catalogue = useCatalog();
  const [selected, setSelected] = useState(null);
  const [entries, setEntries] = useState([]);
  const [asking, setAsking] = useState(false);

  async function handleAsk(question) {
    setAsking(true);
    try {
      const result = await api.ask({ question, repo: selected?.url });
      setEntries((prev) => [
        { ...result, question, repo: selected, at: Date.now() },
        ...prev,
      ]);

      // A shelved repo answers with sources; an empty answer means it is still indexing.
      if (selected && result.sources.length > 0) {
        catalogue.setStatus(selected.url, 'shelved');
      }
    } catch (error) {
      toast.error('The question came back unanswered', { description: error.message });
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Masthead volumes={catalogue.items.length} user={user} onSignOut={onSignOut} />

      <main className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="grid gap-x-12 gap-y-12 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="animate-rise lg:sticky lg:top-8 lg:self-start lg:border-r lg:border-rule/50 lg:pr-8">
            <CatalogueRail
              catalogue={catalogue}
              selected={selected}
              onSelect={(repo) => setSelected((cur) => (cur?.url === repo.url ? null : repo))}
            />
          </div>

          <div className="min-w-0 space-y-12">
            <Composer repo={selected} busy={asking} onAsk={handleAsk} />

            {asking && <Consulting />}

            {entries.length === 0 && !asking && <ReadingDesk />}

            {entries.map((entry, i) => (
              <AnswerPlate key={entry.at} entry={entry} muted={i > 0} />
            ))}
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-[1400px] px-6 pb-10 lg:px-10">
        <div className="border-t border-rule/70 pt-4">
          <p className="label-cat">
            Express · Inngest · Pinecone · LangChain — answers cite only what was retrieved
          </p>
        </div>
      </footer>
    </div>
  );
}
