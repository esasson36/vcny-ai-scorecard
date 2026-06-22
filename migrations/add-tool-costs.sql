-- Run in the Supabase SQL Editor to enable the Cost / ROI view.
-- Stores the monthly license cost VCNY pays for each AI tool.

CREATE TABLE IF NOT EXISTS tool_costs (
  tool text PRIMARY KEY,
  monthly_cost numeric NOT NULL DEFAULT 0
);
