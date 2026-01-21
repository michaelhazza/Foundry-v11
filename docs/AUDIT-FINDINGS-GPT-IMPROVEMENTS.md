# Audit Findings & GPT Improvement Brief

**Project:** Foundry v11
**Audit Date:** 2026-01-21
**Purpose:** Document recurring build issues and provide specific GPT prompt improvements to prevent them in future builds.

---

## Executive Summary

After multiple build iterations, the following categories of issues persist:

| Category | Issue Count | Impact |
|----------|-------------|--------|
| Configuration Mismatches | 2 | Deploy blockers |
| API Path/Contract Mismatches | 8 | Frontend-backend integration failures |
| Missing Routes/Endpoints | 4 | 404 errors, broken features |
| Incomplete Implementations | 3 | Features don't work |
| Response Format Issues | 2 | API contract violations |

**Root Cause Analysis:** The GPT agents generating specifications operate independently without cross-validation. Agent 4 (API Contract) defines paths, but Agent 6 (Implementation Plan) may use different patterns. Agent 5 (UI Spec) creates links without verifying routes exist.

---

## SECTION 1: CONFIGURATION ISSUES

### Issue 1.1: Vite Port Mismatch

**What Happened:**
- `.replit` specifies `localPort = 5000`
- `vite.config.ts` specifies `port: 5173`
- Result: Replit can't route traffic to Vite dev server

**Why It Happened:**
- Agent 7 (QA/Deployment) defines .replit config
- Agent 6 (Implementation Plan) defines vite.config.ts
- No cross-validation between these specifications

**The Fix:**
```typescript
// vite.config.ts
server: {
  host: '0.0.0.0',
  port: 5000,  // MUST match .replit localPort
  ...
}
```

**GPT Prompt Addition for Agent 6 (Implementation Plan):**

```markdown
## CRITICAL: Port Configuration Alignment

When generating vite.config.ts, the server.port MUST be 5000 to match Replit's expected port.

MANDATORY vite.config.ts settings:
```typescript
server: {
  host: '0.0.0.0',      // Required for Replit
  port: 5000,           // MUST be 5000 - Replit requirement
  strictPort: true,     // Fail if port unavailable
  proxy: {
    '/api': {
      target: 'http://localhost:3001',  // Express runs on 3001 in dev
      changeOrigin: true,
    },
  },
  watch: {
    usePolling: true,   // Required for Replit filesystem
    interval: 1000,
    ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  },
}
```

VERIFICATION: After generating config, confirm:
- vite.config.ts port === 5000
- .replit localPort === 5000
```

**GPT Prompt Addition for Agent 7 (QA/Deployment):**

```markdown
## Port Configuration Verification Gate

Before finalizing deployment configuration, VERIFY:

| File | Setting | Required Value |
|------|---------|----------------|
| .replit | localPort | 5000 |
| vite.config.ts | server.port | 5000 |
| server/index.ts | PORT default | 5000 |

If ANY mismatch exists, flag as CRITICAL deployment blocker.
```

---

### Issue 1.2: API Proxy Target Mismatch

**What Happened:**
- Vite proxy targets `http://localhost:5000` (same as Vite port)
- Express should run on different port (3001) in development
- Result: Proxy points to itself, API calls fail

**Why It Happened:**
- Confusion between production port (5000) and development ports
- No clear documentation of dev vs prod port strategy

**The Fix:**
```typescript
// vite.config.ts - Development proxy
proxy: {
  '/api': {
    target: 'http://localhost:3001',  // Express dev port
    changeOrigin: true,
  },
}

// package.json - Dev scripts
"dev:server": "PORT=3001 tsx watch server/index.ts",
"dev:client": "vite",
```

**GPT Prompt Addition for Agent 6:**

```markdown
## Development Port Strategy

In DEVELOPMENT mode:
- Vite dev server: port 5000 (serves frontend)
- Express API server: port 3001 (serves API)
- Vite proxies /api/* requests to Express

In PRODUCTION mode:
- Express: port 5000 (serves both static files AND API)
- No Vite (pre-built)

MANDATORY package.json scripts:
```json
{
  "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
  "dev:server": "PORT=3001 tsx watch server/index.ts",
  "dev:client": "vite",
  "start": "NODE_ENV=production node dist/server/index.js"
}
```
```

---

## SECTION 2: API PATH MISMATCHES

### Issue 2.1: Nested vs Flat Resource Paths

**What Happened:**
- API Contract specifies: `GET /api/projects/:projectId/data-sources`
- Implementation creates: `GET /api/data-sources?projectId=123`
- Result: Frontend calls wrong endpoints, 404 errors

**Why It Happened:**
- Agent 4 (API Contract) chose nested paths for REST purity
- Agent 6 (Implementation Plan) chose flat paths for simplicity
- No enforcement mechanism to ensure alignment

**The Fix - Option A (Use Nested Paths):**
```typescript
// server/app.ts - Mount routes under projects
app.use('/api/projects/:projectId/data-sources', dataSourcesRoutes);
app.use('/api/projects/:projectId/jobs', jobsRoutes);
app.use('/api/projects/:projectId/datasets', datasetsRoutes);
app.use('/api/projects/:projectId/schema-mappings', schemaMappingsRoutes);

// server/routes/data-sources.routes.ts
router.get('/', asyncHandler(async (req, res) => {
  const projectId = parseIntParam(req.params.projectId, 'projectId');
  // ... list data sources for this project
}));
```

**The Fix - Option B (Use Flat Paths - Update API Contract):**
```typescript
// If flat paths preferred, API Contract must specify:
GET /api/data-sources?project_id=123
POST /api/data-sources  // projectId in request body
```

**GPT Prompt Addition for Agent 4 (API Contract):**

```markdown
## Resource Path Strategy Decision (BINDING)

At the START of API Contract generation, make ONE decision and apply CONSISTENTLY:

### Option A: Nested Paths (Recommended for resource hierarchies)
```
GET  /api/projects/:projectId/data-sources
POST /api/projects/:projectId/data-sources
GET  /api/data-sources/:sourceId
```

### Option B: Flat Paths (Simpler routing)
```
GET  /api/data-sources?project_id=123
POST /api/data-sources  // projectId in body
GET  /api/data-sources/:sourceId
```

CRITICAL: Once chosen, ALL subordinate resources MUST follow the same pattern.
Document the choice in Section 1 of API Contract.

FORBIDDEN: Mixing patterns (some nested, some flat) in same API.
```

**GPT Prompt Addition for Agent 6 (Implementation Plan):**

```markdown
## API Path Implementation Rule

When implementing routes, you MUST use the EXACT paths from the API Contract.

VERIFICATION PROCESS:
1. Read API Contract endpoint inventory
2. For each endpoint, create route with IDENTICAL path
3. Cross-reference: `grep -r "router\." server/routes/ | compare to API Contract`

FORBIDDEN:
- Changing `/projects/:projectId/data-sources` to `/data-sources`
- Changing path parameter names (`:sourceId` vs `:dataSourceId`)
- Adding query parameters not in spec
- Removing path segments for "simplicity"

If API Contract path seems wrong, flag it as ASSUMPTION - do not silently change it.
```

---

### Issue 2.2: Parameter Naming Inconsistency

**What Happened:**
- API Contract uses: `:sourceId`, `:mappingId`, `:jobId`
- Implementation uses: `:dataSourceId`, `:schemaMappingId`, `:processingJobId`
- Result: Parameter extraction fails, undefined values

**Why It Happened:**
- Agent 4 used short names for readability
- Agent 6 used descriptive names for clarity
- No naming convention enforced

**The Fix:**
Standardize on API Contract naming (shorter is better for URLs):

```typescript
// Use API Contract parameter names exactly
router.get('/:sourceId', ...)      // Not :dataSourceId
router.get('/:mappingId', ...)     // Not :schemaMappingId
router.get('/:jobId', ...)         // Not :processingJobId
```

**GPT Prompt Addition for Agent 4:**

```markdown
## Path Parameter Naming Convention

Path parameters MUST use short, clear names:

| Resource | Parameter | NOT |
|----------|-----------|-----|
| Data Source | :sourceId | :dataSourceId |
| Schema Mapping | :mappingId | :schemaMappingId |
| Processing Job | :jobId | :processingJobId |
| Dataset | :datasetId | :processedDatasetId |
| Connection | :connectionId | :oauthConnectionId |

RULE: Parameter name = singular resource name + "Id"
RULE: Omit prefixes/qualifiers (data, schema, processing, oauth)
```

---

### Issue 2.3: Missing Endpoints in Implementation

**What Happened:**
- API Contract specifies: `PATCH /api/data-sources/:sourceId`
- Implementation missing this endpoint entirely
- Result: Update functionality doesn't work

**Missing Endpoints Found:**
1. `PATCH /api/data-sources/:sourceId` - Update data source config
2. `GET /api/datasets/:datasetId/preview` - Preview dataset rows
3. `POST /api/auth/refresh` - Refresh JWT token

**Why It Happened:**
- Agent 6 may have missed endpoints when creating implementation tasks
- No automated count verification

**GPT Prompt Addition for Agent 6:**

```markdown
## Endpoint Count Verification Gate

BEFORE finalizing implementation plan:

1. Count endpoints in API Contract:
   ```
   grep -c "| [0-9]" 04-API-CONTRACT.md  // Should match endpoint table
   ```

2. Count implementation tasks for routes:
   ```
   grep -c "router\." in planned route files
   ```

3. VERIFY: API Contract count === Implementation task count

4. Create checklist mapping EVERY API Contract endpoint to implementation task:

   | # | API Endpoint | Implementation Task | Status |
   |---|--------------|---------------------|--------|
   | 1 | GET /api/health | Task 3.1.1 | ✓ |
   | 2 | POST /api/auth/register | Task 3.2.1 | ✓ |
   | ... | ... | ... | ... |

   If ANY endpoint lacks implementation task, add it before proceeding.
```

---

## SECTION 3: MISSING FRONTEND ROUTES

### Issue 3.1: Link to Non-Existent Route

**What Happened:**
- DashboardPage has: `<Link to="/projects/new">`
- App.tsx has no route for `/projects/new`
- Result: Clicking "Create Project" shows 404

**Why It Happened:**
- Agent 5 (UI Spec) defined the link
- Agent 6 didn't create corresponding route
- No Link-Route validation

**The Fix:**
```tsx
// Option A: Add dedicated route
<Route path="projects/new" element={<CreateProjectPage />} />

// Option B: Use modal (no new route needed)
// In DashboardPage, change Link to Button that opens modal
<Button onClick={() => setShowCreateModal(true)}>Create Project</Button>
```

**GPT Prompt Addition for Agent 5 (UI Spec):**

```markdown
## Link-Route Parity Rule

Every navigation element MUST have a corresponding route.

When specifying a Link/button that navigates:
1. Specify the target path
2. Specify the target page/component
3. Verify the route will exist in App.tsx

TEMPLATE for navigation specifications:
```
Navigation: "Create Project" button
Target Path: /projects/new
Target Component: CreateProjectPage (NEW - must be created)
Route Type: Protected (requires auth)
```

FORBIDDEN: Specifying navigation without confirming target page exists or will be created.
```

**GPT Prompt Addition for Agent 6:**

```markdown
## Frontend Route Verification Gate

AFTER defining all pages, BEFORE finalizing:

1. Extract all Link targets from UI components:
   ```
   grep -rh 'to="/' client/src/ | sort -u
   ```

2. Extract all Route paths from App.tsx:
   ```
   grep -h 'path="' client/src/App.tsx | sort -u
   ```

3. VERIFY: Every Link target exists as a Route path

4. If Link target has no Route:
   - Add the Route, OR
   - Change navigation approach (modal, etc.)

CRITICAL: This verification MUST pass before implementation is complete.
```

---

## SECTION 4: INCOMPLETE IMPLEMENTATIONS

### Issue 4.1: Placeholder Data in Endpoints

**What Happened:**
- `uploadFile` endpoint returns hardcoded S3 URL instead of generating presigned URL
- `preview` endpoint returns empty array instead of fetching from S3
- Result: File upload doesn't work, preview shows nothing

**Code Found:**
```typescript
// ❌ WRONG - Placeholder
sendSuccess(res, {
  uploadUrl: `https://s3.amazonaws.com/foundry/${dataSourceId}/upload`,
  // This URL doesn't work!
});

// ❌ WRONG - Empty data
sendSuccess(res, {
  rows: [],  // Should fetch from S3
  previewRecords: 0,
});
```

**Why It Happened:**
- Implementation plan may have marked these as "integrate later"
- No verification that all endpoints return real data

**The Fix:**
```typescript
// ✅ CORRECT - Use actual S3 service
import { getPresignedUploadUrl, generateS3Key } from '../services/s3-storage.service';

export async function uploadFile(req: Request, res: Response): Promise<void> {
  const dataSourceId = parseIntParam(req.params.dataSourceId, 'dataSourceId');

  // Generate real presigned URL
  const key = generateS3Key(orgId, projectId, 'sources', filename);
  const uploadUrl = await getPresignedUploadUrl(key, contentType, 3600);

  sendSuccess(res, { uploadUrl, key, expiresIn: 3600 });
}
```

**GPT Prompt Addition for Agent 6:**

```markdown
## No Placeholder Implementation Rule

FORBIDDEN patterns in controller/service code:

```typescript
// ❌ FORBIDDEN - Hardcoded URLs
uploadUrl: `https://s3.amazonaws.com/bucket/${id}/file`

// ❌ FORBIDDEN - Empty arrays as response
rows: []
data: []

// ❌ FORBIDDEN - TODO comments in production code
// TODO: Implement S3 integration

// ❌ FORBIDDEN - Mock data
return { id: 1, name: "Mock Project" }
```

REQUIRED: Every endpoint MUST use actual service implementations.

If a service isn't ready:
1. Create the service with NotImplementedError
2. Document in ASSUMPTION REGISTER
3. Flag as incomplete in task status

VERIFICATION:
```bash
grep -rn "placeholder\|mock\|TODO\|FIXME" server/controllers/
# Expected: No matches
```
```

---

### Issue 4.2: Missing Database Transactions

**What Happened:**
- Register endpoint creates organisation, then creates user
- If user creation fails, orphan organisation remains
- No transaction rollback

**Code Found:**
```typescript
// ❌ WRONG - No transaction
const [org] = await db.insert(organisations).values({...}).returning();
const [user] = await db.insert(users).values({ organisationId: org.id, ... }).returning();
// If this fails, org still exists!
```

**The Fix:**
```typescript
// ✅ CORRECT - With transaction
const result = await db.transaction(async (tx) => {
  const [org] = await tx.insert(organisations).values({...}).returning();
  const [user] = await tx.insert(users).values({ organisationId: org.id, ... }).returning();
  return { org, user };
});
// Both succeed or both fail
```

**GPT Prompt Addition for Agent 6:**

```markdown
## Database Transaction Requirements

MUST use transactions for:
1. Multi-table inserts (register: org + user)
2. Multi-table updates (transfer ownership)
3. Delete cascades not handled by DB
4. Any operation that must be atomic

TEMPLATE:
```typescript
const result = await db.transaction(async (tx) => {
  // All operations use tx, not db
  const [first] = await tx.insert(table1).values({...}).returning();
  const [second] = await tx.insert(table2).values({ firstId: first.id }).returning();
  return { first, second };
});
```

VERIFICATION: Search for multi-table operations:
```bash
grep -A5 "db.insert" server/controllers/ | grep -B5 "db.insert"
# If same function has multiple inserts, MUST use transaction
```
```

---

## SECTION 5: RESPONSE FORMAT ISSUES

### Issue 5.1: Missing Meta Field in Responses

**What Happened:**
- Response helpers return `{ data }` only
- API Contract may expect `{ data, meta: { timestamp, requestId } }`
- Result: Responses missing traceability info

**GPT Prompt Addition for Agent 4:**

```markdown
## Response Envelope Specification

Explicitly define whether meta field is required:

### Option A: Minimal (Recommended for MVP)
```json
{
  "data": { ... }
}
```

### Option B: With Meta (Better for debugging)
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "uuid-here"
  }
}
```

DECISION MUST be documented and applied to ALL response helper functions.
```

---

## SECTION 6: CROSS-AGENT VALIDATION RULES

These rules should be added to ALL agents to ensure consistency:

### Rule 6.1: Path Consistency Check

```markdown
## Cross-Document Path Validation

Before finalizing your document, verify paths match other specs:

| Your Document | Must Match |
|---------------|------------|
| API Contract (Agent 4) | Implementation Plan route paths |
| UI Spec (Agent 5) | API Contract endpoint paths |
| Implementation Plan (Agent 6) | API Contract exactly |

If you reference a path that differs from another spec, flag as ASSUMPTION.
```

### Rule 6.2: Count Verification

```markdown
## Cross-Document Count Validation

| Count | Document A | Document B | Must Match |
|-------|------------|------------|------------|
| Endpoints | API Contract | Implementation Plan | Yes |
| Pages | UI Spec | Implementation Plan | Yes |
| Tables | Data Model | Implementation Plan | Yes |

If counts don't match, reconcile before finalizing.
```

### Rule 6.3: Naming Consistency

```markdown
## Cross-Document Naming Validation

These names MUST be identical across all documents:
- Database table names
- API endpoint paths
- Path parameter names
- React component names
- Route paths

If Document A uses `dataSourceId` and Document B uses `sourceId`,
flag as conflict and resolve.
```

---

## SECTION 7: AGENT-SPECIFIC PROMPT ADDITIONS SUMMARY

### Agent 4 (API Contract) Additions:

1. **Path Strategy Decision** - Choose nested or flat, apply consistently
2. **Parameter Naming Convention** - Short names: `:sourceId` not `:dataSourceId`
3. **Response Envelope Spec** - Define meta field requirement explicitly
4. **Endpoint Completeness Checklist** - List every endpoint with HTTP method

### Agent 5 (UI Spec) Additions:

1. **Link-Route Parity Rule** - Every link must specify target route
2. **Page Inventory** - List all pages with their routes
3. **Navigation Flow Diagram** - Show how pages connect

### Agent 6 (Implementation Plan) Additions:

1. **Port Configuration Alignment** - Vite=5000, Express dev=3001
2. **API Path Exact Match** - Use API Contract paths verbatim
3. **Endpoint Count Verification** - Count must match API Contract
4. **No Placeholder Rule** - grep check for mock/TODO
5. **Transaction Requirements** - Multi-table ops need transactions
6. **Link-Route Verification** - All Links must have Routes

### Agent 7 (QA/Deployment) Additions:

1. **Port Configuration Gate** - Verify all ports match
2. **Endpoint Count Gate** - API Contract vs Implementation
3. **Route Coverage Gate** - All UI links have routes

---

## SECTION 8: AUTOMATED VERIFICATION COMMANDS

Add these to Agent 8 or as pre-deployment checks:

```bash
# 1. Port consistency
echo "=== Port Check ==="
grep "localPort" .replit
grep "port:" vite.config.ts
grep "PORT" server/index.ts

# 2. Endpoint count
echo "=== Endpoint Count ==="
API_COUNT=$(grep -c "| [0-9]* |" docs/04-API-CONTRACT.md)
ROUTE_COUNT=$(grep -rc "router\.\(get\|post\|patch\|put\|delete\)" server/routes/ | awk -F: '{sum+=$2} END {print sum}')
echo "API Contract: $API_COUNT"
echo "Routes: $ROUTE_COUNT"
[ "$API_COUNT" -eq "$ROUTE_COUNT" ] && echo "✓ Match" || echo "✗ MISMATCH"

# 3. Link-Route parity
echo "=== Link-Route Check ==="
LINKS=$(grep -roh 'to="[^"]*"' client/src/ | sed 's/to="//;s/"$//' | sort -u)
for link in $LINKS; do
  if ! grep -q "path=\"${link#/}\"" client/src/App.tsx 2>/dev/null; then
    echo "✗ Missing route: $link"
  fi
done

# 4. Placeholder detection
echo "=== Placeholder Check ==="
grep -rn "placeholder\|mock\|TODO\|FIXME" server/controllers/ server/services/ && echo "✗ Found placeholders" || echo "✓ No placeholders"

# 5. Transaction check for multi-inserts
echo "=== Transaction Check ==="
grep -l "db.insert" server/controllers/*.ts | while read f; do
  COUNT=$(grep -c "db.insert" "$f")
  if [ "$COUNT" -gt 1 ]; then
    if ! grep -q "db.transaction" "$f"; then
      echo "✗ $f has $COUNT inserts but no transaction"
    fi
  fi
done
```

---

## SECTION 9: RECOMMENDED WORKFLOW CHANGES

### Current Workflow (Problem):
```
Agent 1 → Agent 2 → Agent 3 → Agent 4 → Agent 5 → Agent 6 → Agent 7 → Build → Agent 8 (finds issues)
```

### Recommended Workflow (Solution):
```
Agent 1 → Agent 2 → Agent 3 → Agent 4 → Agent 5 → Agent 6 → Agent 7
                                  ↓
                         VALIDATION GATE
                    (Cross-reference all docs)
                                  ↓
                         Build (Claude Code)
                                  ↓
                         Agent 8 (Final audit)
```

### Validation Gate Checks:
1. API Contract endpoint count = Implementation Plan route count
2. All UI Spec links have routes in Implementation Plan
3. All path parameter names consistent
4. Port numbers consistent across configs
5. Database table names match Data Model

---

## SECTION 10: ISSUE TRACKING TEMPLATE

For future audits, use this template to track issues:

```markdown
## Issue: [SHORT_TITLE]

**Category:** Configuration | API | Frontend | Implementation | Response
**Severity:** CRITICAL | HIGH | MEDIUM | LOW
**Recurrence:** First time | Repeat (count: N)

**What Happened:**
[Description of the issue]

**Code Location:**
- File: [path]
- Line: [number]

**Expected (per spec):**
[What the spec says]

**Actual (in code):**
[What was implemented]

**Root Cause:**
[Why it happened - which agent/spec was unclear]

**Fix:**
```code
[The fix]
```

**GPT Improvement:**
```markdown
[Exact text to add to which agent's prompt]
```

**Verification:**
```bash
[Command to verify fix]
```
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-21 | Initial audit findings from Foundry v11 build |

---

**END OF DOCUMENT**
