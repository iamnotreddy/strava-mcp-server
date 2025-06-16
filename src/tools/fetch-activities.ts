import { StravaClient, StravaActivity } from "../strava-client";
import { SmartCache } from "../utils/smart-cache";
import { DateFilter, FetchOptions } from "./types";

// Create a cache instance
const smartCache = new SmartCache(86400);

function getDateRangeFromFilter(filter: DateFilter): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  if (filter.year && filter.month) {
    // Specific month of a year
    startDate = new Date(filter.year, filter.month - 1, 1);
    endDate = new Date(filter.year, filter.month, 0); // Last day of the month
  } else if (filter.year) {
    // Entire year
    startDate = new Date(filter.year, 0, 1);
    endDate = new Date(filter.year, 11, 31);
  } else {
    // Default to all time if no specific dates
    startDate = new Date(2000, 0, 1); // Strava wasn't around before 2000
    endDate = now;
  }

  // Override with explicit before/after if provided
  if (filter.before) {
    endDate = filter.before;
  }
  if (filter.after) {
    startDate = filter.after;
  }

  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

export async function fetchActivities(
  options: FetchOptions = {}
): Promise<StravaActivity[]> {
  const client = new StravaClient();

  // Generate cache key based on options
  const cacheKey = JSON.stringify(options);

  // Try to get from smart cache first
  const cachedActivities = smartCache.get(options);
  if (cachedActivities) {
    console.error("Using smart cached activities data");
    return cachedActivities;
  }

  console.error("Cache miss - fetching fresh activities data from Strava API");

  // If not in cache, fetch from Strava
  let activities: StravaActivity[];

  if (options.dateFilter) {
    const { startDate, endDate } = getDateRangeFromFilter(options.dateFilter);
    console.error(`Fetching activities from ${startDate} to ${endDate}...`);
    activities = await client.fetchActivitiesByDateRange(startDate, endDate);
  } else {
    activities = await client.fetchAllActivities();
  }

  // Apply filters
  if (options.activityType) {
    activities = activities.filter(
      (activity) =>
        activity.type === options.activityType ||
        activity.sport_type === options.activityType
    );
  }

  if (options.includeManual === false) {
    activities = activities.filter((activity) => !activity.manual);
  }

  if (options.includePrivate === false) {
    activities = activities.filter((activity) => !activity.private);
  }

  // Store in cache before returning
  smartCache.set(options, activities);

  return activities;
}

export async function fetchActivityDetails(
  activityId: number
): Promise<StravaActivity> {
  const client = new StravaClient();
  return await client.fetchActivityById(activityId);
}

export async function fetchRecentActivities(
  days: number = 7
): Promise<StravaActivity[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const client = new StravaClient();
  return await client.fetchActivitiesByDateRange(
    startDate.toISOString().split("T")[0],
    endDate.toISOString().split("T")[0]
  );
}
