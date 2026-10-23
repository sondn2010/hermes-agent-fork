import { useEffect, useState } from "react";
import { ui } from "@bkt/shared/sdk";
import type { ClarifyCard } from "./reducer";

interface ClarifyDialogProps {
  card: ClarifyCard | null;
  otherSession: boolean;
  /** `null` skips every question (cancel). */
  onAnswer: (card: ClarifyCard, picks: Record<string, string[]> | null) => void;
}

/** The clarify tool's 1-5 questions; every question also takes a free-text answer. */
export function ClarifyDialog({ card, otherSession, onAnswer }: ClarifyDialogProps) {
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogFooter = ui("DialogFooter");
  const Button = ui("Button");
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  useEffect(() => {
    setPicks({});
    setOther({});
  }, [card?.serverRequestId]);

  if (!card) return null;

  const toggle = (qid: string, choice: string, multi: boolean) =>
    setPicks((current) => {
      const selected = current[qid] ?? [];
      if (!multi) return { ...current, [qid]: [choice] };
      return { ...current, [qid]: selected.includes(choice) ? selected.filter((c) => c !== choice) : [...selected, choice] };
    });

  const submit = () => {
    const merged: Record<string, string[]> = {};
    for (const q of card.questions) {
      const typed = other[q.qid]?.trim();
      const chosen = picks[q.qid] ?? [];
      // A typed answer replaces a single pick and joins a multi-select set.
      merged[q.qid] = typed ? (q.multi_select ? [...chosen, typed] : [typed]) : chosen;
    }
    onAnswer(card, merged);
  };

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onAnswer(card, null)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>The agent has a question</DialogTitle>
        </DialogHeader>
        <form
          className="bkt-col bkt-chat-clarify"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {otherSession && <div className="bkt-warning">From another session of this chat tab ({card.sessionId}).</div>}
          {card.questions.map((q) => {
            const locked = card.locked[q.qid];
            return (
              <fieldset key={q.qid} className="bkt-col bkt-chat-question">
                <legend>{q.question}</legend>
                {typeof locked === "string" && <div className="bkt-muted">Already answered: {locked}</div>}
                {q.choices?.map((choice) => (
                  <label key={choice} className="bkt-row">
                    <input
                      type={q.multi_select ? "checkbox" : "radio"}
                      name={`bkt-clarify-${q.qid}`}
                      checked={(picks[q.qid] ?? []).includes(choice)}
                      onChange={() => toggle(q.qid, choice, q.multi_select === true)}
                    />
                    {choice}
                  </label>
                ))}
                <input
                  className="bkt-input"
                  placeholder={q.choices?.length ? "Other…" : "Your answer"}
                  aria-label={`Answer: ${q.question}`}
                  value={other[q.qid] ?? ""}
                  onChange={(e) => setOther((current) => ({ ...current, [q.qid]: e.target.value }))}
                />
              </fieldset>
            );
          })}
          <DialogFooter>
            <Button type="button" outlined onClick={() => onAnswer(card, null)}>
              Skip
            </Button>
            <Button type="submit">Answer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
