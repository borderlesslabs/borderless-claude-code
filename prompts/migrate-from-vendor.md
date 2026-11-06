# Prompt: migrate from another vendor to Borderless

Copy the prompt below into a Claude Code session running in your project. This works best after `/borderless-install-into` — the skills give the model accurate Borderless context for the mapping.

---

I'm migrating from **{Bridge direct / Circle / Fern / Conduit / Alchemy Pay / Checkout.com / another FX provider}** to Borderless. My current integration is in this repo. I need you to:

1. **Map my current abstractions to Borderless concepts.** Produce a table:

   | My concept | My code location | Borderless equivalent | Notes |
   |---|---|---|---|
   | (e.g., `User.kyc_status`) | `app/models/user.rb:42` | Identity + compliance check per corridor | One-to-many: a single user now has N compliance checks, one per `{PFI, country, asset, fiat, paymentMethod}` combo. |

   Cover: identity / KYC, wallet / account, payout destination (payment instruction), onramp / offramp, webhook events, reconciliation keys.

2. **Flag behavioral differences** that will break my current assumptions. At minimum:
   - Does my current provider use a single global KYC per user? Borderless's compliance is per-corridor — walk through what this means for my UX.
   - Does my current provider custody stablecoins? Borderless is **never** in the flow of funds; funds move client ↔ PFI directly. What does this mean for my onchain infrastructure?
   - Does my current provider send webhooks with a different signature scheme (HMAC, Stripe-style)? Borderless uses RSA-SHA256 over raw bytes. Plan the handler rewrite.
   - Does my current provider quote firm prices? Borderless quotes are estimates — my settlement path needs to read the actual transaction record, not the quote.
   - Does my current provider accept amounts as integers / cents? Borderless uses decimal strings in natural units. Audit my amount handling.
   - Does my current provider have a single wallet per user? Borderless accounts can use Fireblocks / Utila / Dfns / Standalone / etc. — reconcile with my current wallet provider.

3. **List the database migrations I'll need.** Include the Borderless fields my schema currently doesn't have (`complianceSlug`, `paymentInstructionId`, `reference`, persisted `idempotency-key`, webhook `event_id` unique constraint).

4. **Suggest a cutover plan.** Typical sequence:
   - Stand up Borderless sandbox integration in parallel.
   - Shadow-run: mirror each new operation through both providers, compare outcomes.
   - Migrate new users first, existing users second (KYC may need to be re-run — check what the new PFI accepts).
   - Decommission the old provider once shadow-run shows clean agreement.

   Flag anything about my current setup that would make one of these steps harder than usual.

## Rules

- When in doubt about Borderless API shape or semantics, fetch the relevant `.md` page from `docs.borderless.xyz` rather than guessing. The skills under `.claude/skills/` have the auth, compliance, deposit, withdrawal, and webhook flows documented.
- Do not guess at **my** current provider's behavior. If you don't know how {my vendor} does X, say so and ask.
- Do not start writing migration code in this pass. This prompt is scoping only.
