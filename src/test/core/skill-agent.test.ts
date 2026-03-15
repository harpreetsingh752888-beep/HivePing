import assert from "node:assert/strict";
import test from "node:test";

import { parseAgentSkillDecisionText } from "../../core/skill-agent.js";

test("parseAgentSkillDecisionText parses matched decision JSON", () => {
  const raw = [
    "```json",
    JSON.stringify(
      {
        match: true,
        reason: "jira issue request matched",
        action: {
          name: "jira.issue.create",
          method: "POST",
          url: "https://automation.company.com/jira/create",
          headers: {
            "x-source": "hiveping",
          },
        },
      },
      null,
      2,
    ),
    "```",
  ].join("\n");

  const parsed = parseAgentSkillDecisionText(raw);
  assert.equal(parsed?.matched, true);
  assert.equal(parsed?.route?.name, "jira.issue.create");
  assert.equal(parsed?.route?.http.method, "POST");
  assert.equal(parsed?.route?.http.url, "https://automation.company.com/jira/create");
  assert.equal(parsed?.route?.http.headers?.["x-source"], "hiveping");
});

test("parseAgentSkillDecisionText returns unmatched decision", () => {
  const raw = JSON.stringify({
    match: false,
    reason: "No action route applies",
  });

  const parsed = parseAgentSkillDecisionText(raw);
  assert.equal(parsed?.matched, false);
  assert.equal(parsed?.reason, "No action route applies");
});

test("parseAgentSkillDecisionText ignores invalid JSON outputs", () => {
  const parsed = parseAgentSkillDecisionText("No valid JSON here");
  assert.equal(parsed, null);
});
