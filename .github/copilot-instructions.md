# OntoFabric development guidance

- Shared contracts live in `shared/types.ts` and should be imported by backend, MCP server, and frontend packages.
- The MCP server uses the official TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP server transport configuration follows the official documentation: https://modelcontextprotocol.io/
- Keep ingestion and graph-domain contracts source-system agnostic.
