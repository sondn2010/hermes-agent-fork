import { useState } from "react";
import { ui } from "@bkt/shared/sdk";
import type { ApprovalChoice } from "./protocol";
import type { ApprovalCard } from "./reducer";

const LABELS: Record<ApprovalChoice, string> = {
  once: "Allow once",
  session: "Allow for this session",
  always: "Always allow",
  deny: "Deny",
};

interface ApprovalDialogProps {
  card: ApprovalCard | null;
  /** More approvals are queued behind this one. */
  queued: number;
  /** The card belongs to a session other than the one on screen. */
  otherSession: boolean;
  onAnswer: (card: ApprovalCard, choice: ApprovalChoice) => void;
}

/** A dangerous command waits for the user's decision; the turn blocks until it is answered. */
export function ApprovalDialog({ card, queued, otherSession, onAnswer }: ApprovalDialogProps) {
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogFooter = ui("DialogFooter");
  const Button = ui("Button");
  const [answered, setAnswered] = useState<string | null>(null);

  if (!card) return null;
  const answer = (choice: ApprovalChoice) => {
    if (answered === card.requestId) return;
    setAnswered(card.requestId);
    onAnswer(card, choice);
  };

  return (
    // Dismissing without a choice would leave the agent waiting, so only the buttons close it.
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Approve command?</DialogTitle>
        </DialogHeader>
        <div className="bkt-col">
          {otherSession && <div className="bkt-warning">From another session of this chat tab ({card.sessionId}).</div>}
          <div className="bkt-muted">{card.description}</div>
          {card.command && <pre className="bkt-code bkt-chat-approval-command">{card.command}</pre>}
          {queued > 0 && <div className="bkt-muted">{queued} more waiting.</div>}
        </div>
        <DialogFooter>
          {card.choices.map((choice) => (
            <Button
              key={choice}
              type="button"
              destructive={choice === "deny"} outlined={choice !== "deny" && choice !== "once"}
              disabled={answered === card.requestId}
              onClick={() => answer(choice)}
            >
              {LABELS[choice]}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
