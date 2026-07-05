"use client";

import { useEffect, useState } from "react";
import { buildApiUrl } from "@/lib/api";

type ApiProfile = { location?: string };

export default function ProfileLocationEditor() {
  const [value, setValue] = useState("");
  const [savedValue, setSavedValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch(buildApiUrl("/api/profile"))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { profile?: ApiProfile } | null) => {
        if (!active) return;
        const next = data?.profile?.location || "";
        setValue(next);
        setSavedValue(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(buildApiUrl("/api/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: value }),
      });
      if (!res.ok) {
        setMessage("Failed to save location");
        return;
      }
      setSavedValue(value);
      setMessage("Location saved");
    } catch {
      setMessage("Failed to save location");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-shell -mt-6 pb-10">
      <div className="surface-subtle rounded-[1.4rem] border border-white/10 p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label htmlFor="profile-location" className="space-y-2">
            <p className="section-kicker">Location</p>
            <p className="text-muted-foreground text-sm">Optional. Leave blank to omit it from generated resumes.</p>
            <input id="profile-location" className="input-premium" value={value} placeholder="" onChange={(event) => setValue(event.target.value)} />
          </label>
          <button type="button" className="button-primary" onClick={save} disabled={saving || value === savedValue}>
            {saving ? "Saving..." : "Save Location"}
          </button>
        </div>
        {message ? <p className="text-muted-foreground mt-3 text-xs">{message}</p> : null}
      </div>
    </section>
  );
}
