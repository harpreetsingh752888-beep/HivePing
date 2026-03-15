# HivePing Config API Contract

Endpoint:

- `POST /get-hiveping-config`

Purpose:

- Return organization-scoped roles, policies, and project/repo values for the calling user/conversation.
- This endpoint is designed for `hiveping` mention authorization (`@hiveping bind`, `@hiveping ask`, `@hiveping status`, `@hiveping unbind`) and direct platform bot mentions (`<@...>`). The bot display name can be anything.

Content type:

- `application/json`

## Request Body

`organizationName` is required. Everything else is optional but recommended for authorization decisions.

```json
{
  "organizationName": "org-any",
  "provider": "slack",
  "conversationKey": "slack:T123:C456:1711155200.000100",
  "action": "ask",
  "user": {
    "id": "U02ABCDEF",
    "displayName": "Ava"
  },
  "requested": {
    "projectId": "account-service",
    "repoPath": "/workspace/<your-dir>/account-service"
  },
  "context": {
    "accountId": "T123",
    "channelId": "C456",
    "threadId": "1711155200.000100"
  },
  "client": {
    "pluginId": "hiveping",
    "pluginVersion": "0.1.0"
  }
}
```

Reference schema:

- [`get-hiveping-config.request.schema.json`](./schemas/get-hiveping-config.request.schema.json)

## Success Response (200)

```json
{
  "ok": true,
  "requestId": "req_4g5m1",
  "issuedAt": "2026-03-09T05:00:00.000Z",
  "expiresAt": "2026-03-09T05:05:00.000Z",
  "organization": {
    "id": "org_acme",
    "name": "org-any"
  },
  "user": {
    "id": "U02ABCDEF",
    "roles": ["org:member", "repo:reader"],
    "permissions": {
      "canBind": true,
      "canAsk": true,
      "canStatus": true,
      "canUnbind": true
    }
  },
  "policy": {
    "allowedRoots": ["/workspace/<your-dir>", "/home/node/.openclaw/workspace"],
    "defaultSandbox": "read-only",
    "defaultApprovalPolicy": "never",
    "readOnlyCodex": true,
    "requireBindingForAsk": true,
    "requireProjectMatchForBind": false
  },
  "projects": [
    {
      "id": "account-service",
      "name": "Account Service",
      "repoPath": "/workspace/<your-dir>/account-service",
      "enabled": true,
      "allowedRoles": ["org:member", "repo:reader"],
      "allowedConversationPrefixes": ["slack:T123:C456", "discord:987654321"],
      "metadata": {
        "language": "typescript",
        "owner": "platform"
      }
    }
  ],
  "message": "Configuration loaded."
}
```

Reference schema:

- [`get-hiveping-config.success.schema.json`](./schemas/get-hiveping-config.success.schema.json)

## Error Response (4xx/5xx)

```json
{
  "ok": false,
  "requestId": "req_4g5m1",
  "error": {
    "code": "ORG_NOT_FOUND",
    "message": "organizationName is unknown",
    "details": {
      "organizationName": "org-any"
    }
  }
}
```

Reference schema:

- [`get-hiveping-config.error.schema.json`](./schemas/get-hiveping-config.error.schema.json)

## Recommended Validation Rules

- `organizationName`: `^[a-z0-9][a-z0-9_-]{1,119}$`
- `provider`: `discord | slack | msteams | unknown`
- `action`: `bind | ask | status | unbind`
- Role format: `^[a-zA-Z0-9:_-]{1,64}$`
- `repoPath`: absolute path only

## Backend Behavior Notes

- Reject unknown organizations with `404 ORG_NOT_FOUND`.
- Return `403 USER_NOT_AUTHORIZED` when role policy denies requested `action`.
- Return only repos user is allowed to see in `projects`.
- Keep response cacheable for a short TTL (`expiresAt`) to reduce API load.
