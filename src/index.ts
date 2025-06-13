// src/index.ts - Enhanced MCP Server with better error handling and logging
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { fetchActivities } from "./tools/fetch-activities";
import {
  analyzeRuns,
  getFastestRuns,
  getLongestRuns,
} from "./tools/analyze-runs";
import { z } from "zod";
import { StravaClient } from "./strava-client";

const server = new Server(
  {
    name: "mcp-strava-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {
        get_fastest_activities: true,
        get_activity_laps: true,
        find_fastest_laps: true,
      },
    },
  }
);

// Conversion constants
const METERS_TO_MILES = 0.000621371; // Direct conversion from meters to miles
const METERS_PER_SEC_TO_MPH = 2.23694;

// New tool schemas
const GetFastestActivitiesSchema = z.object({
  count: z.number().default(5),
  minDistance: z.number().default(1).describe("Minimum distance in miles"),
  year: z.number().optional(),
  month: z.number().optional().describe("Month (1-12)"),
  before: z
    .string()
    .optional()
    .describe("Filter activities before this date (YYYY-MM-DD)"),
  after: z
    .string()
    .optional()
    .describe("Filter activities after this date (YYYY-MM-DD)"),
});

const GetActivityLapsSchema = z.object({
  activity_ids: z.array(z.number()),
  target_distance_km: z.number().default(1.609),
  count: z.number().default(5),
});

const FindFastestLapsSchema = z.object({
  activity_count: z.number().default(5),
  lap_count: z.number().default(5),
  year: z.number().optional(),
});

const GetLongestActivitiesSchema = z.object({
  count: z.number().default(5),
  year: z.number().optional(),
  month: z.number().optional().describe("Month (1-12)"),
  before: z
    .string()
    .optional()
    .describe("Filter activities before this date (YYYY-MM-DD)"),
  after: z
    .string()
    .optional()
    .describe("Filter activities after this date (YYYY-MM-DD)"),
});

// Tool definitions
const tools: Tool[] = [
  {
    name: "get_fastest_activities",
    description: "Get the N fastest activities from your Strava history",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of fastest activities to return",
          default: 5,
        },
        minDistance: {
          type: "number",
          description: "Minimum distance in miles to consider",
          default: 1,
        },
        year: {
          type: "number",
          description: "Optional year to filter activities",
        },
        month: {
          type: "number",
          description: "Optional month (1-12) to filter activities",
        },
        before: {
          type: "string",
          description: "Filter activities before this date (YYYY-MM-DD)",
        },
        after: {
          type: "string",
          description: "Filter activities after this date (YYYY-MM-DD)",
        },
      },
    },
  },
  {
    name: "get_longest_activities",
    description: "Get the N longest activities from your Strava history",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of longest activities to return",
          default: 5,
        },
        year: {
          type: "number",
          description: "Optional year to filter activities",
        },
        month: {
          type: "number",
          description: "Optional month (1-12) to filter activities",
        },
        before: {
          type: "string",
          description: "Filter activities before this date (YYYY-MM-DD)",
        },
        after: {
          type: "string",
          description: "Filter activities after this date (YYYY-MM-DD)",
        },
      },
    },
  },
  {
    name: "get_activity_laps",
    description:
      "Get lap data from specific activities, filtered by target distance",
    inputSchema: {
      type: "object",
      properties: {
        activity_ids: {
          type: "array",
          items: { type: "number" },
          description: "List of activity IDs to analyze",
        },
        target_distance_km: {
          type: "number",
          description:
            "Target lap distance in kilometers (default: 1.609 for 1 mile)",
          default: 1.609,
        },
        count: {
          type: "number",
          description: "Number of fastest laps to return",
          default: 5,
        },
      },
      required: ["activity_ids"],
    },
  },
  {
    name: "find_fastest_laps",
    description: "Find the fastest splits/laps from your fastest activities",
    inputSchema: {
      type: "object",
      properties: {
        activity_count: {
          type: "number",
          description: "Number of fastest activities to analyze",
          default: 5,
        },
        lap_count: {
          type: "number",
          description: "Number of fastest splits to return",
          default: 5,
        },
        year: {
          type: "number",
          description: "Optional year to filter activities",
        },
      },
    },
  },
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "get_longest_activities") {
      const params = GetLongestActivitiesSchema.parse(args);
      const dateFilter: any = {};

      if (params.year) dateFilter.year = params.year;
      if (params.month) dateFilter.month = params.month;
      if (params.before) dateFilter.before = new Date(params.before);
      if (params.after) dateFilter.after = new Date(params.after);

      const activities = await fetchActivities(
        Object.keys(dateFilter).length > 0 ? { dateFilter } : {}
      );
      const { runs } = analyzeRuns(activities);

      // Use the getLongestRuns function from analyze-runs.ts
      const longestRuns = getLongestRuns(runs, params.count);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                activities: longestRuns.map((run, index) => ({
                  rank: index + 1,
                  id: run.id,
                  name: run.name,
                  date: run.date,
                  distance_miles: run.distance_miles,
                  pace_per_mile: run.pace_per_mile,
                  average_heartrate: run.average_heartrate,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "get_fastest_activities") {
      const params = GetFastestActivitiesSchema.parse(args);
      const dateFilter: any = {};

      if (params.year) dateFilter.year = params.year;
      if (params.month) dateFilter.month = params.month;
      if (params.before) dateFilter.before = new Date(params.before);
      if (params.after) dateFilter.after = new Date(params.after);

      const activities = await fetchActivities(
        Object.keys(dateFilter).length > 0 ? { dateFilter } : {}
      );
      const { runs } = analyzeRuns(activities);
      const fastestRuns = getFastestRuns(
        runs,
        params.count,
        params.minDistance
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                activities: fastestRuns.map((run, index) => ({
                  rank: index + 1,
                  id: run.id,
                  name: run.name,
                  date: run.date,
                  distance_miles: run.distance_miles,
                  pace_per_mile: run.pace_per_mile,
                  average_heartrate: run.average_heartrate,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "get_activity_laps") {
      const params = GetActivityLapsSchema.parse(args);
      const stravaClient = new StravaClient();
      const allLaps = [];

      for (const activityId of params.activity_ids) {
        try {
          const laps = await stravaClient.fetchActivityLaps(activityId);
          const targetDistanceMiles = params.target_distance_km * 0.621371;

          const analyzedLaps = laps.map((lap) => {
            const distanceMiles = lap.distance * METERS_TO_MILES;
            const durationMinutes = lap.moving_time / 60;
            const paceSecondsPerMile = lap.moving_time / distanceMiles;
            const paceMinutes = Math.floor(paceSecondsPerMile / 60);
            const paceSeconds = Math.round(paceSecondsPerMile % 60);

            return {
              lap_id: lap.id,
              activity_id: activityId,
              distance_miles: parseFloat(distanceMiles.toFixed(2)),
              duration_minutes: parseFloat(durationMinutes.toFixed(2)),
              pace_per_mile: `${paceMinutes}:${paceSeconds
                .toString()
                .padStart(2, "0")}`,
              pace_seconds: paceSecondsPerMile,
              average_speed_mph: parseFloat(
                (lap.average_speed * METERS_PER_SEC_TO_MPH).toFixed(2)
              ),
              average_heartrate: lap.average_heartrate,
            };
          });

          // Filter laps close to target distance
          const targetLaps = analyzedLaps.filter((lap) => {
            const distanceDiff = Math.abs(
              lap.distance_miles - targetDistanceMiles
            );
            return distanceDiff / targetDistanceMiles <= 0.05;
          });

          allLaps.push(...targetLaps);
        } catch (error) {
          console.error(
            `Error fetching laps for activity ${activityId}:`,
            error
          );
        }
      }

      // Sort by pace and return top results
      const fastestLaps = allLaps
        .sort((a, b) => a.pace_seconds - b.pace_seconds)
        .slice(0, params.count);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                laps: fastestLaps.map((lap, index) => ({
                  rank: index + 1,
                  ...lap,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "find_fastest_laps") {
      const params = FindFastestLapsSchema.parse(args);

      // First get fastest activities
      const activities = await fetchActivities(
        params.year ? { dateFilter: { year: params.year } } : {}
      );
      console.error(`Fetched ${activities.length} total activities`);

      const { runs } = analyzeRuns(activities);
      console.error(`Found ${runs.length} running activities`);

      const fastestRuns = getFastestRuns(runs, params.activity_count);

      // Then get laps from those activities
      const stravaClient = new StravaClient();
      const allLaps = [];

      for (const run of fastestRuns) {
        try {
          const laps = await stravaClient.fetchActivityLaps(run.id);

          const analyzedLaps = laps.map((lap) => {
            const distanceMiles = lap.distance * 0.000621371;
            const durationMinutes = lap.moving_time / 60;
            const paceSecondsPerMile = lap.moving_time / distanceMiles;
            const paceMinutes = Math.floor(paceSecondsPerMile / 60);
            const paceSeconds = Math.round(paceSecondsPerMile % 60);

            return {
              lap_id: lap.id,
              activity: {
                id: run.id,
                name: run.name,
                date: run.date,
                total_distance_miles: run.distance_miles,
                total_pace_per_mile: run.pace_per_mile,
              },
              lap_stats: {
                distance_miles: parseFloat(distanceMiles.toFixed(2)),
                duration_minutes: parseFloat(durationMinutes.toFixed(2)),
                pace_per_mile: `${paceMinutes}:${paceSeconds
                  .toString()
                  .padStart(2, "0")}`,
                pace_seconds: paceSecondsPerMile,
                average_heartrate: lap.average_heartrate,
              },
            };
          });

          allLaps.push(...analyzedLaps);
        } catch (error) {
          console.error(`Error fetching laps for activity ${run.id}:`, error);
        }
      }

      // Sort by pace and return top results
      const fastestLaps = allLaps
        .sort((a, b) => a.lap_stats.pace_seconds - b.lap_stats.pace_seconds)
        .slice(0, params.lap_count);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                analyzed_activities: fastestRuns.length,
                total_laps_analyzed: allLaps.length,
                laps: fastestLaps.map((lap, index) => ({
                  rank: index + 1,
                  ...lap,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : "Unknown error",
              tool: name,
              arguments: args,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  console.error("Starting MCP Strava Server...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Strava Server is running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
