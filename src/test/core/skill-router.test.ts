import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadSkillRoutes,
  loadSkillsDocument,
  matchSkillRoute,
  resolveSkillsFilePath,
} from "../../core/skill-router.js";

async function makeTempDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("loadSkillRoutes reads skills from markdown JSON code block", async () => {
  const dir = await makeTempDir("hiveping-skills-");

  try {
    const repoPath = path.join(dir, "repo");
    const skillsDir = path.join(repoPath, ".hiveping");
    const skillsPath = path.join(skillsDir, "skills.md");
    await fs.mkdir(skillsDir, { recursive: true });

    await fs.writeFile(
      skillsPath,
      [
        "# Skills",
        "",
        "```json",
        JSON.stringify(
          {
            version: 1,
            skills: [
              {
                name: "jira.issue.create",
                description: "Create Jira issue",
                match: {
                  any: ["jira issue", "create jira"],
                },
                http: {
                  method: "POST",
                  url: "https://hooks.example.com/jira",
                },
              },
              {
                name: "deploy.status",
                match: {
                  regex: "deploy\\s+status",
                },
                http: {
                  method: "GET",
                  url: "https://hooks.example.com/deploy/status",
                  query: {
                    source: "hiveping",
                  },
                },
              },
            ],
          },
          null,
          2,
        ),
        "```",
        "",
      ].join("\n"),
      "utf8",
    );

    const routes = await loadSkillRoutes({}, repoPath);
    assert.equal(routes.length, 2);
    assert.equal(routes[0]?.name, "jira.issue.create");
    assert.equal(routes[0]?.http.method, "POST");
    assert.equal(routes[1]?.http.method, "GET");
    assert.equal(resolveSkillsFilePath({}, repoPath), skillsPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("matchSkillRoute matches keyword and regex routes", () => {
  const routes = [
    {
      name: "jira.issue.create",
      match: {
        any: ["create jira issue"],
      },
      approval: {
        required: true,
      },
      http: {
        method: "POST" as const,
        url: "https://hooks.example.com/jira",
      },
    },
    {
      name: "incident.lookup",
      match: {
        regex: "incident\\s+(INC-\\d+)",
      },
      approval: {
        required: true,
      },
      http: {
        method: "GET" as const,
        url: "https://hooks.example.com/incident",
      },
    },
  ];

  const byKeyword = matchSkillRoute("please create jira issue for auth callback", routes);
  assert.equal(byKeyword?.route.name, "jira.issue.create");

  const byRegex = matchSkillRoute("check incident INC-2042 now", routes);
  assert.equal(byRegex?.route.name, "incident.lookup");
  assert.deepEqual(byRegex?.regexCaptures, ["INC-2042"]);
});

test("loadSkillRoutes parses markdown-native skill sections without JSON", async () => {
  const dir = await makeTempDir("hiveping-skills-md-");

  try {
    const repoPath = path.join(dir, "repo");
    const skillsDir = path.join(repoPath, ".hiveping");
    const skillsPath = path.join(skillsDir, "skills.md");
    await fs.mkdir(skillsDir, { recursive: true });

    await fs.writeFile(
      skillsPath,
      [
        "# Skills",
        "",
        "## Jira Create",
        "- action: jira.issue.create",
        "- description: Create Jira issue from request",
        "- match_any: create jira issue, raise jira, jira ticket",
        "- method: POST",
        "- url: https://automation.company.com/jira/create",
        "",
        "## Deploy Status",
        "- name: deploy.status",
        "- match_regex: deploy\\s+status\\s+([a-z0-9-]+)",
        "- method: GET",
        "- url: https://automation.company.com/deploy/status",
        "",
      ].join("\n"),
      "utf8",
    );

    const routes = await loadSkillRoutes({}, repoPath);
    assert.equal(routes.length, 2);
    assert.equal(routes[0]?.name, "jira.issue.create");
    assert.equal(routes[0]?.http.method, "POST");
    assert.deepEqual(routes[0]?.match?.any, ["create jira issue", "raise jira", "jira ticket"]);
    assert.equal(routes[0]?.response?.field, undefined);
    assert.equal(routes[1]?.name, "deploy.status");
    assert.equal(routes[1]?.match?.regex, "deploy\\s+status\\s+([a-z0-9-]+)");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("loadSkillRoutes parses response_field in markdown-native sections", async () => {
  const dir = await makeTempDir("hiveping-skills-response-");

  try {
    const repoPath = path.join(dir, "repo");
    const skillsDir = path.join(repoPath, ".hiveping");
    const skillsPath = path.join(skillsDir, "skills.md");
    await fs.mkdir(skillsDir, { recursive: true });

    await fs.writeFile(
      skillsPath,
      [
        "# Skills",
        "",
        "## Deployed Version",
        "- action: deployed.version",
        "- match_any: deployed version, app version",
        "- method: GET",
        "- url: https://automation.company.com/deploy/version",
        "- response_field: version_deployed",
        "",
      ].join("\n"),
      "utf8",
    );

    const routes = await loadSkillRoutes({}, repoPath);
    assert.equal(routes.length, 1);
    assert.equal(routes[0]?.name, "deployed.version");
    assert.equal(routes[0]?.response?.field, "version_deployed");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("loadSkillsDocument falls back to SKILLS.md when skills.md is missing", async () => {
  const dir = await makeTempDir("hiveping-skills-uppercase-");

  try {
    const repoPath = path.join(dir, "repo");
    const skillsDir = path.join(repoPath, ".hiveping");
    const skillsPath = path.join(skillsDir, "SKILLS.md");
    await fs.mkdir(skillsDir, { recursive: true });

    await fs.writeFile(
      skillsPath,
      [
        "# Skills",
        "",
        "## Deploy Status",
        "- action: deploy.status",
        "- match_any: deploy status",
        "- method: GET",
        "- url: https://automation.company.com/deploy/status",
        "",
      ].join("\n"),
      "utf8",
    );

    const document = await loadSkillsDocument({}, repoPath);
    assert.equal(document?.filePath.toLowerCase(), skillsPath.toLowerCase());
    assert.match(document?.content || "", /Deploy Status/);

    const routes = await loadSkillRoutes({}, repoPath);
    assert.equal(routes.length, 1);
    assert.equal(routes[0]?.name, "deploy.status");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
