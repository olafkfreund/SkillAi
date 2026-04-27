/**
 * Score staleness — detects when a candidate's score is outdated relative to
 * the current state of the role's manager priority keywords.
 *
 * Per Epic #42: when a recruiter edits role.priorityKeywords, the role's
 * priorityKeywordsUpdatedAt timestamp is bumped. Any pre-existing score whose
 * own updatedAt is earlier than that bump is "outdated" — it was scored
 * against a different priority set.
 *
 * Per DEC-009 precedent, we DO NOT auto-rescore. Instead the UI surfaces a
 * "Priorities updated" pill on outdated scores, and the recruiter clicks to
 * trigger a rescore manually.
 */

interface ScoreLike {
  updatedAt?: Date | string | null
  createdAt?: Date | string | null
}

interface RoleLike {
  priorityKeywordsUpdatedAt?: Date | string | null
}

export function isScoreOutdatedAgainstPriorities(
  score: ScoreLike,
  role: RoleLike,
): boolean {
  if (!role.priorityKeywordsUpdatedAt) return false
  const scoreTime = score.updatedAt ?? score.createdAt
  if (!scoreTime) return false
  const scoreDate = scoreTime instanceof Date ? scoreTime : new Date(scoreTime)
  const roleDate =
    role.priorityKeywordsUpdatedAt instanceof Date
      ? role.priorityKeywordsUpdatedAt
      : new Date(role.priorityKeywordsUpdatedAt)
  return scoreDate.getTime() < roleDate.getTime()
}
