// Built-in example documents for one-click demos.
//
// Both are original teaching texts written for this tool (no course
// materials). The office memo shows well-formed CREAC; the exam answer is
// deliberately flawed so every warning badge appears: a complete IRAC
// paragraph, a missing rule, a rule/application blend, and application
// before rule. test/examples.test.mjs pins the expected badges.

export const EXAMPLES = {
  memo: {
    label: "Office memo — negligence (well-formed CREAC)",
    text: `This memo evaluates Crestview Market's negligence exposure arising from Maria Reyes's fall in the produce aisle. The short answer is that Crestview likely is liable.

Crestview is likely liable for negligence because it failed to clean up the spill. A business owes its customers a duty to keep the premises reasonably safe and to address hazards it knows about or should discover. In Ortega v. Kmart Corp., 26 Cal. 4th 1200 (2001), the court held that a jury may infer notice where a spill remained on the floor long enough that employees should have discovered it. Here, the spill sat in the produce aisle for at least forty minutes while two employees walked past it, and Crestview ignored a customer who reported the puddle at the service desk. Accordingly, Crestview is likely liable for negligence.

Crestview's negligence also likely caused Reyes's injuries. Negligence requires actual and proximate causation: the harm must be a reasonably foreseeable result of the breach. In Palsgraf v. Long Island R.R., 248 N.Y. 339 (1928), the court reasoned that liability extends only to plaintiffs within the zone of foreseeable danger. Here, a customer slipping on an unmarked spill is precisely the kind of harm a grocery store should anticipate. Therefore, causation is unlikely to be seriously contested.`,
  },

  exam: {
    label: "Exam answer — contracts (deliberately flawed IRAC)",
    text: `The issue is whether Vega and Brill formed an enforceable contract. A valid contract requires offer, acceptance, and consideration. Here, Vega offered to sell the food truck for $40,000, and Brill accepted in writing the next morning. Therefore, a court would likely find a contract was formed.

The next question is whether the statute of frauds blocks enforcement. Here, the parties never signed a single document containing all of the material terms. Brill texted Vega that the deal was locked in, but the text did not mention the price or the closing date. Therefore, the statute of frauds likely bars the claim.

The issue is whether Brill's two-week delay was a material breach. A party must perform within a reasonable time, and here Brill tendered payment two weeks after the closing date in the contract. Therefore, Brill likely breached, but the breach may not justify rescission.

Pruitt argues the liquidated damages clause is an unenforceable penalty. Here, the clause fixes damages at $500 per day of delay regardless of actual harm. Liquidated damages are enforceable only if actual damages are difficult to estimate and the amount is a reasonable forecast. The clause is probably a penalty, so Pruitt has a strong defense.`,
  },
};
