"use client";

import { useCallback, useEffect, useState } from "react";
import type { OpenQuestionGroup } from "@/lib/auto-apply/inbox";
import { autoApplyApi } from "./api";
import { Chip, Spinner } from "./ui";
import type { AutoApplyController } from "./useAutoApply";

function GroupCard({ group, c, onAnswered }: { group: OpenQuestionGroup; c: AutoApplyController; onAnswered: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(group.rememberDefault);
  const busyKey = `oq:${group.key}`;
  const busy = Boolean(c.busy[busyKey]);
  const companies = [...new Set(group.items.map((item) => item.company))];
  // A yes/no declaration may carry no option list of its own; it is still answered with a choice.
  const choices = group.options.length ? group.options : group.type === "boolean" ? ["Yes", "No"] : [];

  async function submit() {
    if (!value.trim() || !c.activeId) return;
    await c.act(busyKey, async () => {
      const result = await autoApplyApi.answerOpenQuestion(c.activeId!, { key: group.key, value, remember });
      c.notify(result.stillOpen ? "info" : "success", result.stillOpen ? `Filled ${result.filled}. ${result.stillOpen} form${result.stillOpen === 1 ? "" : "s"} word the choices differently: answer ${result.stillOpen === 1 ? "it" : "them"} in the application.` : `Filled ${result.filled} application${result.filled === 1 ? "" : "s"}.`);
      setValue("");
      await onAnswered();
    });
  }

  return (
    <li className="surface-subtle space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-foreground min-w-0 break-words text-sm font-semibold leading-snug">{group.label}</p>
        <Chip tone="info">Fills {group.items.length} application{group.items.length === 1 ? "" : "s"}</Chip>
      </div>
      <p className="text-muted-foreground text-xs leading-5">{companies.slice(0, 4).join(", ")}{companies.length > 4 ? ` and ${companies.length - 4} more` : ""}{group.note ? ` · ${group.note}` : ""}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <label className="sr-only" htmlFor={`oq-${group.key}`}>Answer for {group.label}</label>
          {choices.length ? (
            <select id={`oq-${group.key}`} value={value} onChange={(event) => setValue(event.target.value)} className="input-premium min-h-11 w-full">
              <option value="">Choose…</option>
              {choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
            </select>
          ) : (
            <input id={`oq-${group.key}`} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Your answer" className="input-premium min-h-11 w-full" />
          )}
        </div>
        <button type="button" className="button-primary min-h-11" disabled={!value.trim() || busy} onClick={() => void submit()}>
          {busy ? <Spinner /> : null}Apply to {group.items.length}
        </button>
      </div>
      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4" />
        Remember this answer for future applications
      </label>
    </li>
  );
}

/** Questions that several applications are waiting on, answered once. Hidden when nothing is waiting. */
export default function OpenQuestions({ c }: { c: AutoApplyController }) {
  const [groups, setGroups] = useState<OpenQuestionGroup[]>([]);
  const waiting = c.data?.counts?.needs_input || 0;
  const load = useCallback(async () => {
    if (!c.activeId) return;
    try {
      setGroups((await autoApplyApi.openQuestions(c.activeId)).groups);
    } catch {
      setGroups([]);
    }
  }, [c.activeId]);

  useEffect(() => {
    if (!waiting) setGroups([]);
    else void load();
  }, [waiting, load]);

  if (!groups.length) return null;
  const jobIds = new Set(groups.flatMap((group) => group.items.map((item) => item.jobId)));
  return (
    <section aria-labelledby="open-questions" className="space-y-3">
      <div>
        <h3 id="open-questions" className="text-foreground text-base font-semibold">Answer once, apply to all</h3>
        <p className="text-muted-foreground text-sm leading-6">{groups.length} question{groups.length === 1 ? " is" : "s are"} holding up {jobIds.size} application{jobIds.size === 1 ? "" : "s"}. One answer fills every application that asks it.</p>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {groups.map((group) => <GroupCard key={group.key} group={group} c={c} onAnswered={load} />)}
      </ul>
    </section>
  );
}
