// src/client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import { InsightPayload } from "@strava-mcp/shared-types";
import dotenv from "dotenv";
import * as readline from "readline";

dotenv.config({ path: "../../.env" });

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
  private serverPath: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private reconnectDelay: number = 1000; // 1 second

  constructor(serverPath: string) {
    this.serverPath = serverPath;
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
    this.mcp = new Client({
      name: "strava-mcp-client",
      version: "1.0.0",
      requestTimeout: 300000, // 5 minutes
    });
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    console.error("Connecting to MCP server...");

    try {
      // Create transport that spawns the server
      this.transport = new StdioClientTransport({
        command: "node",
        args: [this.serverPath],
        env: process.env as Record<string, string>,
      });

      // Connect to the server
      await this.mcp.connect(this.transport);

      // List available tools
      const { tools } = await this.mcp.listTools();
      this.tools = tools;

      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.error("Connected to MCP server successfully!");
    } catch (error) {
      console.error("Failed to connect to MCP server:", error);
      throw error;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error("Max reconnection attempts reached");
    }

    this.reconnectAttempts++;
    console.error(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );

    try {
      await this.disconnect();
      await new Promise((resolve) =>
        setTimeout(resolve, this.reconnectDelay * this.reconnectAttempts)
      );
      await this.connect();
    } catch (error) {
      console.error("Reconnection failed:", error);
      throw error;
    }
  }

  async getInsight(question: string): Promise<InsightPayload> {
    try {
      await this.ensureConnected();
      return await this.query(question);
    } catch (error) {
      console.error("Error in getInsight:", error);

      // Try to reconnect if we're not connected
      if (!this.isConnected) {
        await this.reconnect();
        return await this.query(question);
      }

      throw error;
    }
  }

  async query(question: string): Promise<InsightPayload> {
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
        return {
          question,
          answer: textContent?.text || "No response generated",
          supportingActivities: [],
        };
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
    try {
      await this.mcp.close();
      await this.transport?.close();
    } catch (error) {
      console.error("Error during disconnect:", error);
    } finally {
      this.isConnected = false;
    }
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

    rl.on("line", async (query) => {
      if (query.toLowerCase() === "quit") {
        await this.disconnect();
        rl.close();
        return;
      }

      try {
        console.log("\nProcessing...");
        const response = await this.getInsight(query);
        console.log("\n" + response.answer + "\n");
        if (response.supportingActivities.length > 0) {
          console.log("Supporting activities:");
          response.supportingActivities.forEach((activity) => {
            console.log(`- ${activity.name} (${activity.startDate})`);
          });
        }
      } catch (error) {
        console.error(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      rl.prompt();
    });
  }
}

// Export a singleton instance
let clientInstance: StravaClient | null = null;

export function getMCPClient(
  serverPath: string = "dist/index.js"
): StravaClient {
  if (!clientInstance) {
    clientInstance = new StravaClient(serverPath);
  }
  return clientInstance;
}

// Main execution
async function main() {
  const serverPath = process.argv[2] || "dist/index.js";
  console.log(`Starting client with server at: ${serverPath}`);

  const client = getMCPClient(serverPath);
  try {
    await client.connect();
    await client.startChat();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
