import express, { Request, Response, RequestHandler } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { InsightPayload, ErrorResponse } from "@strava-mcp/shared-types";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

const handleInsight: RequestHandler = async (req, res) => {
  try {
    const payload = req.body as InsightPayload;
    const { question } = payload;

    if (!question || typeof question !== "string") {
      const errorResponse: ErrorResponse = {
        status: 400,
        message: "Invalid request body",
        details: "Question is required and must be a string",
      };
      res.status(400).json(errorResponse);
      return;
    }

    // TODO: Implement actual insight generation
    res.json({ answer: "This is a placeholder response" });
  } catch (error) {
    const errorResponse: ErrorResponse = {
      status: 500,
      message: "Internal server error",
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
