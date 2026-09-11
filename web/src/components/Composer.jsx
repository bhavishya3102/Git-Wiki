import { useState } from 'react';
import { CornerDownLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const PROMPTS = [
  'What does this project do?',
  'How do I run it locally?',
  'Where does the entry point live?',
  'What external services does it call?',
];

export function Composer({ repo, busy, onAsk }) {
  const [question, setQuestion] = useState('');

  function submit(event) {
    event?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    onAsk(trimmed);
    setQuestion('');
  }

  return (
    <form onSubmit={submit} className="animate-rise" style={{ animationDelay: '120ms' }}>
      <div className="flex items-baseline justify-between gap-4 pb-3">
        <span className="label-cat">Put a question to the text</span>
        <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">
          {repo ? `${repo.owner}/${repo.name}` : 'every shelved volume'}
        </span>
      </div>

      <div
        className="group relative border border-rule/80 bg-card transition-colors
                   focus-within:border-primary/70"
      >
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          rows={3}
          placeholder="Ask how something works, where it lives, or why it is there…"
          className="min-h-[92px] resize-none rounded-none border-0 bg-transparent px-5 py-4
                     font-body text-[1.0625rem] leading-relaxed shadow-none
                     placeholder:text-muted-foreground/60 focus-visible:ring-0 dark:bg-transparent"
        />

        <div className="flex items-center justify-between border-t border-rule/60 px-3 py-2">
          <span className="label-cat hidden sm:inline">
            Cmd / Ctrl + Enter to send
          </span>
          <Button
            type="submit"
            disabled={busy || !question.trim()}
            className="h-8 rounded-none bg-foreground px-4 font-mono text-[0.6875rem] uppercase
                       tracking-[0.18em] text-background transition-transform
                       hover:bg-foreground/85 active:translate-y-px disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CornerDownLeft className="size-3.5" />}
            {busy ? 'Consulting' : 'Ask'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-3">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setQuestion(prompt)}
            className="font-body text-[0.875rem] italic text-muted-foreground underline decoration-rule
                       decoration-dotted underline-offset-4 transition-colors hover:text-primary
                       hover:decoration-primary/60"
          >
            {prompt}
          </button>
        ))}
      </div>
    </form>
  );
}
