import React from 'react'
export function ExploreView() {
  return (
    <section className="panel unavailable-view">
      <p className="eyebrow">RELATIONSHIPS, NOT GUESSES</p>
      <h2>Company exploration is not admitted yet</h2>
      <p>
        Explore will become useful when source securities have qualified canonical company
        relationships. Name-only, ticker-only and first-match joins are excluded from the result.
      </p>
      <p className="notice">
        Use Development to inspect the exact held fund rows, their identifiers and the evidence
        gates that still block company-level aggregation.
      </p>
    </section>
  )
}
