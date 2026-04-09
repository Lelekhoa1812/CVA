"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import GlassPanel from "@/components/ui/GlassPanel";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion/Reveal";

const pillars = [
  {
    title: "Profile Intelligence",
    body: "Shape a richer candidate narrative with cleaner profile signals, stronger project framing, and sharper contact credibility.",
  },
  {
    title: "Resume Direction",
    body: "Select evidence with intent, preview premium layouts, and tune styling choices before generating a polished final PDF.",
  },
  {
    title: "Letter Conversion",
    body: "Pair job requirements with proof from your experience so your cover letter reads like conviction, not filler.",
  },
];

const stats = [
  { value: "3", label: "Core Modules" },
  { value: "4", label: "Resume Directions" },
  { value: "1", label: "Premium Workflow" },
];

export default function Home() {
  return (
    <div className="page-shell space-y-8 pb-16">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <Reveal>
          <GlassPanel strong className="hero-card p-8 sm:p-12">
            <div className="halo-ring" />
            <div className="relative space-y-8">
              <div className="space-y-4">
                <p className="section-kicker">Premium Career Workflow</p>
                <h1 className="hero-title font-display text-balance text-5xl leading-[0.95] sm:text-6xl xl:text-7xl">
                  Build a portfolio-quality application story.
                </h1>
                <p className="hero-copy max-w-3xl text-base leading-8 sm:text-lg">
                  CV Assistant now feels less like a form filler and more like a high-end
                  career studio: profile strategy, premium resume direction, and cover letter
                  generation in one polished experience.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <motion.div whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Link href="/profile" className="button-primary w-full sm:w-auto">
                    Shape Your Profile
                  </Link>
                </motion.div>
                <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }}>
                  <Link href="/resume" className="button-secondary w-full sm:w-auto">
                    Explore Resume Lab
                  </Link>
                </motion.div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="surface-subtle rounded-[1.25rem] px-4 py-4"
                  >
                    <div className="text-foreground text-2xl font-semibold">{stat.value}</div>
                    <div className="text-muted-foreground mt-1 text-xs uppercase tracking-[0.22em]">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </GlassPanel>
        </Reveal>

        <Reveal delay={0.08}>
          <GlassPanel className="relative overflow-hidden p-6">
            <div className="absolute inset-0 bg-grid-fade opacity-35" />
            <div className="relative space-y-5">
              <p className="section-kicker">What Changes</p>
              <h2 className="hero-title font-display text-3xl">A better first impression.</h2>
              <div className="hero-copy space-y-4 text-sm leading-7">
                <p>
                  The redesign centers on dark editorial surfaces, stronger hierarchy, cleaner
                  selection flows, and previews that feel deliberate instead of utilitarian.
                </p>
                <p>
                  Every module now demonstrates premium UX patterns: glass surfaces, Bento
                  composition, contextual actions, and motion that feels cinematic but restrained.
                </p>
              </div>
              <Link href="/generate" className="metric-chip">
                High-conviction cover letters
              </Link>
            </div>
          </GlassPanel>
        </Reveal>
      </section>

      <StaggerGroup className="bento-grid">
        {pillars.map((pillar, index) => (
          <StaggerItem
            key={pillar.title}
            className={index === 0 ? "xl:col-span-5" : index === 1 ? "xl:col-span-3" : "xl:col-span-4"}
          >
            <GlassPanel className="interactive-card h-full p-6">
              <div className="space-y-4">
                <div className="metric-chip">{`0${index + 1}`}</div>
                <h3 className="text-foreground font-display text-2xl">{pillar.title}</h3>
                <p className="text-muted-foreground text-sm leading-7">{pillar.body}</p>
              </div>
            </GlassPanel>
          </StaggerItem>
        ))}
      </StaggerGroup>

      <Reveal delay={0.12}>
        <GlassPanel className="overflow-hidden p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div className="space-y-4">
              <p className="section-kicker">Conversion Sequence</p>
              <h2 className="hero-title font-display text-4xl">Move from raw information to persuasive narrative.</h2>
              <p className="hero-copy max-w-2xl text-sm leading-7 sm:text-base">
                Start by tightening your profile, pull only the evidence that supports the role,
                and finish with a cover letter that sounds specific to the opportunity.
              </p>
            </div>
            <div className="space-y-3">
              {["Profile foundation", "Resume evidence selection", "Cover letter articulation"].map((step) => (
                <div key={step} className="surface-subtle flex items-center gap-3 rounded-2xl px-4 py-3">
                  <span className="status-dot" />
                  <span className="text-foreground text-sm">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassPanel>
      </Reveal>
    </div>
  );
}
