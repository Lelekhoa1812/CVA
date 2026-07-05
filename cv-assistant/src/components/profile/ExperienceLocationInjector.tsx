"use client";

import { useEffect } from "react";
import { buildApiUrl } from "@/lib/api";
import { broadcastProfileUpdated } from "@/lib/profile-sync";

type Experience = {
  location?: string;
  companyName?: string;
  role?: string;
  timeFrom?: string;
  timeTo?: string;
  description?: string;
};

type ProfilePayload = {
  profile?: {
    experiences?: Experience[];
  };
};

function makeLocationField(initialValue: string, onSave: (value: string) => void) {
  const wrapper = document.createElement("label");
  wrapper.className = "space-y-2 cv-experience-location-field";

  const header = document.createElement("div");
  header.className = "flex items-center justify-between gap-4";

  const label = document.createElement("span");
  label.className = "text-foreground text-sm font-medium";
  label.textContent = "Location";

  const hint = document.createElement("span");
  hint.className = "text-muted-foreground text-xs";
  hint.textContent = "Optional";

  const input = document.createElement("input");
  input.className = "input-premium";
  input.value = initialValue;
  input.placeholder = "";

  let lastSaved = initialValue;
  input.addEventListener("blur", () => {
    const next = input.value.trim();
    if (next === lastSaved) return;
    lastSaved = next;
    onSave(next);
  });

  header.append(label, hint);
  wrapper.append(header, input);
  return wrapper;
}

export default function ExperienceLocationInjector() {
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const res = await fetch(buildApiUrl("/api/profile"));
      if (!res.ok || cancelled) return null;
      return (await res.json()) as ProfilePayload;
    }

    async function saveExperienceLocation(index: number, value: string) {
      const payload = await loadProfile();
      const experiences = payload?.profile?.experiences;
      if (!experiences || !experiences[index]) return;
      const nextExperiences = experiences.map((experience, itemIndex) =>
        itemIndex === index ? { ...experience, location: value } : experience
      );
      const res = await fetch(buildApiUrl("/api/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiences: nextExperiences }),
      });
      if (res.ok) broadcastProfileUpdated();
    }

    async function inject() {
      const payload = await loadProfile();
      const experiences = payload?.profile?.experiences || [];
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".interactive-card"))
        .filter((card) => /^Experience\s+\d+/m.test(card.textContent || ""));

      cards.forEach((card, index) => {
        if (card.querySelector(".cv-experience-location-field")) return;
        const grid = card.querySelector<HTMLElement>(".grid.gap-4.md\\:grid-cols-2");
        if (!grid) return;
        const field = makeLocationField(experiences[index]?.location || "", (value) => saveExperienceLocation(index, value));
        const startLabel = Array.from(grid.querySelectorAll("label")).find((label) =>
          /^Start$/i.test(label.textContent?.trim().split(/\s+/)[0] || "")
        );
        grid.insertBefore(field, startLabel || null);
      });
    }

    const timers = [200, 700, 1500].map((delay) => window.setTimeout(inject, delay));
    const observer = new MutationObserver(() => inject());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
    };
  }, []);

  return null;
}
