import { Children, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

/** Turns every `[n]` in a text node into a live marginal reference. */
function useCitationRenderer(active, setActive) {
  return useMemo(() => {
    function transform(children) {
      return Children.map(children, (child) => {
        if (typeof child !== 'string') return child;

        return child.split(/(\[\d+\])/g).map((part, i) => {
          const match = /^\[(\d+)\]$/.exec(part);
          if (!match) return part;

          const n = Number(match[1]);
          return (
            <button
              key={`${n}-${i}`}
              type="button"
              onMouseEnter={() => setActive(n)}
              onFocus={() => setActive(n)}
              onMouseLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
              onClick={() =>
                document
                  .getElementById(`marginalia-${n}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
              aria-label={`Source ${n}`}
              className={cn(
                'ml-[0.1em] inline-flex -translate-y-[0.4em] items-center px-[0.22em]',
                'font-mono text-[0.68em] leading-none transition-colors',
                active === n
                  ? 'bg-primary text-primary-foreground'
                  : 'text-primary hover:bg-primary/12'
              )}
            >
              {n}
            </button>
          );
        });
      });
    }

    const wrap = (Tag, className) =>
      function Wrapped({ children, ...props }) {
        return (
          <Tag className={className} {...props}>
            {transform(children)}
          </Tag>
        );
      };

    return {
      p: wrap('p'),
      li: wrap('li'),
      strong: wrap('strong', 'font-semibold'),
      em: wrap('em'),
      h1: wrap('h1', 'font-display text-[1.5rem] mt-6 mb-2 tracking-[-0.01em]'),
      h2: wrap('h2', 'font-display text-[1.3rem] mt-6 mb-2 tracking-[-0.01em]'),
      h3: wrap('h3', 'font-display text-[1.15rem] mt-5 mb-1.5 tracking-[-0.01em]'),
      a: ({ children, ...props }) => (
        <a
          {...props}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline decoration-primary/40 underline-offset-2"
        >
          {children}
        </a>
      ),
    };
  }, [active, setActive]);
}

function Marginalia({ source, index, active, setActive, top }) {
  const relative = Math.max(0.08, Math.min(1, source.score / top));

  return (
    <li
      id={`marginalia-${source.n ?? index + 1}`}
      onMouseEnter={() => setActive(source.n ?? index + 1)}
      onMouseLeave={() => setActive(null)}
      className={cn(
        'group border-l-2 py-2.5 pl-3 transition-all duration-300',
        active
          ? 'border-l-primary bg-primary/[0.06]'
          : 'border-l-rule/70 hover:border-l-muted-foreground'
      )}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'font-mono text-[0.625rem] transition-colors',
            active ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {String(source.n ?? index + 1).padStart(2, '0')}
        </span>
        <span className="break-all font-mono text-[0.6875rem] leading-snug text-foreground/85">
          {source.source}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="h-px flex-1 bg-rule/60">
          <span
            className={cn('block h-px transition-colors', active ? 'bg-primary' : 'bg-muted-foreground/70')}
            style={{ width: `${relative * 100}%` }}
          />
        </span>
        <span className="font-mono text-[0.5625rem] tabular-nums text-muted-foreground">
          {source.score?.toFixed(3)}
        </span>
      </div>

      {source.text ? (
        <p
          className={cn(
            'mt-2 line-clamp-3 max-h-[3.4rem] overflow-hidden font-body text-[0.75rem] italic',
            'leading-snug text-muted-foreground transition-all duration-300',
            'group-hover:line-clamp-none group-hover:max-h-40 group-hover:overflow-y-auto'
          )}
        >
          {source.text}
        </p>
      ) : null}
    </li>
  );
}

export function AnswerPlate({ entry, muted = false }) {
  const [active, setActive] = useState(null);
  const components = useCitationRenderer(active, setActive);

  const top = Math.max(...entry.sources.map((s) => s.score ?? 0), 0.0001);
  const unanswered = entry.sources.length === 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
      className={cn('border-t border-rule/70 pt-8 transition-opacity', muted && 'opacity-70 hover:opacity-100')}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-5">
        <span className="label-cat">
          {entry.repo ? `${entry.repo.owner}/${entry.repo.name}` : 'all volumes'}
        </span>
        <span className="h-px w-6 bg-rule" />
        <span className="label-cat normal-case tracking-normal">
          {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <h2
        className="max-w-[38ch] font-display text-[1.75rem] leading-[1.15] tracking-[-0.015em] sm:text-[2.1rem]"
        style={{ fontVariationSettings: "'SOFT' 20, 'WONK' 1, 'opsz' 90", fontStyle: 'italic' }}
      >
        {entry.question}
      </h2>

      <div className="mt-7 grid gap-x-8 gap-y-8 xl:grid-cols-[minmax(0,66ch)_14rem] xl:justify-start">
        <div className="prose-archive">
          <ReactMarkdown components={components}>{entry.answer}</ReactMarkdown>
        </div>

        {!unanswered && (
          <aside className="xl:sticky xl:top-8 xl:self-start">
            <div className="flex items-center gap-3 pb-3">
              <span className="label-cat">Marginalia</span>
              <span className="h-px flex-1 bg-rule/70" />
            </div>
            <ul className="space-y-px">
              {entry.sources.map((source, i) => (
                <Marginalia
                  key={`${source.source}-${i}`}
                  source={source}
                  index={i}
                  top={top}
                  active={active === (source.n ?? i + 1)}
                  setActive={setActive}
                />
              ))}
            </ul>
            <p className="pt-3 font-body text-[0.75rem] italic leading-snug text-muted-foreground">
              Hover a numeral in the text to raise its passage here.
            </p>
          </aside>
        )}
      </div>
    </motion.article>
  );
}
