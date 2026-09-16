# OntoFabric Application Guide

OntoFabric is an enterprise ontology and knowledge-graph workspace for combining operational data, curated subject-matter-expert input, entity resolution, and S&OP planning data in one interface.

The application has four workspace areas and an MCP integration layer:

- **Explorer**: inspect the ontology graph, ingest source files, add SME entities and relationships, and ask grounded graph questions.
- **Schema Designer**: visually define entity types, properties, primary keys, required fields, and relationships before saving the schema to Neo4j.
- **Approvals**: review and resolve possible duplicate entities before they become canonical graph data.
- **S&OP Cockpit**: review demand, inventory, supplier exposure, and production capacity.
- **MCP source tools**: parse Excel/PDF files and retrieve ERP/CRM records through the Model Context Protocol server.

## Architecture

```text
Excel / PDF / ERP / CRM / SME input
                |
                v
       MCP server and backend APIs
                |
                v
              Neo4j
                |
                v
       OntoFabric React workspace
```

### Packages

| Package | Responsibility |
| --- | --- |
| `frontend` | React/Vite workspace, graph explorer, visual schema designer, source sync, approvals, and S&OP views |
| `backend` | Express API, Neo4j persistence, ontology extraction, graph queries, and entity resolution |
| `mcp-server` | Official MCP TypeScript SDK server for source parsing and mock ERP/CRM retrieval |
| `shared` | Shared graph, ontology, temporal, S&OP, and primitive-property contracts |

## Prerequisites

- Node.js with npm workspaces support
- A running Neo4j instance
- An AI provider configuration if grounded natural-language graph queries are enabled
- Local Excel/PDF files for file-ingestion scenarios
- A SAP Business Accelerator Hub sandbox API, if SAP synchronization is enabled

The backend defaults to:

- API: `http://localhost:3001`
- Neo4j URI: `bolt://localhost:7687`
- Neo4j username: `neo4j`
- Neo4j password: `password`
- Neo4j database: `neo4j`

Use environment variables to override these defaults. Keep secrets in a local `.env` file; do not commit it.

For production, build and start the backend from the current source so the AI settings route is included:

```bash
npm run build --workspace @ontofabric/shared
npm run build --workspace @ontofabric/backend
npm run start --workspace @ontofabric/backend
```

Set the frontend build variable `VITE_API_URL` to the deployed backend origin when frontend and backend use different hosts. When it is omitted in a production build, the settings panel uses the current browser origin and therefore requires the frontend host to proxy `/api/*` to the backend.

### AI provider configuration

The backend uses an OpenAI-compatible client and supports OpenAI, Google Gemini, and DeepSeek. OpenAI remains the default for existing installations. Select the chat provider and model with:

```env
AI_PROVIDER=openai
AI_MODEL=gpt-4o
OPENAI_API_KEY=your_openai_key
```

Gemini and DeepSeek can be enabled by setting `AI_PROVIDER` and the matching key:

```env
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=your_gemini_key
```

```env
AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat
DEEPSEEK_API_KEY=your_deepseek_key
```

Embeddings use OpenAI by default because Gemini and DeepSeek chat endpoints do not provide the same embedding capability. Configure a separate embedding provider/model when needed with `AI_EMBEDDING_PROVIDER`, `AI_EMBEDDING_MODEL`, and that provider's API key. The active and configured providers are available from `GET /api/ai/providers`.

### SAP sandbox configuration

The Source Sync sidebar includes **Sync SAP sandbox**. Configure the backend with the SAP Business Accelerator Hub API you want to test:

```env
SAP_API_BASE_URL=https://your-sandbox-api.example.com
SAP_API_PATH=/path/to/odata/entity-set
SAP_API_KEY=your_sap_api_key
# Alternatively, use a bearer token instead of SAP_API_KEY:
# SAP_API_TOKEN=your_bearer_token
# For SAP NetWeaver sandbox endpoints that require Basic authentication:
# SAP_USERNAME=your_sap_username
# SAP_PASSWORD=your_sap_password
SAP_ENTITY_TYPE=BusinessPartner
```

The connector sends `Accept: application/json`, uses the `apikey` header when `SAP_API_KEY` is set, uses an `Authorization: Bearer` header when `SAP_API_TOKEN` is set, and uses Basic authentication when both `SAP_USERNAME` and `SAP_PASSWORD` are set. Basic authentication takes precedence over bearer authentication. It accepts either a plain JSON array or an OData response with a `value` array. Primitive fields are stored as ERP graph node properties with SAP provenance metadata.

The exact base URL and path depend on the API selected in SAP Business Accelerator Hub. The API key or token must remain in the backend environment and must never be placed in frontend variables.

If the backend reports `SAP TLS certificate is not trusted by Node`, configure the issuing CA certificate before starting Node:

```powershell
$env:NODE_EXTRA_CA_CERTS = 'C:\certificates\corporate-root-ca.pem'
npm run dev --workspace @ontofabric/backend
```

The backend starts Node with the system CA store enabled so SAP sandbox TLS certificates can be validated on supported Node versions. If your Node version does not support `--use-system-ca`, set `NODE_EXTRA_CA_CERTS` to the relevant corporate or SAP CA PEM file before starting the backend.

Do not disable TLS verification with `NODE_TLS_REJECT_UNAUTHORIZED=0` in normal development or production use.

## Run Locally

From the repository root:

```bash
npm install
npm run typecheck
npm run build
```

Initialize Neo4j indexes and constraints:

```bash
npm run db:init --workspace @ontofabric/backend
```

Seed the example S&OP graph and planning data:

```bash
npm run db:seed:sop --workspace @ontofabric/backend
npm run db:seed:planning --workspace @ontofabric/backend
```

Seed the complete scenario test dataset:

```bash
npm run db:seed:scenarios --workspace @ontofabric/backend
```

The scenario seed is repeatable and uses `TEST-*` IDs. It creates a supply-shortage path, near-duplicate customer records with a pending approval, planner-entered supplier data, historical graph records, and a PDF-originated contract linked to planning data.

Start the backend:

```bash
npm run dev --workspace @ontofabric/backend
```

Start the frontend in another terminal:

```bash
npm run dev --workspace @ontofabric/frontend
```

The Vite development server prints the local browser URL, normally `http://localhost:5173`.

The backend health check is available at `GET http://localhost:3001/health`.

## Explorer Workflow

### 1. Explore the graph

The **Explorer** tab displays ontology nodes and relationships in a React Flow canvas.

Available graph interactions include:

- Force-style radial layout for a broad relationship view.
- Dagre hierarchical layout for left-to-right dependency analysis.
- Automatic fit-to-view when data, layout, filters, or panel dimensions change.
- Extra canvas padding so nodes do not clip against the top or left edges.
- Pan, scroll zoom, draggable nodes, and a pannable/zoomable minimap.
- Explicit `Zoom In`, `Zoom Out`, `Reset View`, and `Center` actions.
- Node filtering by ID, type label, and property values.
- Entity color coding by ontology type.
- Relationship labels displayed as readable semi-transparent badges.
- Clustered high-connectivity node groups that can be expanded.
- Node selection for detail inspection.
- Node context menu access to provenance and lineage.
- Fullscreen graph mode.

The graph is loaded from `GET /api/sop/graph`, which returns the seeded S&OP graph used by the workspace.

### 2. Sync a source file

Open **Source Sync** in the left sidebar:

1. Enter a local file path.
2. Choose **Excel** or **PDF**.
3. The backend calls the matching MCP parser.
4. Parsed content is converted into source-system-agnostic ontology nodes and relationships.
5. The extracted graph is persisted to Neo4j.
6. The Explorer refreshes and displays the new data.

For SAP, select **Sync SAP sandbox** instead. The configured SAP endpoint is fetched by the backend, records are normalized as ERP nodes, persisted to Neo4j, and included in the next graph refresh.

Excel files are read across every worksheet. PDF files are converted to extracted text before ontology extraction.

### 3. Add an SME entity

In the **SME Input** section:

1. Select an entity label such as `Product`, `Supplier`, `Facility`, or `Customer`.
2. Add one or more property rows.
3. Choose each property value type: text, number, boolean, or null.
4. Edit or delete rows as needed.
5. Confirm the live schema status is valid.
6. Select **Create entity**.

The property editor validates required property names, duplicate keys, and numeric values before submission. The backend accepts primitive property values only: strings, numbers, booleans, and null.

### 4. Add an SME relationship

In **Link entities**:

1. Enter the source node ID.
2. Enter the target node ID.
3. Select a relationship such as `HAS_DEMAND`, `FOR_PRODUCT`, `SUPPLIED_BY`, or `FULFILLED_BY`.
4. Select **Create relationship**.

The relationship options combine standard S&OP relationships with relationship names already present in the loaded graph.

### 5. Ask the graph assistant

Open **Graph Assistant** beside the graph and enter a natural-language question, for example:

```text
Which products have inventory below their reorder point?
```

The assistant:

- Converts the prompt into a read-only grounded graph query.
- Executes the query against the graph.
- Returns an answer and generated Cypher.
- Highlights the source nodes used to produce the answer.

## Schema Designer Workflow

The **Schema Designer** tab provides a visual editor for domain-specific ontology schemas. It uses an interactive React Flow canvas with a palette on the left and an inspector on the right.

### 1. Add entity types

Use the palette to:

- Select **Add Custom Entity** to create an empty entity type.
- Click or drag `Product`, `Supplier`, `Facility`, `Customer`, or `Order` onto the canvas.
- Load complete industry starter sets with **Load SCOR**, **Load FIBO**, or **Load FHIR**.

Entity cards display the node label, defined properties, primary-key indicators, and required-property markers. Nodes can be moved around the canvas, and **Auto Layout** arranges them into a grid.

### 2. Edit an entity

Select an entity card to open the inspector. The inspector supports:

1. Renaming the node label.
2. Adding and removing properties.
3. Selecting `string`, `number`, `boolean`, or `date` as the primitive type.
4. Marking properties as **Primary Key** or **Required**.
5. Deleting the entity and its connected relationships.

Use **Validate Schema** to check labels and property names before saving.

### 3. Create relationships

Drag from the source handle on one entity card to the target handle on another. The relationship dialog accepts:

- A relationship name such as `STORED_AT`.
- A cardinality of `1:N`, `M:N`, or `1:1`.

Select an existing edge to edit its relationship name or cardinality in the relationship inspector. The bottom canvas toolbar also provides zoom, fit-view, auto-layout, validation, and save actions.

### 4. Generate a schema from a prompt

Enter a description in the prompt bar, for example:

```text
Create products, suppliers, and facilities with keys and storage relationships.
```

Select **Generate**. The frontend sends the request to `POST /api/schema/generate-from-prompt`, and the returned entity types are added to the canvas. When no usable AI provider key is configured, the backend returns a deterministic domain starter schema so the workflow remains available locally.

### 5. Save the visual schema

Select **Save** after validation. The backend:

- Validates unique entity IDs and labels.
- Validates relationship references and property key/required-field references.
- Creates Neo4j property indexes for defined entity properties.
- Creates Neo4j uniqueness constraints for primary-key properties.
- Persists the visual node and relationship definitions as `DomainSchema`, `SchemaNodeType`, and `SchemaRelationType` records.

Saving uses the currently selected domain context and updates the domain configuration used by ontology extraction and graph queries.

## Approvals Workflow

The **Approvals** tab displays possible duplicate entities detected by the resolution service.

For each candidate pair, reviewers can:

- Compare entity names, IDs, source systems, properties, and conflicting fields.
- Move between pending matches with previous/next controls.
- **Approve merge** when both records represent the same entity.
- **Link as alias** when records should remain distinct but related.
- **Reject match** when the candidate is not a duplicate.

Resolved items are removed from the pending queue. The backend validates every action as `MERGE`, `LINK`, or `REJECT`.

## S&OP Cockpit Workflow

The **S&OP Cockpit** tab presents the planning summary as a focused operating view.

### Summary metrics

- Forecast demand across planning periods.
- Number of inventory records below reorder point.
- Longest supplier lead time.
- Number of available work centers.

### Planning tables

- **Inventory by facility**: product/facility, on-hand quantity, and reorder point. Alert rows identify inventory below reorder point.
- **Supplier exposure**: supplier, lead time, and minimum order quantity. Long lead times are highlighted.
- **Production capacity**: work center, capacity, and unit cost.

Each table has:

- A fixed header that remains visible while the body scrolls.
- A bounded scrollable body to prevent the dashboard from being truncated by long datasets.
- A pagination footer showing the visible range and total count.
- Previous and next page controls.

The summary is loaded from `GET /api/sop/summary`.

## API Capability Map

All backend routes are served from `http://localhost:3001`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check backend availability |
| `POST` | `/api/ingest/file` | Parse Excel/PDF input, extract ontology data, and persist it |
| `GET` | `/api/ontology/graph` | Query the ontology graph, optionally at an ISO timestamp |
| `POST` | `/api/sme/entity` | Persist exactly one SME node or relationship |
| `POST` | `/api/chat/graph-query` | Run a grounded natural-language graph query |
| `POST` | `/api/schema/generate-from-prompt` | Generate entity types from a natural-language schema description |
| `POST` | `/api/schema/save` | Validate and persist a visual schema, including Neo4j indexes and uniqueness constraints |
| `GET` | `/api/resolution/pending` | Load pending entity matches |
| `POST` | `/api/resolution/approve` | Merge, link, or reject a pending match |
| `GET` | `/api/sop/graph` | Load the S&OP graph |
| `GET` | `/api/sop/summary` | Load demand, inventory, supplier, and capacity data |

Requests are validated with Zod schemas. Invalid input returns a client error with validation details. Backend failures are returned with an error message and an appropriate service status.

## MCP Tools

The MCP server uses the official TypeScript SDK and exposes these tools over stdio:

| Tool | Use |
| --- | --- |
| `parse_excel_source` | Read every worksheet and return structured row objects |
| `parse_pdf_source` | Extract text and page count from a PDF |
| `fetch_erp_records` | Return mock ERP customer or order records with optional filtering |
| `fetch_crm_contacts` | Return mock CRM contacts for an account ID |

The backend uses the file parsing tools through its MCP client. ERP and CRM tools provide a source-system integration shape that can later be replaced with live connectors.

## Data and Governance Features

- Shared graph contracts keep ingestion and graph-domain data source-system agnostic.
- Graph nodes and relationships carry valid-time and transaction-time metadata.
- Ontology graph reads support an optional `asOfTimestamp` for temporal inspection.
- The backend applies role-aware property redaction to graph responses and grounded-query source nodes.
- Neo4j indexes and constraints are initialized by the backend database script.
- Pending entity reviews are stored separately with unique pending IDs and status indexing.

## Practical Scenarios

### Scenario 1: Investigate a supply shortage

**Goal:** determine why a product may miss future demand.

1. Seed or ingest product, component, inventory, supplier, and demand data.
2. Open **S&OP Cockpit** and inspect inventory alerts.
3. Review the affected facility and reorder point.
4. Switch to **Explorer** and use Dagre layout.
5. Trace `FOR_PRODUCT`, `STORED_AT`, `SUPPLIED_BY`, and `HAS_DEMAND` relationships.
6. Ask the Graph Assistant which products have insufficient inventory and which suppliers support their components.
7. Use the minimap and Center control to navigate a larger graph.

Seeded focus: `TEST-PUMP-100` has 180 units on hand against a 500-unit safety stock and 700-unit reorder point. Its seal supplier has a 42-day lead time.

### Scenario 2: Consolidate duplicate customer records

**Goal:** clean up records from multiple source systems.

1. Ingest CRM and ERP records or load the provided mock source data.
2. Open **Approvals**.
3. Review a candidate pair and compare conflicting fields.
4. Approve a merge if the records represent one customer.
5. Link the records if they are related aliases that should remain distinct.
6. Reject false positives.
7. Return to **Explorer** to inspect the canonical graph.

Seeded focus: compare `TEST-CUSTOMER-ACME` and `TEST-CUSTOMER-ACME-DUP`, then resolve `TEST-DUP-ACME-001`.

### Scenario 3: Add planner knowledge without changing an upstream system

**Goal:** record a planner-maintained supplier or relationship.

1. Open **Explorer** and expand **Source Sync / SME Input**.
2. Select `Supplier` as the entity label.
3. Add typed properties such as `name`, `country`, and `leadTimeDays`.
4. Create the entity.
5. Add a relationship from a component to the supplier using `SUPPLIED_BY`.
6. Refresh the graph and verify the new node and edge.

Seeded focus: `TEST-PLANNER-SUPPLIER` is recorded as `SME_INPUT` and is linked to `TEST-SEAL-01` with a 14-day lead time.

### Scenario 4: Analyze a historical graph state

**Goal:** understand what the ontology looked like at a prior point in time.

1. Call `GET /api/ontology/graph?asOfTimestamp=<ISO timestamp>`.
2. Compare the returned graph with the current `/api/ontology/graph` response.
3. Use the node provenance and temporal fields to explain when data became valid and when it was recorded.
4. Use role-appropriate responses when sharing the result with different user roles.

Seeded focus: query before `2026-01-01T00:00:00.000Z` to find `TEST-PUMP-100-HISTORICAL`, then query the current date to find `TEST-PUMP-100`.

### Scenario 5: Combine PDF contracts with planning data

**Goal:** connect contract text with operational planning entities.

1. Enter the contract PDF path in Source Sync.
2. Select **PDF**.
3. Let the MCP parser extract text and the ontology service persist the resulting graph.
4. Search or filter the graph for suppliers, products, or facilities found in the contract.
5. Add SME links where extraction needs domain clarification.
6. Review the S&OP Cockpit for planning impact.

Seeded focus: inspect `TEST-CONTRACT-ACME`, which has `PDF` provenance and a safety-stock clause linked to `TEST-PUMP-100`.

## Troubleshooting

### The frontend shows no graph data

- Confirm the backend is running on port 3001.
- Check `GET /health`.
- Run the database initialization and S&OP seed commands.
- Verify Neo4j credentials and database name in `.env`.

### The S&OP cockpit is empty

Run:

```bash
npm run db:seed:planning --workspace @ontofabric/backend
```

Then refresh the browser.

### File ingestion fails

- Confirm the file path is readable by the backend process.
- Confirm the selected source type matches the file.
- For PDF input, verify the document contains extractable text.
- Check backend logs for MCP parser or ontology extraction errors.

### Graph assistant requests fail

- Confirm the backend can reach Neo4j.
- Confirm the required AI provider environment configuration exists.
- Try a shorter question using graph terms such as node labels or relationship names.

## Development Commands

```bash
# Validate all workspaces
npm run typecheck

# Build all workspaces
npm run build

# Frontend only
npm run typecheck --workspace @ontofabric/frontend
npm run build --workspace @ontofabric/frontend
npm run dev --workspace @ontofabric/frontend

# Backend only
npm run typecheck --workspace @ontofabric/backend
npm run build --workspace @ontofabric/backend
npm run dev --workspace @ontofabric/backend

# Database
npm run db:init --workspace @ontofabric/backend
npm run db:seed:sop --workspace @ontofabric/backend
npm run db:seed:planning --workspace @ontofabric/backend
```
