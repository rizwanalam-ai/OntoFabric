# OntoFabric Application Guide

OntoFabric is an enterprise ontology and knowledge-graph workspace for combining operational data, curated subject-matter-expert input, entity resolution, and cross-domain business activity in one interface.

The application has four workspace areas and an MCP integration layer:

- **Explorer**: inspect the ontology graph, ingest source files, add SME entities and relationships, and ask grounded graph questions.
- **Schema Designer**: visually define entity types, properties, primary keys, required fields, and relationships before saving the schema to Neo4j.
- **Approvals**: review and resolve possible duplicate entities before they become canonical graph data.
- **Business Cockpit**: review graph coverage, connected entities, source-system representation, and recent sync health across domains.
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
| `frontend` | React/Vite workspace, graph explorer, visual schema designer, source sync, approvals, and business cockpit |
| `backend` | Express API, Neo4j persistence, ontology extraction, graph queries, and entity resolution |
| `mcp-server` | Official MCP TypeScript SDK server for source parsing |
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

### Business source configuration

Configure SAP, PostgreSQL, Snowflake, HubSpot, monday.com, Salesforce, and Odoo from the **Data Sources** workspace page. Credentials are encrypted in `backend/data/ontofabric_config.db`; these connectors require an active saved connection and do not read their credentials from `.env`. From **Explorer > Add Data Source > CRM & ERP**, sync SAP, HubSpot, monday.com, Salesforce, or Odoo.

Use an SAP Business Accelerator Hub endpoint, a HubSpot private-app access token, a monday.com API token and board ID, a Salesforce OAuth access token with instance URL/object API name, or an Odoo URL/database/user/API key/model. Connector accounts should be restricted to read-only permissions needed for the selected object/model.

Provider endpoints are fetched server-side. SAP supports API key, bearer, and Basic authentication. HubSpot uses the CRM objects API, monday.com reads items from the selected board, Salesforce reads the configured object using its REST query endpoint, and Odoo uses JSON-RPC `authenticate` and `search_read` calls.

If the backend reports `SAP TLS certificate is not trusted by Node`, configure the issuing CA certificate before starting Node:

```powershell
$env:NODE_EXTRA_CA_CERTS = 'C:\certificates\corporate-root-ca.pem'
npm run dev --workspace @ontofabric/backend
```

The backend starts Node with the system CA store enabled so SAP sandbox TLS certificates can be validated on supported Node versions. If your Node version does not support `--use-system-ca`, set `NODE_EXTRA_CA_CERTS` to the relevant corporate or SAP CA PEM file before starting the backend.

Do not disable TLS verification with `NODE_TLS_REJECT_UNAUTHORIZED=0` in normal development or production use.

### Databricks sync configuration

Add a Databricks connection in **Data Sources** with workspace hostname, SQL warehouse HTTP path, token, and optional default catalog/schema. Then open **Add Data Source > Cloud Warehouses**, enter a table name, primary-key column, and entity label, and select **Sync Databricks**. For the Databricks sample customer table shown in Catalog Explorer, use `samples.tpch.customer` and primary key `c_custkey`. An unqualified name uses the saved default catalog and schema. The backend reads up to 10,000 rows through the Databricks SQL Statement Execution API.

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

The graph is loaded from `GET /api/ontology/graph` and, for the supply-chain domain, `GET /api/sop/graph`. Both endpoints return only records already present in the database.

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

## Business Cockpit

The **Business Cockpit** gives a cross-domain view of the ontology graph and source-ingestion health. Its domain selector filters graph and sync data to Supply Chain, Finance, Healthcare, HR & Organization, Custom, or all domains.

The summary shows entity and relationship counts, the share of entities connected to another entity, and the recent sync success rate. Entity coverage is grouped by type and domain, source systems are counted from graph provenance, and the activity table shows recent sync outcomes and imported record counts.

Graph metrics come from `GET /api/ontology/graph`. Sync activity uses `GET /api/audit/syncs?days=30`; no planning-specific seed data is required. S&OP entities remain available as one supported business domain in the graph.

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
| `POST` | `/api/sync/databricks` | Sync a Databricks SQL warehouse table into the ontology graph |
| `POST` | `/api/integrations/hubspot/sync` | Sync the configured HubSpot object into the graph |
| `POST` | `/api/integrations/monday/sync` | Sync items from the configured monday.com board |
| `POST` | `/api/integrations/salesforce/sync` | Sync the configured Salesforce object |
| `POST` | `/api/integrations/odoo/sync` | Sync the configured Odoo model |
| `GET` | `/api/audit/syncs?days=5` | Load recent source-sync audit records with counts, status, timing, and errors |
| `GET` | `/api/relationships/auto-linked-stats` | Count app-generated relationships grouped by source and relationship type |

### Cross-source relationship linking

Set `CROSS_SOURCE_LINKS` in the backend environment to a JSON array of mappings. A mapping runs after records with the configured source label are ingested. Node labels and relationship types must be valid Cypher identifiers; key-property names are parameterized.

```env
CROSS_SOURCE_LINKS=[{"sourceNodeLabel":"PurchaseOrder","sourceKeyProperty":"vendor_sap_id","targetNodeLabel":"Supplier","targetKeyProperty":"id","relationshipType":"ISSUED_BY","sourceName":"POSTGRES_TO_SAP_LINKER"}]
```

The source node is found by its ingested `id`; its configured foreign-reference property is matched against the configured target node property. Created relationships are marked with `establishedByApp`, `linkedFromSource`, and `relationshipType`. The stats endpoint returns a `stats` array containing `linkedFromSource`, `relationshipType`, and `count` values.

Requests are validated with Zod schemas. Invalid input returns a client error with validation details. Backend failures are returned with an error message and an appropriate service status.

## Data Source Administration

Open **Data Sources** in the workspace to add and manage SAP, PostgreSQL, Snowflake, Databricks, HubSpot, monday.com, Salesforce, and Odoo connections. The backend stores connection records in `backend/data/ontofabric_config.db`; credentials are encrypted with AES-256-GCM before they are written to SQLite. The browser never receives saved secret values. Leave a secret field blank when editing to retain its current value.

Set a persistent 32-byte encryption key in the backend environment before saving configurations. For example, generate a hex-encoded key with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set the generated value as `CONFIG_ENCRYPTION_KEY` in the backend environment. Also set a separate, high-entropy `DATA_SOURCE_ADMIN_KEY`; the Data Sources page prompts for this key and holds it only in memory while open. Back up the encryption key securely: losing or changing it makes saved credentials unreadable. Do not commit either key or store them in frontend environment variables. These eight source types use active saved SQLite configurations; their connection credentials are not read from `.env`. Only one saved connection per source type can be active.

The admin API is available at `GET/POST /api/admin/data-sources` and `PUT/PATCH/DELETE /api/admin/data-sources/:id`; it requires `DATA_SOURCE_ADMIN_KEY` in the `x-admin-key` header. Put the app behind HTTPS and a trusted authentication layer before exposing it outside a local development environment.

## MCP Tools

The MCP server uses the official TypeScript SDK and exposes these tools over stdio:

| Tool | Use |
| --- | --- |
| `parse_excel_source` | Read every worksheet and return structured row objects |
| `parse_pdf_source` | Extract text and page count from a PDF |
The backend uses the file parsing tools through its MCP client. Graph records are created only from data you ingest or enter.

## Data and Governance Features

- Shared graph contracts keep ingestion and graph-domain data source-system agnostic.
- Graph nodes and relationships carry valid-time and transaction-time metadata.
- Ontology graph reads support an optional `asOfTimestamp` for temporal inspection.
- The backend applies role-aware property redaction to graph responses and grounded-query source nodes.
- Neo4j indexes and constraints are initialized by the backend database script.
- Pending entity reviews are stored separately with unique pending IDs and status indexing.

## Start With An Empty Graph

Database initialization creates indexes and constraints only; it does not add graph records. Ingest a source file or create an entity in **Explorer** to add graph data. The Business Cockpit reports zero coverage until records are loaded; Approvals remains empty until candidate matches exist.

## Troubleshooting

### The frontend shows no graph data

- Confirm the backend is running on port 3001.
- Check `GET /health`.
- Run database initialization to create indexes and constraints; ingest or enter graph records separately.
- Verify Neo4j credentials and database name in `.env`.

### The Business Cockpit has no activity

Check the selected domain and ingest data from **Explorer**. The cockpit shows graph coverage from current ontology records and sync activity recorded during the last 30 days.

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
```
