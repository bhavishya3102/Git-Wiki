import { cn } from '@/lib/utils';

const DESKS = [
  { id: 'ask', label: 'Ask', kicker: 'The text' },
  { id: 'review', label: 'Review', kicker: 'The proofs' },
];

export function DeskToggle({ mode, onChange }) {
  return (
    <div role="tablist" aria-label="Desk" className="flex items-end gap-8">
      {DESKS.map((desk) => {
        const active = mode === desk.id;
        return (
          <button
            key={desk.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(desk.id)}
            className="group text-left"
          >
            <span className="label-cat block pb-1">{desk.kicker}</span>
            <span
              className={cn(
                'font-display text-[1.65rem] leading-none tracking-[-0.02em] sm:text-[1.9rem]',
                active ? 'text-foreground' : 'text-muted-foreground/55 hover:text-foreground/80'
              )}
              style={{ fontVariationSettings: "'SOFT' 24, 'WONK' 1", fontStyle: 'italic' }}
            >
              {desk.label}
            </span>
            <span
              className={cn(
                'mt-2 block h-px origin-left transition-transform duration-300',
                active ? 'scale-x-100 bg-primary' : 'scale-x-0 bg-rule group-hover:scale-x-100'
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
