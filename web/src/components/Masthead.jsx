import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { MoonStar, Sun } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function StatusLamp({ online }) {
  const label = online === null ? 'checking' : online ? 'press ready' : 'press down';

  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          'size-[7px] rounded-full transition-colors duration-500',
          online === null && 'bg-muted-foreground/50',
          online === true && 'bg-accent',
          online === false && 'bg-destructive'
        )}
      />
      <span className="label-cat">{label}</span>
    </span>
  );
}

export function Masthead({ volumes }) {
  const [online, setOnline] = useState(null);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    let alive = true;
    const ping = () =>
      api
        .health()
        .then(() => alive && setOnline(true))
        .catch(() => alive && setOnline(false));

    ping();
    const id = setInterval(ping, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="border-b border-rule/70">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="flex items-end justify-between gap-6 pt-8 pb-4">
          <div className="animate-rise">
            <h1
              className="font-display text-[2.6rem] leading-[0.95] tracking-[-0.02em] sm:text-[3.25rem]"
              style={{ fontVariationSettings: "'SOFT' 12, 'WONK' 1, 'opsz' 120" }}
            >
              Git{' '}
              <em className="not-italic text-primary" style={{ fontStyle: 'italic' }}>
                Wiki
              </em>
            </h1>
            <p className="label-cat mt-2">A reading room for source code</p>
          </div>

          <div className="flex items-center gap-5 pb-1">
            <span className="hidden label-cat sm:inline">
              {volumes} {volumes === 1 ? 'volume' : 'volumes'} shelved
            </span>
            <span className="hidden h-4 w-px bg-rule sm:block" />
            <StatusLamp online={online} />
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle reading lamp"
              className="grid size-8 place-items-center border border-rule/80 text-muted-foreground
                         transition-colors hover:border-primary hover:text-primary
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="size-[15px]" strokeWidth={1.5} />
              ) : (
                <MoonStar className="size-[15px]" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>

        {/* the masthead's double rule */}
        <div className="animate-draw h-px bg-foreground/80" />
        <div className="animate-draw mt-[3px] h-px bg-foreground/25" style={{ animationDelay: '90ms' }} />
      </div>
    </header>
  );
}
