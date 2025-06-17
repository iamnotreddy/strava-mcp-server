// src/tools/types.ts
export interface RunAnalysis {
  id: number;
  name: string;
  date: string;
  distance_miles: number;
  duration_minutes: number;
  pace_per_mile: string;
  pace_seconds: number;
  elevation_gain_feet: number;
  average_heartrate?: number;
  average_speed_mph: number;
  max_speed_mph: number;
  calories?: number;
  weather?: {
    temperature?: number;
    humidity?: number;
    wind_speed?: number;
  };
}

export interface RunStats {
  totalRuns: number;
  totalDistance: number;
  totalDuration: number;
  totalElevation: number;
  averageDistance: number;
  averagePace: string;
  averageHeartrate?: number;
  longestRun: RunAnalysis | null;
  fastestPace: RunAnalysis | null;
  mostElevation: RunAnalysis | null;
  weeklyAverage: number;
  monthlyAverage: number;
}

export interface MonthlyStats {
  [key: string]: {
    month: string;
    year: number;
    runs: number;
    distance: number;
    duration: number;
    elevation: number;
    averagePace: string;
    longestRun?: RunAnalysis;
    fastestRun?: RunAnalysis;
  };
}

export interface DateFilter {
  year?: number;
  month?: number;
  before?: Date;
  after?: Date;
}

export interface FetchOptions {
  dateFilter?: DateFilter;
  activityType?: string;
  includeManual?: boolean;
  includePrivate?: boolean;
}

export interface WeekStats {
  weekNumber: number; // 1-53
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  numRuns: number;
  totalMiles: number;
  totalDuration: number;
  totalElevation: number;
  daysRan: number; // Number of unique days with runs
  averagePace: string;
  longestRun?: RunAnalysis;
  fastestRun?: RunAnalysis;
  runs: RunAnalysis[]; // All runs in this week
}

export interface EnhancedMonthStats {
  month: string; // Month name (e.g., "January")
  year: number;
  totalRuns: number;
  totalMiles: number;
  totalDuration: number;
  totalElevation: number;
  daysRan: number; // Number of unique days with runs
  averagePace: string;
  longestRun?: RunAnalysis;
  fastestRun?: RunAnalysis;
  weeklyStats: {
    [weekNumber: number]: WeekStats;
  };
  runs: RunAnalysis[]; // All runs in this month
}

export interface EnhancedMonthlyStats {
  [key: string]: EnhancedMonthStats; // key format: "YYYY-MM"
}
