CREATE INDEX IF NOT EXISTS idx_candidates_tenant_active_created
  ON candidates (tenant_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scores_candidate_role_overall
  ON scores (candidate_id, role_id, overall_score DESC);

CREATE INDEX IF NOT EXISTS idx_scores_tenant_status
  ON scores (tenant_id, score_status);
