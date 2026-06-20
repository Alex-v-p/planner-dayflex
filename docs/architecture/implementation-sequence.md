# Implementation sequence

This order protects the core planning loop from becoming entangled with UI
polish or model integration. Each stage should be a separate, scoped ticket or
small ticket group.

1. **Confirm foundation choices.** Decide the first deliverable and only then
   introduce the minimum repository structure, configuration, and test tooling
   it needs.
2. **Model time and scheduling rules.** Build the pure daily scheduler with
   fixed events, tasks, interruptions, free-time output, and deterministic
   tests before services or interface work expand it.
3. **Expose and persist planning.** Add a narrow scheduler boundary and an
   application API that validates inputs and saves daily results.
4. **Deliver the basic day experience.** Let a user add events and tasks, view
   a plan, and mark work complete.
5. **Deliver recovery.** Add interruption reporting, synchronous replanning,
   and clear moved/deferred explanations.
6. **Add summaries.** Build free-time, week, and month views from stored daily
   snapshots without expanding the scheduler to cross-day planning.
7. **Add optional AI help.** Introduce a provider boundary, structured output,
   timeouts, and fallback paths only after the deterministic flow stands on its
   own.
8. **Add asynchronous and operational features.** Use workers for enrichment
   and cleanup, then add end-to-end tests, health checks, and deployment
   hardening as justified.

At every stage, prefer a complete vertical slice over empty scaffolding for the
later stages. Do not introduce a service merely because it appears in the
proposed architecture; introduce it when its boundary provides a concrete MVP
benefit.
