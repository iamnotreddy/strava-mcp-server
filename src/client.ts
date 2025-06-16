// src/client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is required");
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

class StravaClient {
  private mcp: Client;
  private anthropic: Anthropic;
  private transport: StdioClientTransport | null = null;
  private tools: MCPTool[] = [];

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
    // Increase the timeout to 5 minutes (300000ms)
    this.mcp = new Client({
      name: "strava-mcp-client",
      version: "1.0.0",
      requestTimeout: 300000,
    });
  }

  async connect(serverPath: string) {
    console.error("Connecting to MCP server...");

    // Create transport that spawns the server
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env: process.env as Record<string, string>,
    });

    // Connect to the server
    await this.mcp.connect(this.transport);
    console.error("Connected to MCP server successfully!");

    // List available tools
    const { tools } = await this.mcp.listTools();
    console.error("\nAvailable tools:");
    this.tools = tools;
    tools.forEach((tool: MCPTool) => {
      console.error(
        `  - ${tool.name}: ${tool.description || "No description"}`
      );
    });
  }

  async query(question: string): Promise<string> {
    const messages: MessageParam[] = [];

    // Format tools for Anthropic API
    const formattedTools = this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      input_schema: {
        type: "object" as const,
        properties: tool.inputSchema.properties || {},
        required: tool.inputSchema.required || [],
      },
    }));

    // Initial message with the question
    const initialResponse = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: question,
        },
      ],
      tools: formattedTools,
      system: `You are an AI assistant helping users analyze their Strava data. You have access to tools that can fetch and analyze Strava activities. Use these tools to answer the user's questions about their running data, fastest times, lap analysis, etc. Current date: ${
        new Date().toISOString().split("T")[0]
      }`,
    });

    // Build conversation history
    messages.push({
      role: "user",
      content: question,
    });

    let assistantMessage = initialResponse;

    // Handle tool calls in a loop
    while (true) {
      const toolUses = assistantMessage.content.filter(
        (c) => c.type === "tool_use"
      );

      if (toolUses.length === 0) {
        // No more tool calls, return the final response
        const textContent = assistantMessage.content.find(
          (c) => c.type === "text"
        );
        return textContent?.text || "No response generated";
      }

      // Add assistant's message to history
      messages.push({
        role: "assistant",
        content: assistantMessage.content,
      });

      // Execute all tool calls
      const toolResults = [];
      for (const toolUse of toolUses) {
        if (toolUse.type === "tool_use") {
          console.error(`\nExecuting tool: ${toolUse.name}`);
          console.error(`Arguments: ${JSON.stringify(toolUse.input, null, 2)}`);

          try {
            const result = (await this.mcp.callTool({
              name: toolUse.name,
              arguments: toolUse.input as Record<string, unknown>,
            })) as MCPToolResult;

            toolResults.push({
              type: "tool_result" as const,
              tool_use_id: toolUse.id,
              content: result.content[0]?.text || "No result",
              is_error: result.isError || false,
            });
          } catch (error) {
            console.error(`Tool execution error: ${error}`);
            toolResults.push({
              type: "tool_result" as const,
              tool_use_id: toolUse.id,
              content: `Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
              is_error: true,
            });
          }
        }
      }

      // Add tool results to messages
      messages.push({
        role: "user",
        content: toolResults,
      });

      // Get next response from Claude
      assistantMessage = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        messages,
        tools: formattedTools,
      });
    }
  }

  async disconnect() {
    await this.mcp.close();
    await this.transport?.close();
  }

  async startChat() {
    console.log("\n🏃 Strava MCP Client Started!");
    console.log(
      "Ask questions about your Strava data or type 'quit' to exit.\n"
    );
    console.log("Example questions:");
    console.log("  - What are my 5 fastest runs?");
    console.log("  - Show me my fastest mile splits");
    console.log("  - Analyze my running performance this year\n");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "Query> ",
    });

    rl.prompt();

    rl.on("line", async (line) => {
      const query = line.trim();

      if (query.toLowerCase() === "quit" || query.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      if (query) {
        try {
          console.log("\nProcessing...");
          const response = await this.query(query);
          console.log("\n" + response + "\n");
        } catch (error) {
          console.error(
            "\nError:",
            error instanceof Error ? error.message : error
          );
          console.error("\n");
        }
      }

      rl.prompt();
    });

    rl.on("close", async () => {
      console.log("\nDisconnecting...");
      await this.disconnect();
      console.log("Goodbye! 👋");
      process.exit(0);
    });
  }
}

// Main execution
async function main() {
  // Default to dist/index.js if no path provided
  const serverPath = process.argv[2] || "dist/index.js";

  console.log(`Starting client with server at: ${serverPath}`);

  const client = new StravaClient();
  try {
    await client.connect(serverPath);
    await client.startChat();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
