import { StravaActivity } from "../strava-client";
import { DateFilter, FetchOptions } from "../tools/types";

interface CachedData {
  activities: StravaActivity[];
  timestamp: number;
  dateRange?: {
    start: string;
    end: string;
  };
}

export class SmartCache {
  private allActivitiesCache: CachedData | null = null;
  private queryCache = new Map<string, CachedData>();
  private ttl: number;

  constructor(ttlSeconds: number = 86400) {
    this.ttl = ttlSeconds * 1000;
  }

  get(options: FetchOptions): StravaActivity[] | null {
    // Check if this is an all-time request
    const isAllTimeRequest = this.isAllTimeRequest(options);

    // Try to serve from all-activities cache
    if (
      this.allActivitiesCache &&
      !this.isExpired(this.allActivitiesCache.timestamp)
    ) {
      if (isAllTimeRequest) {
        console.error("Serving all-time from cache");
        return this.applyFilters(this.allActivitiesCache.activities, options);
      }

      // Check if we can serve this date range from all-time cache
      if (this.canServeFromAllTime(options)) {
        console.error("Serving subset from all-time cache");
        return this.applyFilters(this.allActivitiesCache.activities, options);
      }
    }

    // Check query-specific cache
    const queryKey = JSON.stringify(options);
    const cached = this.queryCache.get(queryKey);

    if (cached && !this.isExpired(cached.timestamp)) {
      console.error("Serving from query cache");
      return cached.activities;
    }

    return null;
  }

  set(options: FetchOptions, activities: StravaActivity[]): void {
    const queryKey = JSON.stringify(options);
    const now = Date.now();

    // If this is all-time data, cache it specially
    if (this.isAllTimeRequest(options)) {
      this.allActivitiesCache = {
        activities,
        timestamp: now,
        dateRange: {
          start:
            activities[activities.length - 1]?.start_date_local || "2000-01-01",
          end: activities[0]?.start_date_local || new Date().toISOString(),
        },
      };
    }

    // Always cache the specific query
    this.queryCache.set(queryKey, {
      activities,
      timestamp: now,
    });

    // Implement cache size limit
    if (this.queryCache.size > 50) {
      const firstKey = this.queryCache.keys().next().value ?? "";
      this.queryCache.delete(firstKey);
    }
  }

  clear(): void {
    this.allActivitiesCache = null;
    this.queryCache.clear();
  }

  private isAllTimeRequest(options: FetchOptions): boolean {
    if (!options.dateFilter) return true;

    const { year, month, before, after } = options.dateFilter;

    // No date restrictions
    if (!year && !month && !before && !after) return true;

    // Check if it's essentially "all time" (e.g., after 2000)
    if (after && new Date(after) <= new Date("2000-01-01") && !before)
      return true;

    return false;
  }

  private canServeFromAllTime(options: FetchOptions): boolean {
    if (!this.allActivitiesCache || !options.dateFilter) return false;

    // For now, we can serve any date-filtered request from all-time cache
    // You could add more sophisticated logic here
    return true;
  }

  private applyFilters(
    activities: StravaActivity[],
    options: FetchOptions
  ): StravaActivity[] {
    let filtered = [...activities];

    // Apply date filter
    if (options.dateFilter) {
      const { startDate, endDate } = this.getDateRangeFromFilter(
        options.dateFilter
      );
      filtered = filtered.filter((activity) => {
        const activityDate = activity.start_date_local.split("T")[0];
        return activityDate >= startDate && activityDate <= endDate;
      });
    }

    // Apply activity type filter
    if (options.activityType) {
      filtered = filtered.filter(
        (activity) =>
          activity.type === options.activityType ||
          activity.sport_type === options.activityType
      );
    }

    // Apply other filters
    if (options.includeManual === false) {
      filtered = filtered.filter((activity) => !activity.manual);
    }

    if (options.includePrivate === false) {
      filtered = filtered.filter((activity) => !activity.private);
    }

    return filtered;
  }

  private getDateRangeFromFilter(filter: DateFilter): {
    startDate: string;
    endDate: string;
  } {
    // Copy your existing getDateRangeFromFilter logic here
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (filter.year && filter.month) {
      startDate = new Date(filter.year, filter.month - 1, 1);
      endDate = new Date(filter.year, filter.month, 0);
    } else if (filter.year) {
      startDate = new Date(filter.year, 0, 1);
      endDate = new Date(filter.year, 11, 31);
    } else {
      startDate = new Date(2000, 0, 1);
      endDate = now;
    }

    if (filter.before) endDate = new Date(filter.before);
    if (filter.after) startDate = new Date(filter.after);

    return {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    };
  }

  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.ttl;
  }
}
