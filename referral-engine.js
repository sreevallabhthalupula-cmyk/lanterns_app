/**
 * referral-engine.js — grade -> actionable follow-up interval (Section 4).
 *
 * Pure rule-based JS on top of the existing grade output, no model
 * change. Standard DR follow-up intervals:
 *   Grade 0-1 -> re-screen 12 months
 *   Grade 2-3 -> refer within 4 weeks
 *   Grade 4   -> urgent referral within 1 week
 *
 * urgencyRank also doubles as the reviewer-queue sort key (Section 4:
 * "Reviewer queue sorted by urgency") so the two features share one
 * source of truth instead of two divergent grade->priority mappings.
 */

function getReferralInterval(grade) {
  if (grade <= 1) {
    return { interval: 'Re-screen in 12 months', urgencyRank: 0 };
  }
  if (grade === 2 || grade === 3) {
    return { interval: 'Refer within 4 weeks', urgencyRank: 1 };
  }
  return { interval: 'Urgent referral within 1 week', urgencyRank: 2 };
}

if (typeof window !== 'undefined') {
  window.getReferralInterval = getReferralInterval;
}
