# Investigation decisions and manual evidence

Status: adopted product contract, 2026-09-21. Implementation is in progress; these actions are not yet available in the released app. The [runtime guide](../v2/README.md) owns implemented behavior and the private delivery plan owns acceptance.

Users must be able to decide what happens to an unresolved item inside Prism. Start with held-security valuation gaps. Keep investigation progress separate from the [financial coverage contract](exposure-coverage-contract.md).

## Three user actions

| Action | Result | Financial meaning |
| --- | --- | --- |
| **Investigate** | Keep or reopen the gap for further work. This is the default. Show the missing evidence and next action. | Existing supported values remain usable; missing value remains unknown. |
| **Exclude from investigation** | Save a reversible decision, timestamp and optional reason. Stop further investigation and gap-specific quote retries for this position. | Keep the holding, historical records and visible valuation gap. Do not substitute zero or imply completeness. |
| **Provide manual data** | Save a dated note or compatible per-unit price with a source/reason. Show whether the price is active and why. | Notes alone do not change figures. An admitted manual price can fill a missing valuation, with explicit provenance. |

Investigation disposition and price evidence are separate facts. A user can reopen an excluded item or revoke a manual price. A later broker price can resolve the valuation without erasing the user's disposition or manual evidence. Investigation counts and manual-price counts must not be added into a financial completion score.

Decisions are scoped to the connection, account and security. Exclusion does not disable normal holdings sync or suppress another account's investigation of the same security. A shared provider response may still contain the excluded security; any compatible observation can be retained without treating the exclusion as a deletion request.

## First manual financial input

Accept an exact decimal **price per security unit**, currency, valuation date/time and source/reason. Bind it to the held connection/account/security and its current quantity-continuity boundary. Reject missing, malformed, future-dated or incompatible inputs. Average purchase cost is not a current price. This increment does not accept manual quantities, transactions, cost bases or company identities.

Initially support confirmed stocks and funds whose unit and currency are corroborated by retained instrument/listing metadata. An inactive listing may corroborate currency and units; it does not supply a current market price. Manual entry must not bypass unsupported crypto units, identity checks or currency compatibility.

Core selects a manual price only when no eligible broker valuation exists. A compatible broker price takes precedence. The manual timestamp must be on or after the current quantity-continuity boundary and no later than now. A quantity change or uncertain continuity can make an entry inactive; keep it and explain the reason. Existing freshness policy still applies: an older eligible price remains dated and visibly stale, never described as current or broker-verified. Do not add a second currency conversion.

Use every admitted manual value immediately in valuation, compatible exposure and relevant views. Label its manual origin in portfolio, security, coverage and contribution evidence. A manually valued position can become priced; that does not prove company identity, ETF economics or broker reconciliation.

## Persistence and ownership

Core owns validated commands, decisions, manual evidence, selection and financial accounting. Broker extensions continue to submit observations. Registered views expose the actions and consume shared results. This needs a narrow application boundary, not a general workflow engine.

Append decision and manual-evidence revisions, including revocation. Preserve original broker observations. New checkpoints pin the selected manual evidence and calculation policy; existing checkpoints must replay unchanged. Reopening, replacing or revoking an entry recalculates current results and preserves earlier history. Investigation disposition changes alone must not manufacture financial changes or returns.

Private user decisions belong in the local database, not public source code or synthetic fixtures. The feature must not hardcode a particular user's unresolvable holding.

## Acceptance

- Open → excluded → reopened survives restart. The financial gap remains visible throughout exclusion, and scoped retry behavior follows the saved decision.
- An eligible manual price reaches calculation, persistence and visible results in one journey. Independent decimal arithmetic agrees with the result. Revoke and replace preserve history and update current selection.
- Broker precedence, changed quantities, stale evidence, invalid units/currencies/dates/decimals and account isolation have explicit checks. The UI explains inactive evidence.
- A migration uses a consistent backup and copied-data acceptance. Existing checkpoints replay unchanged before and after reopen; new checkpoints reproduce their pinned manual inputs.
- Gap actions work with keyboard and narrow screens. State is readable without color. Unknown valuation remains prominent even when the user has stopped investigation.

The same interaction can later cover other data gaps. Manual ETF compositions, company relationships and swap economics require their own evidence contracts; this increment does not admit them through a generic override.
