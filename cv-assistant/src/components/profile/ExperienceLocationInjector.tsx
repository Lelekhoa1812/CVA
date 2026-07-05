"use client";

import { useEffect, useRef } from "react";
import { buildApiUrl } from "@/lib/api";
import { broadcastProfileUpdated } from "@/lib/profile-sync";

type Experience = {
  _id?: string;
  location?: string;
  companyName?: string;
  role?: string;
  timeFrom?: string;
  timeTo?: string;
  description?: string;
  summary?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ProfilePayload = {
  profile?: {
    experiences?: Experience[];
  };
};

function isExperienceCard(card: HTMLElement) {
  return /^Experience\s+\d+/m.test(card.textContent || "");
}

function getExperienceCards() {
  return Array.from(document.querySelectorAll<HTMLElement>(".interactive-card")).filter(isExperienceCard);
}

function readVisibleLocationDrafts() {
  return getExperienceCards().map((card) => {
    const input = card.querySelector<HTMLInputElement>(".cv-experience-location-input");
    return input?.value.trim() || "";
  });
}

function makeLocationField(initialValue: string, onDraft: (value: string) => void, onSave: (value: string) => void) {
  const wrapper = document.createElement("label");
  wrapper.className = "space-y-2 cv-experience-location-field md:col-span-2";

  const header = document.createElement("div");
  header.className = "flex items-center justify-between gap-4";

  const label = document.createElement("span");
  label.className = "text-foreground text-sm font-medium";
  label.textContent = "Location";

  const hint = document.createElement("span");
  hint.className = "text-muted-foreground text-xs";
  hint.textContent = "Optional";

  const input = document.createElement("input");
  input.className = "input-premium w-full cv-experience-location-input";
  input.value = initialValue;
  input.placeholder = "";

  let lastSaved = initialValue;
  let timer: number | undefined;

  function queueSave() {
    const next = input.value.trim();
    onDraft(next);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (next === lastSaved) return;
      lastSaved = next;
      onSave(next);
    }, 650);
  }

  input.addEventListener("input", queueSave);
  input.addEventListener("blur", () => {
    window.clearTimeout(timer);
    const next = input.value.trim();
    onDraft(next);
    if (next === lastSaved) return;
    lastSaved = next;
    onSave(next);
  });

  header.append(label, hint);
  wrapper.append(header, input);
  return wrapper;
}

export default function ExperienceLocationInjector() {
  const draftsRef = useRef<Record<number, string>>({});
  const latestExperiencesRef = useRef<Experience[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const res = await fetch(buildApiUrl("/api/profile"), { cache: "no-store" });
      if (!res.ok || cancelled) return null;
      const payload = (await res.json()) as ProfilePayload;
      latestExperiencesRef.current = payload.profile?.experiences || [];
      return payload;
    }

    async function saveExperienceLocations(overrides?: Record<number, string>) {
      const payload = await loadProfile();
      const experiences = payload?.profile?.experiences;
      if (!experiences?.length) return;

      const visibleDrafts = readVisibleLocationDrafts();
      const mergedDrafts = {
        ...draftsRef.current,
        ...Object.fromEntries(visibleDrafts.map((value, index) => [index, value])),
        ...(overrides || {}),
      };
      draftsRef.current = mergedDrafts;

      const nextExperiences = experiences.map((experience, index) => {
        if (!Object.prototype.hasOwnProperty.call(mergedDrafts, index)) return experience;
        return { ...experience, location: mergedDrafts[index] || "" };
      });

      const res = await fetch(buildApiUrl("/api/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiences: nextExperiences }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as ProfilePayload | null;
        latestExperiencesRef.current = data?.profile?.experiences || nextExperiences;
        broadcastProfileUpdated();
      }
    }

    function saveSingleLocation(index: number, value: string) {
      draftsRef.current = { ...draftsRef.current, [index]: value };
      void saveExperienceLocations({ [index]: value });
    }

    async function inject() {
      const payload = await loadProfile();
      const experiences = payload?.profile?.experiences || latestExperiencesRef.current;
      const cards = getExperienceCards();

      cards.forEach((card, index) => {
        const existingInput = card.querySelector<HTMLInputElement>(".cv-experience-location-input");
        if (existingInput) {
          if (!document.activeElement || document.activeElement !== existingInput) {
            existingInput.value = draftsRef.current[index] ?? experiences[index]?.location ?? "";
          }
          return;
        }

        const grid = card.querySelector<HTMLElement>(".grid.gap-4.md\\:grid-cols-2");
        if (!grid) return;
        const field = makeLocationField(
          draftsRef.current[index] ?? experiences[index]?.location ?? "",
          (value) => {
            draftsRef.current = { ...draftsRef.current, [index]: value };
          },
          (value) => saveSingleLocation(index, value),
        );
        const startLabel = Array.from(grid.querySelectorAll("label")).find((label) =>
          /^Start$/i.test(label.textContent?.trim().split(/\s+/)[0] || ""),
        );
        grid.insertBefore(field, startLabel || null);
      });
    }

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      if (!/save profile/i.test(button.textContent || "")) return;
      draftsRef.current = {
        ...draftsRef.current,
        ...Object.fromEntries(readVisibleLocationDrafts().map((value, index) => [index, value])),
      };
      window.setTimeout(() => void saveExperienceLocations(), 900);
    }

    const timers = [200, 700, 1500].map((delay) => window.setTimeout(inject, delay));
    const observer = new MutationObserver(() => inject());
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, []);

  return null;
}
