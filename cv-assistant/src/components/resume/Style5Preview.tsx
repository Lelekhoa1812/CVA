export default function Style5Preview() {
  return (
    <div className="h-[34rem] w-full overflow-hidden bg-[#f7f8fb] text-slate-900">
      <div className="h-3 w-full bg-[linear-gradient(90deg,#18346b_0%,#355da7_48%,#d9e4fb_100%)]" />
      <div className="px-6 py-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#24498c]">Resume ledger</div>
        <div className="mt-2 flex items-start justify-between gap-5">
          <div>
            <div className="font-display text-[2rem] font-semibold tracking-[-0.03em] text-[#14284f]">Alex Candidate</div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Product-minded engineer | Clear systems thinker | Portfolio-led presentation
            </div>
          </div>
          <div className="w-40 border border-slate-200 bg-white px-3 py-2 text-right text-[10px] leading-5 text-slate-600 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div>alex@portfolio.dev</div>
            <div>linkedin.com/in/alexcandidate</div>
            <div>alexcandidate.dev</div>
          </div>
        </div>

        <div className="mt-5 border border-[#d9e4fb] bg-[#ecf2ff] px-4 py-3 shadow-[0_10px_30px_rgba(36,73,140,0.08)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#1d4488]">Capabilities</div>
          <div className="mt-2 text-[11px] leading-6 text-slate-700">
            Product strategy • Full-stack delivery • Systems design • TypeScript • AI workflows • Design collaboration
          </div>
          <div className="text-[11px] leading-6 text-slate-700">
            Research synthesis • Stakeholder communication • Performance tuning • Resume storytelling
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_9rem] gap-5">
          <div className="space-y-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#14284f]">Experience</div>
              <div className="mt-2 h-px w-full bg-[#3059a34d]" />
            </div>

            {[
              {
                badge: "2023 to now",
                title: "Lead Product Engineer — Studio Systems",
                lines: [
                  "Reframed the platform around outcome-led workflows and raised delivery quality across design and engineering.",
                  "Built dependable internal tooling with clearer operating rhythms, tighter collaboration, and stronger narrative polish."
                ],
              },
              {
                badge: "2021 to 2023",
                title: "Senior Engineer — Growth Platforms",
                lines: [
                  "Led visible cross-functional launches with balanced technical depth and presentation quality.",
                  "Turned dense initiatives into recruiter-readable stories without flattening the substance."
                ],
              },
            ].map((item) => (
              <div key={item.title} className="grid grid-cols-[4.3rem_1fr] gap-4">
                <div className="border border-[#d9e4fb] bg-[#eef4ff] px-2 py-3 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-[#24498c]">
                  {item.badge}
                </div>
                <div className="border-b border-slate-200 pb-4">
                  <div className="text-[13px] font-semibold text-slate-900">{item.title}</div>
                  <div className="mt-2 space-y-2 text-[11px] leading-5 text-slate-600">
                    {item.lines.map((line) => (
                      <div key={line} className="flex gap-2">
                        <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-[#2c56a1]" />
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#14284f]">Projects</div>
              <div className="mt-2 h-px w-full bg-[#3059a34d]" />
            </div>

            <div className="grid grid-cols-[4.3rem_1fr] gap-4">
              <div className="border border-[#d9e4fb] bg-[#eef4ff] px-2 py-3 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-[#24498c]">
                Project
              </div>
              <div className="border-b border-slate-200 pb-4">
                <div className="text-[13px] font-semibold text-slate-900">Narrative Resume Studio</div>
                <div className="mt-2 text-[11px] leading-5 text-slate-600">
                  A ledger-inspired resume system that balances premium presentation with stable PDF structure.
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                title: "Education",
                lines: ["M.S. Human-Centered Computing", "University of Melbourne", "2019 - 2021"],
              },
              {
                title: "Links",
                lines: ["Portfolio available", "Case studies included", "References on request"],
              },
              {
                title: "Languages",
                lines: ["English • Vietnamese • Japanese"],
              },
            ].map((panel) => (
              <div
                key={panel.title}
                className="border border-slate-200 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
              >
                <div className="mb-2 h-1 w-full bg-[#24498c]" />
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#18346b]">{panel.title}</div>
                <div className="mt-2 space-y-1.5 text-[10px] leading-5 text-slate-600">
                  {panel.lines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
