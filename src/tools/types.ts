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
