#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { logger } from './utils/logger.js';

const server = new McpServer({
  name: 'vespr-mcp-server',
  version: '0.1.0',
});

// Register all tools
registerTools(server);

// Connect via stdio for Claude Desktop integration
const transport = new StdioServerTransport();
await server.connect(transport);

logger.info('server_started', { transport: 'stdio', version: '0.1.0' });
