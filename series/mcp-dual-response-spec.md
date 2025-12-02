# mcp-dual-response Library Specification

## Overview

A Node.js library providing utilities for implementing the Dual Response pattern in MCP-based reporting applications. The library has two distinct parts:

1. **Server Framework** (`mcp-dual-response/server`) - Helps MCP tool handlers create dual responses and exposes REST endpoints for out-of-band data retrieval
2. **Client Library** (`mcp-dual-response/client`) - Helps host applications parse dual responses and fetch complete datasets

## Design Principles

### What This Library Does NOT Do

**Server side:**
- Does NOT implement MCP transport (stdio, HTTP/SSE)
- Does NOT handle MCP protocol messages (initialize, tools/list, tools/call)
- Does NOT register tools with MCP
- Does NOT dictate database or query implementation

**Client side:**
- Does NOT implement LLM API calls (OpenAI, Anthropic, etc.)
- Does NOT parse MCP protocol messages
- Does NOT handle MCP transport

### What This Library DOES Do

**Server side:**
- Creates dual response structures from query results
- Manages resource storage and lifecycle (expiration, pinning)
- Provides Express-compatible router for REST endpoints
- Formats responses for MCP tool handlers to return

**Client side:**
- Parses dual response structures from tool results
- Provides HTTP client for REST endpoint retrieval
- Handles pagination and data fetching
- Tracks resource lifecycle (expiration awareness)

---

## Server Framework

### Installation

```javascript
const { DualResponseServer, MemoryStore } = require('mcp-dual-response/server');
```

### Core Classes

#### `DualResponseServer`

The main server-side class that manages resource creation and retrieval.

```javascript
const server = new DualResponseServer(options);
```

**Options:**

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `baseUrl` | string | Yes | - | Base URL where REST endpoints are exposed (e.g., `https://api.example.com/resources`) |
| `store` | ResourceStore | No | MemoryStore | Storage backend for resources |
| `defaultExpiration` | number | No | 900000 (15 min) | Default TTL in milliseconds |
| `defaultSampleSize` | number | No | 15 | Default number of sample rows |
| `cleanupInterval` | number | No | 60000 (1 min) | Interval for expired resource cleanup |

**Methods:**

##### `server.createResponse(options)` → `Promise<DualResponse>`

Creates a dual response from a query.

```javascript
const response = await server.createResponse({
  name: 'Institution Search Results',
  execute: async (options) => {
    // options.offset, options.limit provided
    // Return array of row objects
    return rows;
  },
  count: async () => {
    // Return total count as number
    return totalCount;
  },
  columns: [
    { name: 'id', type: 'number' },
    { name: 'name', type: 'string' },
    { name: 'state', type: 'string' }
  ],
  // Optional overrides
  sampleSize: 20,
  expiration: 30 * 60 * 1000, // 30 minutes
  metadata: { queryParams: { state: 'NJ' } } // Custom metadata stored with resource
});
```

**Execute function signature:**
```javascript
async function execute({ offset, limit, sort }) {
  // offset: number - starting row (0-indexed)
  // limit: number - max rows to return
  // sort: { field: string, order: 'asc'|'desc' } | null
  return rows; // Array of objects
}
```

##### `server.getResource(resourceId)` → `Promise<Resource|null>`

Retrieves a resource by ID.

##### `server.pinResource(resourceId)` → `Promise<boolean>`

Removes expiration from a resource (makes it persistent).

##### `server.deleteResource(resourceId)` → `Promise<boolean>`

Explicitly deletes a resource.

##### `server.router()` → `express.Router`

Returns an Express router for REST endpoints.

```javascript
const express = require('express');
const app = express();

app.use('/resources', server.router());
```

##### `server.shutdown()` → `Promise<void>`

Stops cleanup interval and closes storage connections.

---

#### `DualResponse`

Returned by `createResponse()`. Represents a created dual response.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `resourceId` | string | Unique identifier for the resource |
| `resourceUri` | string | Full URI (e.g., `resource://abc123`) |
| `sample` | array | Sample rows (up to sampleSize) |
| `totalCount` | number | Total matching rows |
| `columns` | array | Column definitions |
| `expiresAt` | Date\|null | Expiration timestamp (null if pinned) |
| `createdAt` | Date | Creation timestamp |

**Methods:**

##### `response.toMCPContent()` → `array`

Returns MCP-formatted content array for tool response.

```javascript
// Returns array suitable for MCP tool response content field
[
  {
    type: 'text',
    text: 'Found 847 results. Sample data and full dataset link included.'
  },
  {
    type: 'resource_link',
    uri: 'resource://abc123',
    name: 'Institution Search Results',
    mimeType: 'application/json'
  }
]
```

##### `response.toStructuredContent()` → `object`

Returns the structured content object for MCP tool response.

```javascript
{
  results: [...],  // sample rows
  resource: {
    uri: 'resource://abc123',
    name: 'Institution Search Results',
    mimeType: 'application/json'
  },
  metadata: {
    total_count: 847,
    columns: [...],
    executed_at: '2025-01-15T10:30:00Z',
    expires_at: '2025-01-15T10:45:00Z'
  }
}
```

##### `response.toMCPToolResult()` → `object`

Returns complete MCP tool result object.

```javascript
{
  content: [...],           // from toMCPContent()
  structuredContent: {...}  // from toStructuredContent()
}
```

---

#### Storage Backends

##### `MemoryStore`

In-memory storage (default). Good for development and single-instance deployments.

```javascript
const { MemoryStore } = require('mcp-dual-response/server');
const store = new MemoryStore();
```

##### `ResourceStore` (Interface)

Interface for custom storage backends.

```javascript
class CustomStore {
  async save(resource) { }           // Save resource, return resourceId
  async get(resourceId) { }          // Get resource or null
  async update(resourceId, updates) { } // Partial update
  async delete(resourceId) { }       // Delete resource
  async findExpired() { }            // Return array of expired resourceIds
  async close() { }                  // Cleanup connections
}
```

**Resource object structure:**
```javascript
{
  id: 'abc123',
  name: 'Institution Search Results',
  query: { /* stored execute params or query definition */ },
  columns: [...],
  totalCount: 847,
  sampleData: [...],
  createdAt: Date,
  expiresAt: Date | null,
  accessCount: 0,
  lastAccessedAt: null,
  metadata: { /* custom */ }
}
```

---

### REST Endpoints

The router exposes these endpoints:

#### `GET /:resourceId`

Returns resource metadata.

**Response (200):**
```json
{
  "status": "ready",
  "total_count": 847,
  "columns": [...],
  "created_at": "2025-01-15T10:30:00Z",
  "expires_at": "2025-01-15T10:45:00Z",
  "access_count": 3
}
```

**Response (404):**
```json
{
  "error": "not_found",
  "message": "Resource not found or expired"
}
```

#### `POST /:resourceId`

Retrieves paginated data.

**Request body:**
```json
{
  "offset": 0,
  "limit": 100,
  "sort": { "field": "enrollment", "order": "desc" }
}
```

**Response (200):**
```json
{
  "data": [...],
  "total_count": 847,
  "returned_count": 100,
  "offset": 0,
  "has_next": true,
  "next_offset": 100
}
```

#### `PUT /:resourceId`

Pins a resource (removes expiration).

**Response (200):**
```json
{
  "status": "pinned",
  "expires_at": null
}
```

#### `DELETE /:resourceId`

Deletes a resource.

**Response (204):** No content

---

### Integration Example (Server)

```javascript
const express = require('express');
const { DualResponseServer } = require('mcp-dual-response/server');
const { Server } = require('@modelcontextprotocol/sdk/server');

// Create dual response server
const dualResponse = new DualResponseServer({
  baseUrl: 'http://localhost:3001/resources'
});

// Create Express app for REST endpoints
const app = express();
app.use(express.json());
app.use('/resources', dualResponse.router());
app.listen(3001);

// Create MCP server (using official SDK)
const mcpServer = new Server({
  name: 'ipeds-reporting',
  version: '1.0.0'
});

// Register tool that uses dual response
mcpServer.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'search_institutions') {
    const { state, control } = request.params.arguments;
    
    // Create dual response
    const response = await dualResponse.createResponse({
      name: 'Institution Search Results',
      execute: async ({ offset, limit }) => {
        return db.query(
          'SELECT * FROM institutions WHERE state = ? AND control = ? LIMIT ? OFFSET ?',
          [state, control, limit, offset]
        );
      },
      count: async () => {
        const result = await db.query(
          'SELECT COUNT(*) as count FROM institutions WHERE state = ? AND control = ?',
          [state, control]
        );
        return result[0].count;
      },
      columns: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' },
        { name: 'state', type: 'string' },
        { name: 'control', type: 'string' },
        { name: 'enrollment', type: 'number' }
      ]
    });
    
    // Return MCP-formatted result
    return response.toMCPToolResult();
  }
});
```

---

## Client Library

### Installation

```javascript
const { DualResponseClient } = require('mcp-dual-response/client');
```

### Core Classes

#### `DualResponseClient`

The main client-side class for parsing and fetching dual response data.

```javascript
const client = new DualResponseClient(options);
```

**Options:**

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `baseUrl` | string | No | null | Override base URL for all requests |
| `fetch` | function | No | global fetch | Custom fetch implementation |
| `headers` | object | No | {} | Default headers for all requests |
| `timeout` | number | No | 30000 | Request timeout in milliseconds |

**Methods:**

##### `client.parse(toolResult)` → `ParsedDualResponse | null`

Parses an MCP tool result to extract dual response data.

```javascript
// toolResult is what you get back from the LLM's tool call
const parsed = client.parse(toolResult);

if (parsed) {
  console.log(parsed.sample);      // Sample rows
  console.log(parsed.totalCount);  // 847
  console.log(parsed.resourceUri); // 'resource://abc123'
  console.log(parsed.columns);     // Column definitions
  console.log(parsed.expiresAt);   // Date or null
}
```

Returns `null` if the tool result is not a dual response.

##### `client.parseStructured(structuredContent)` → `ParsedDualResponse | null`

Parses just the structuredContent portion of a tool result.

---

#### `ParsedDualResponse`

Returned by `client.parse()`. Provides access to dual response data and fetching.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `sample` | array | Sample rows from the response |
| `totalCount` | number | Total matching rows |
| `resourceUri` | string | Resource URI (e.g., `resource://abc123`) |
| `resourceUrl` | string | Full HTTP URL for fetching |
| `columns` | array | Column definitions |
| `expiresAt` | Date\|null | Expiration timestamp |
| `executedAt` | Date | Query execution timestamp |

**Methods:**

##### `parsed.isExpired()` → `boolean`

Checks if the resource has expired.

##### `parsed.fetch(options)` → `Promise<FetchResult>`

Fetches a page of data.

```javascript
const result = await parsed.fetch({
  offset: 0,
  limit: 100,
  sort: { field: 'enrollment', order: 'desc' }
});

console.log(result.data);          // Array of rows
console.log(result.totalCount);    // 847
console.log(result.returnedCount); // 100
console.log(result.hasNext);       // true
console.log(result.nextOffset);    // 100
```

##### `parsed.fetchAll(options)` → `Promise<array>`

Fetches all data (handles pagination automatically).

```javascript
const allRows = await parsed.fetchAll({
  batchSize: 500,  // Fetch 500 at a time
  onProgress: (fetched, total) => {
    console.log(`Fetched ${fetched} of ${total}`);
  }
});
```

**Warning:** Use with caution on large datasets. Consider streaming or pagination for very large results.

##### `parsed.fetchStream(options)` → `AsyncGenerator<array>`

Returns an async generator that yields batches of rows.

```javascript
for await (const batch of parsed.fetchStream({ batchSize: 100 })) {
  // Process each batch of 100 rows
  processBatch(batch);
}
```

##### `parsed.getMetadata()` → `Promise<ResourceMetadata>`

Fetches current resource metadata from server.

```javascript
const meta = await parsed.getMetadata();
console.log(meta.status);       // 'ready'
console.log(meta.accessCount);  // 5
console.log(meta.expiresAt);    // Date
```

##### `parsed.pin()` → `Promise<boolean>`

Pins the resource (removes expiration).

##### `parsed.delete()` → `Promise<boolean>`

Deletes the resource.

---

#### `FetchResult`

Returned by `parsed.fetch()`.

```javascript
{
  data: [...],        // Array of row objects
  totalCount: 847,    // Total matching rows
  returnedCount: 100, // Rows in this response
  offset: 0,          // Current offset
  hasNext: true,      // More pages available
  hasPrevious: false, // Previous pages available
  nextOffset: 100     // Offset for next page
}
```

---

### Integration Example (Client)

```javascript
const OpenAI = require('openai');
const { DualResponseClient } = require('mcp-dual-response/client');

const openai = new OpenAI();
const dualClient = new DualResponseClient();

// Define tools for OpenAI
const tools = [
  {
    type: 'function',
    function: {
      name: 'search_institutions',
      description: 'Search colleges and universities',
      parameters: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'State abbreviation' },
          control: { type: 'string', enum: ['public', 'private'] }
        }
      }
    }
  }
];

// Chat completion with tool use
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Show me public universities in California' }],
  tools
});

// Handle tool calls
for (const toolCall of response.choices[0].message.tool_calls || []) {
  // Execute tool via MCP (your MCP client code here)
  const mcpResult = await mcpClient.callTool(
    toolCall.function.name,
    JSON.parse(toolCall.function.arguments)
  );
  
  // Parse as dual response
  const parsed = dualClient.parse(mcpResult);
  
  if (parsed) {
    // LLM got sample data, user needs full results
    console.log(`Found ${parsed.totalCount} institutions`);
    console.log('Sample:', parsed.sample);
    
    // Fetch full data for rendering
    const allData = await parsed.fetchAll();
    renderTable(allData, parsed.columns);
  }
}
```

---

## Error Handling

### Server Errors

```javascript
const { DualResponseError, ResourceNotFoundError, ResourceExpiredError } = require('mcp-dual-response/server');

try {
  const response = await dualResponse.createResponse({ ... });
} catch (error) {
  if (error instanceof DualResponseError) {
    // Base error class for all library errors
    console.error(error.code, error.message);
  }
}
```

**Error codes:**
- `QUERY_EXECUTION_FAILED` - execute() function threw
- `COUNT_EXECUTION_FAILED` - count() function threw
- `STORAGE_ERROR` - Storage backend error
- `RESOURCE_NOT_FOUND` - Resource doesn't exist
- `RESOURCE_EXPIRED` - Resource has expired

### Client Errors

```javascript
const { DualResponseClientError, FetchError } = require('mcp-dual-response/client');

try {
  const data = await parsed.fetch({ offset: 0, limit: 100 });
} catch (error) {
  if (error instanceof FetchError) {
    console.error(error.status, error.message);
  }
}
```

**Error codes:**
- `PARSE_ERROR` - Tool result is not valid dual response
- `FETCH_ERROR` - HTTP request failed
- `TIMEOUT` - Request timed out
- `RESOURCE_NOT_FOUND` - 404 from server
- `RESOURCE_EXPIRED` - Resource no longer available

---

## TypeScript Definitions

While the library is JavaScript, TypeScript definitions are provided:

```typescript
// Types are exported from main entry points
import type { 
  DualResponseServerOptions,
  DualResponse,
  ResourceStore,
  ColumnDefinition 
} from 'mcp-dual-response/server';

import type {
  DualResponseClientOptions,
  ParsedDualResponse,
  FetchResult,
  FetchOptions
} from 'mcp-dual-response/client';
```

---

## URI Resolution

The library resolves resource URIs to HTTP URLs as follows:

1. **Server sets `baseUrl`:** `https://api.example.com/resources`
2. **Resource created with ID:** `abc123`
3. **MCP response includes:** `uri: "resource://abc123"`
4. **structuredContent includes:** Full base URL in resource object
5. **Client extracts URL:** `https://api.example.com/resources/abc123`

The client uses the URL from `structuredContent.resource` if available, falling back to parsing the URI scheme if needed.

---

## Package Structure

```
mcp-dual-response/
├── package.json
├── index.js                 # Re-exports both client and server
├── server/
│   ├── index.js            # Server exports
│   ├── DualResponseServer.js
│   ├── DualResponse.js
│   ├── stores/
│   │   ├── MemoryStore.js
│   │   └── index.js
│   ├── router.js           # Express router factory
│   └── errors.js
├── client/
│   ├── index.js            # Client exports
│   ├── DualResponseClient.js
│   ├── ParsedDualResponse.js
│   └── errors.js
├── shared/
│   ├── schema.js           # Shared schema definitions
│   └── constants.js
└── types/
    ├── server.d.ts
    └── client.d.ts
```

---

## Open Questions / Design Decisions Needed

1. **Authentication pass-through:** Should the client automatically forward auth headers? How does the server validate them?

2. **Sorting semantics:** Does sort on fetch re-execute query or sort cached results? (Current spec: re-executes)

3. **Custom URI schemes:** Support for schemes other than `resource://`?

4. **Streaming responses:** Should POST support streaming for very large responses?

5. **Multi-tenant binding:** Should the server framework provide hooks for tenant validation, or leave entirely to implementer?

6. **Connection to MCP Tasks:** Should long-running queries integrate with MCP Tasks, and if so, how?

---

## Version

Specification version: 0.1.0-draft
