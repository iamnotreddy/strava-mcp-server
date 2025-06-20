import express, { Request, Response, RequestHandler } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { InsightPayload, ErrorResponse } from "@strava-mcp/shared-types";
import { getMCPClient } from "@strava-mcp/mcp-server";
import path from "path";

// Load environment variables from root directory
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const app = express();
const port = process.env.PORT || 3001;

// Initialize MCP client
const mcpClient = getMCPClient(
  path.resolve(__dirname, "../../mcp-server/dist/index.js")
);

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

const handleInsight: RequestHandler = async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string") {
      const errorResponse: ErrorResponse = {
        status: 400,
        message: "Invalid request body",
        details: "Question is required and must be a string",
      };
      res.status(400).json(errorResponse);
      return;
    }

    // Get insight from MCP client
    const payload = await mcpClient.getInsight(question);
    res.json(payload);
  } catch (error) {
    console.error("Error generating insight:", error);
    const errorResponse: ErrorResponse = {
      status: 500,
      message: "Error generating insight",
      details:
        error instanceof Error ? error.message : "Unknown error occurred",
    };
    res.status(500).json(errorResponse);
  }
};

app.post("/api/insight", handleInsight);

// Start server
app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
