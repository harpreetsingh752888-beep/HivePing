import assert from "node:assert/strict";
import test from "node:test";

import { executeApprovedWebhookAction, parseExternalActionInput } from "../../core/action-webhook.js";

test("parseExternalActionInput parses name and JSON payload", () => {
  const parsed = parseExternalActionInput(
    'issue.create {"tracker":"github","title":"Login failure in callback","description":"OAuth callback returns 500 for some users","labels":["bug","backend"]}',
  );

  assert.equal(parsed.name, "issue.create");
  assert.equal(parsed.summary, "Login failure in callback");
  assert.deepEqual(parsed.payload, {
    tracker: "github",
    title: "Login failure in callback",
    description: "OAuth callback returns 500 for some users",
    labels: ["bug", "backend"],
  });
});

test("executeApprovedWebhookAction executes direct HTTP action when mode=http", async () => {
  const captured: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    captured.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, issueUrl: "https://example.com/issue/123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  try {
    const result = await executeApprovedWebhookAction({
      config: {
        actionWebhookToken: "secret-token",
      },
      request: {
        id: "appr_123",
        status: "pending",
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        conversationKey: "slack:default:C123",
        provider: "slack",
        projectId: "account-service",
        repoPath: "/workspace/account-service",
        prompt: "Create issue for login failure",
        requestedBy: "slack:U123",
        requestedRole: "dev",
        requiredRole: "maintainer",
        requestType: "external-action",
        externalAction: {
          name: "issue.create",
          summary: "Login failure in callback",
          payload: {
            mode: "http",
            method: "POST",
            url: "https://hooks.example.com/jira/create",
            headers: {
              "x-service": "jira",
            },
            input: {
              tracker: "github",
              title: "Login failure in callback",
            },
          },
        },
      },
      approvedBy: "slack:U999",
      approvalReason: "approved for triage",
      discussion: [
        { role: "user", content: "please create issue", at: "2026-03-12T00:00:01.000Z" },
        { role: "assistant", content: "will create after approval", at: "2026-03-12T00:00:02.000Z" },
      ],
    });

    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.url, "https://hooks.example.com/jira/create?requestId=appr_123&action=issue.create");
    assert.equal(captured[0]?.init?.method, "POST");
    assert.equal((captured[0]?.init?.headers as Record<string, string>)?.["x-service"], "jira");
    assert.equal((captured[0]?.init?.headers as Record<string, string>)?.authorization, "Bearer secret-token");

    const parsedBody = JSON.parse(String(captured[0]?.init?.body));
    assert.equal(parsedBody.action.name, "issue.create");
    assert.equal(parsedBody.input.title, "Login failure in callback");
    assert.equal(parsedBody.requestId, "appr_123");
    assert.equal(result.responseSummary.length > 0, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("executeApprovedWebhookAction supports response.field projection for HTTP mode", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        version_latest: "0.2.0",
        version_deployed: "0.1.2",
        version_previous: "0.1.1",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof globalThis.fetch;

  try {
    const result = await executeApprovedWebhookAction({
      config: {},
      request: {
        id: "appr_456",
        status: "pending",
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        conversationKey: "slack:default:C123",
        provider: "slack",
        projectId: "account-service",
        repoPath: "/workspace/account-service",
        prompt: "Get deployed version",
        requestedBy: "slack:U123",
        requestedRole: "owner",
        requiredRole: "owner",
        requestType: "external-action",
        externalAction: {
          name: "deployed.version",
          summary: "Get deployed version only",
          payload: {
            mode: "http",
            method: "GET",
            url: "https://hooks.example.com/version",
            response: {
              field: "version_deployed",
            },
          },
        },
      },
      approvedBy: "slack:U123",
    });

    assert.equal(result.responseSummary, "0.1.2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
