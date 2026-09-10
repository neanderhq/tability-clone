"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";

type TemplateCategory = "Company" | "Product" | "Sales" | "Marketing" | "Customer Success" | "People";

type OkrTemplate = {
  id: string;
  title: string;
  category: TemplateCategory;
  team: string;
  description: string;
  objective: string;
  keyResults: string[];
};

type AiOkrSuggestion = OkrTemplate & {
  rationale: string;
};

type SuggestionPattern = {
  objective: string;
  keyResults: string[];
  rationale: string;
};

const okrTemplates: OkrTemplate[] = [
  {
    id: "company-growth",
    title: "Company Growth",
    category: "Company",
    team: "Executive",
    description: "Set a broad company goal around durable revenue and customer growth.",
    objective: "Build a predictable growth engine for the next quarter",
    keyResults: [
      "Increase qualified pipeline by 30%",
      "Grow net revenue retention to 115%",
      "Launch weekly executive metric reviews with every team lead",
    ],
  },
  {
    id: "product-activation",
    title: "Product Activation",
    category: "Product",
    team: "Product",
    description: "Help new users reach value faster and reduce early drop-off.",
    objective: "Improve new-user activation across the core product journey",
    keyResults: [
      "Raise activation rate from 42% to 58%",
      "Reduce median time to first successful workflow to under 10 minutes",
      "Ship three onboarding experiments with measured adoption impact",
    ],
  },
  {
    id: "sales-pipeline",
    title: "Sales Pipeline",
    category: "Sales",
    team: "Sales",
    description: "Create stronger pipeline coverage and cleaner deal execution.",
    objective: "Increase sales pipeline quality and conversion predictability",
    keyResults: [
      "Create 4x pipeline coverage for next quarter target",
      "Improve opportunity-to-close conversion from 22% to 30%",
      "Reduce stale opportunities older than 45 days by 50%",
    ],
  },
  {
    id: "marketing-demand",
    title: "Demand Generation",
    category: "Marketing",
    team: "Marketing",
    description: "Build a repeatable campaign motion that brings in qualified demand.",
    objective: "Generate high-intent demand from priority customer segments",
    keyResults: [
      "Deliver 1,200 marketing-qualified leads from target accounts",
      "Increase landing page conversion from 6% to 9%",
      "Publish four customer proof assets tied to active campaigns",
    ],
  },
  {
    id: "customer-retention",
    title: "Customer Retention",
    category: "Customer Success",
    team: "Customer Success",
    description: "Focus the success team on retention, adoption, and account health.",
    objective: "Improve customer retention through stronger account engagement",
    keyResults: [
      "Reduce logo churn from 4.5% to 3%",
      "Increase monthly active teams in strategic accounts by 20%",
      "Complete success plans for the top 25 renewal-risk customers",
    ],
  },
  {
    id: "people-engagement",
    title: "Team Engagement",
    category: "People",
    team: "People",
    description: "Give managers a practical goal for improving employee experience.",
    objective: "Strengthen team engagement and manager effectiveness",
    keyResults: [
      "Raise engagement survey participation to 90%",
      "Improve manager effectiveness score from 7.4 to 8.2",
      "Complete growth conversations for 100% of team members",
    ],
  },
];

const setupSteps = [
  "Name the workspace",
  "Choose a starter template",
  "Invite teammates",
  "Start weekly check-ins",
];

const suggestionPatterns: Record<TemplateCategory, SuggestionPattern[]> = {
  Company: [
    {
      objective: "Create a durable operating rhythm for profitable growth",
      keyResults: [
        "Grow qualified pipeline coverage to 4x next-quarter target",
        "Improve gross revenue retention to 92%",
        "Complete weekly business reviews with owners for every priority metric",
      ],
      rationale: "Balances revenue growth with the management cadence needed to sustain it.",
    },
    {
      objective: "Improve company-wide execution on the highest priority bets",
      keyResults: [
        "Ship 90% of committed quarterly initiatives on time",
        "Reduce priority project blockers older than 14 days by 60%",
        "Reach 80% team confidence across active company OKRs",
      ],
      rationale: "Turns the company OKR into a measurable execution target.",
    },
    {
      objective: "Increase customer value while keeping expansion predictable",
      keyResults: [
        "Raise product-qualified expansion pipeline by 25%",
        "Increase strategic account adoption of core workflows by 20%",
        "Publish a renewal and expansion forecast with under 10% variance",
      ],
      rationale: "Connects customer outcomes to expansion and forecasting discipline.",
    },
  ],
  Product: [
    {
      objective: "Help new users reach first value faster",
      keyResults: [
        "Raise activation rate from 42% to 58%",
        "Reduce median setup time to under 10 minutes",
        "Ship three onboarding experiments with measured lift",
      ],
      rationale: "Focuses the product team on a clear activation outcome.",
    },
    {
      objective: "Improve retention by making core workflows easier to complete",
      keyResults: [
        "Increase week-four retained teams by 15%",
        "Reduce failed setup attempts by 30%",
        "Resolve the top five usability blockers reported by new accounts",
      ],
      rationale: "Moves beyond activation into sustained product usage.",
    },
    {
      objective: "Build a stronger feedback loop for product decisions",
      keyResults: [
        "Interview 20 recently activated and churn-risk users",
        "Tag 90% of roadmap items to customer evidence",
        "Launch a monthly product health review with support and success",
      ],
      rationale: "Improves product prioritization before the next planning cycle.",
    },
  ],
  Sales: [
    {
      objective: "Improve pipeline quality and close predictability",
      keyResults: [
        "Create 4x qualified pipeline coverage for next-quarter target",
        "Improve opportunity-to-close conversion from 22% to 30%",
        "Reduce stale opportunities older than 45 days by 50%",
      ],
      rationale: "Keeps the sales OKR tied to both volume and quality.",
    },
    {
      objective: "Increase win rates in the highest-fit customer segment",
      keyResults: [
        "Raise win rate for target accounts by 8 percentage points",
        "Complete mutual action plans for 80% of late-stage deals",
        "Reduce average sales cycle length by 12%",
      ],
      rationale: "Focuses the team on deals most likely to convert.",
    },
    {
      objective: "Strengthen sales execution through cleaner handoffs",
      keyResults: [
        "Document next steps on 95% of active opportunities",
        "Hold weekly pipeline inspection for every sales pod",
        "Cut forecast variance to under 10%",
      ],
      rationale: "Improves sales process quality without adding more pipeline pressure.",
    },
  ],
  Marketing: [
    {
      objective: "Generate high-intent demand from priority segments",
      keyResults: [
        "Deliver 1,200 marketing-qualified leads from target accounts",
        "Increase landing page conversion from 6% to 9%",
        "Publish four proof assets tied to active campaigns",
      ],
      rationale: "Keeps demand generation measurable and segment-specific.",
    },
    {
      objective: "Improve campaign quality from first touch to sales handoff",
      keyResults: [
        "Increase MQL-to-opportunity conversion by 20%",
        "Launch three segment campaigns with sales-approved messaging",
        "Reduce unqualified lead volume by 25%",
      ],
      rationale: "Prioritizes lead quality over raw lead count.",
    },
    {
      objective: "Build a repeatable content engine for pipeline creation",
      keyResults: [
        "Publish six customer-led assets for priority use cases",
        "Generate 30 influenced opportunities from new content",
        "Reach 12% conversion on campaign follow-up sequences",
      ],
      rationale: "Connects content output to pipeline impact.",
    },
  ],
  "Customer Success": [
    {
      objective: "Improve retention through stronger account engagement",
      keyResults: [
        "Reduce logo churn from 4.5% to 3%",
        "Increase monthly active teams in strategic accounts by 20%",
        "Complete success plans for the top 25 renewal-risk customers",
      ],
      rationale: "Targets the renewal risk that matters most to the business.",
    },
    {
      objective: "Increase adoption depth across strategic accounts",
      keyResults: [
        "Grow multi-team adoption in strategic accounts by 18%",
        "Complete executive business reviews for 90% of top-tier customers",
        "Resolve 80% of health-score risks within 30 days",
      ],
      rationale: "Turns customer health into concrete adoption work.",
    },
    {
      objective: "Create a proactive renewal motion for at-risk customers",
      keyResults: [
        "Identify renewal risks 120 days before contract end for 95% of accounts",
        "Launch recovery plans for every high-risk strategic account",
        "Improve renewal forecast accuracy to within 8%",
      ],
      rationale: "Makes retention work earlier and easier to manage.",
    },
  ],
  People: [
    {
      objective: "Strengthen team engagement and manager effectiveness",
      keyResults: [
        "Raise engagement survey participation to 90%",
        "Improve manager effectiveness score from 7.4 to 8.2",
        "Complete growth conversations for 100% of team members",
      ],
      rationale: "Keeps people work tied to measurable management habits.",
    },
    {
      objective: "Improve team clarity and follow-through on priorities",
      keyResults: [
        "Reach 85% favorable score on role clarity",
        "Complete quarterly goal reviews for every team",
        "Reduce overdue people initiatives by 50%",
      ],
      rationale: "Connects engagement to clarity and execution.",
    },
    {
      objective: "Build a stronger development culture for managers and teams",
      keyResults: [
        "Train 100% of managers on coaching and feedback routines",
        "Launch development plans for 90% of employees",
        "Improve internal mobility participation by 20%",
      ],
      rationale: "Turns engagement into a practical growth system.",
    },
  ],
};

function buildAiOkrSuggestions(
  workspaceName: string,
  template: OkrTemplate,
): AiOkrSuggestion[] {
  const workspace = workspaceName.trim() || template.team;

  return suggestionPatterns[template.category].map((pattern, index) => ({
    id: `ai-${template.id}-${index + 1}`,
    title: `${workspace} AI draft ${index + 1}`,
    category: template.category,
    team: template.team,
    description:
      index === 0
        ? template.description
        : `Suggested ${template.category.toLowerCase()} OKR for ${workspace}.`,
    objective: pattern.objective,
    keyResults: pattern.keyResults,
    rationale: pattern.rationale,
  }));
}

export default function OnboardingPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [workspaceName, setWorkspaceName] = useState("Acme Growth");
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    okrTemplates[0].id,
  );
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(
    null,
  );

  const selectedTemplate = useMemo(
    () =>
      okrTemplates.find((template) => template.id === selectedTemplateId) ??
      okrTemplates[0],
    [selectedTemplateId],
  );
  const aiSuggestions = useMemo(
    () => buildAiOkrSuggestions(workspaceName, selectedTemplate),
    [workspaceName, selectedTemplate],
  );
  const selectedSuggestion = useMemo(
    () =>
      aiSuggestions.find((suggestion) => suggestion.id === selectedSuggestionId) ??
      null,
    [aiSuggestions, selectedSuggestionId],
  );
  const activeOkr = selectedSuggestion ?? selectedTemplate;

  function selectTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    setSelectedSuggestionId(null);
  }

  function applySuggestion(suggestionId: string) {
    setSelectedSuggestionId(suggestionId);
    setAiModalOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {session?.user?.email ?? "Workspace setup"}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">
                Onboarding
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!session?.user && sessionStatus !== "loading" ? (
                <button
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  type="button"
                  onClick={() => signIn()}
                >
                  Sign in
                </button>
              ) : null}
              <Link
                className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                href="/dashboard"
              >
                Finish setup
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto grid max-w-7xl gap-6 px-5 pb-24 pt-6 lg:pb-6 xl:grid-cols-[340px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-primary">Workspace</p>
              <h2 className="mt-1 text-lg font-semibold tracking-normal">
                Set up the first OKR cycle
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Pick a practical template to give the workspace a first objective and clear key results.
              </p>

              <label className="mt-5 grid gap-2">
                <span className="text-sm font-medium">Workspace name</span>
                <input
                  className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                />
              </label>
            </section>

            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold tracking-normal">
                Setup steps
              </h2>
              <ol className="mt-5 space-y-4">
                {setupSteps.map((step, index) => (
                  <li className="flex gap-3" key={step}>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{step}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {index === 0
                          ? workspaceName || "Your workspace"
                          : index === 1
                            ? activeOkr.title
                            : index === 2
                              ? "Bring owners into the plan"
                              : "Keep progress fresh every week"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </aside>

          <section className="min-w-0 space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
                <p className="text-sm text-muted-foreground">Selected template</p>
                <p className="mt-2 text-2xl font-semibold">
                  {activeOkr.category}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeOkr.team} team
                </p>
              </section>
              <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
                <p className="text-sm text-muted-foreground">Starter OKRs</p>
                <p className="mt-2 text-2xl font-semibold">
                  {okrTemplates.length}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ready-to-use examples
                </p>
              </section>
              <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
                <p className="text-sm text-muted-foreground">Check-in rhythm</p>
                <p className="mt-2 text-2xl font-semibold">Weekly</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Matches the dashboard reminders
                </p>
              </section>
            </div>

            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-medium text-primary">
                    OKR template library
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-normal">
                    Choose a starting point
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {activeOkr.title} selected
                </p>
                <button
                  className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  type="button"
                  onClick={() => setAiModalOpen(true)}
                >
                  Draft 3 AI OKRs
                </button>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {okrTemplates.map((template) => {
                  const isSelected = template.id === selectedTemplate.id;

                  return (
                    <button
                      className={`rounded-lg border p-4 text-left shadow-sm transition ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border bg-white hover:border-primary/60 hover:bg-muted/40"
                      }`}
                      key={template.id}
                      type="button"
                      onClick={() => selectTemplate(template.id)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold">
                            {template.title}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {template.description}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {template.category}
                        </span>
                      </div>

                      <div className="mt-4 rounded-md border border-border bg-background p-3">
                        <p className="text-sm font-semibold">
                          {template.objective}
                        </p>
                        <ul className="mt-3 space-y-2">
                          {template.keyResults.map((keyResult) => (
                            <li
                              className="flex gap-2 text-sm leading-5 text-muted-foreground"
                              key={keyResult}
                            >
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                              <span>{keyResult}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-sm font-medium text-primary">
                    Workspace preview
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-normal">
                    {workspaceName || "Your workspace"} starts with a{" "}
                    {activeOkr.category.toLowerCase()} OKR
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    This preview shows what the first objective can look like before owners begin weekly check-ins.
                  </p>
                </div>
                <Link
                  className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  href="/objectives"
                >
                  View objectives
                </Link>
              </div>

              <div className="mt-5 rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    On track
                  </span>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
                    {activeOkr.team}
                  </span>
                  {selectedSuggestion ? (
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
                      AI draft
                    </span>
                  ) : null}
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-border">
                    Public
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-normal">
                  {activeOkr.objective}
                </h3>
                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  {activeOkr.keyResults.map((keyResult, index) => (
                    <div
                      className="rounded-md border border-border bg-white p-4"
                      key={keyResult}
                    >
                      <p className="text-xs font-semibold text-muted-foreground">
                        Key result {index + 1}
                      </p>
                      <p className="mt-2 text-sm font-medium leading-5">
                        {keyResult}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </section>
        </main>
      </div>

      {aiModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-border bg-white p-6 shadow-xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium text-primary">
                  AI OKR drafts
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-normal">
                  Suggestions for {workspaceName || selectedTemplate.team}
                </h2>
              </div>
              <button
                className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                type="button"
                onClick={() => setAiModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {aiSuggestions.map((suggestion) => {
                const isActive = suggestion.id === selectedSuggestionId;

                return (
                  <article
                    className={`rounded-lg border p-4 shadow-sm ${
                      isActive
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border bg-white"
                    }`}
                    key={suggestion.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {suggestion.category}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {suggestion.team}
                      </span>
                    </div>
                    <h3 className="mt-4 text-base font-semibold leading-6 tracking-normal">
                      {suggestion.objective}
                    </h3>
                    <p className="mt-3 text-sm leading-5 text-muted-foreground">
                      {suggestion.rationale}
                    </p>
                    <ul className="mt-4 space-y-2">
                      {suggestion.keyResults.map((keyResult) => (
                        <li
                          className="flex gap-2 text-sm leading-5 text-slate-700"
                          key={keyResult}
                        >
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{keyResult}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      className="mt-5 w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                      type="button"
                      onClick={() => applySuggestion(suggestion.id)}
                    >
                      Use this OKR
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
