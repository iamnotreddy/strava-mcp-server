import { StravaActivity, StravaLap } from "../strava-client";
import {
  RunAnalysis,
  RunStats,
  MonthlyStats,
  EnhancedMonthlyStats,
  EnhancedMonthStats,
  WeekStats,
} from "./types";

// Conversion constants
const METERS_TO_MILES = 0.000621371; // Direct conversion from meters to miles
const METERS_TO_FEET = 3.28084;
const METERS_PER_SEC_TO_MPH = 2.23694;
const MIN_RUN_MINUTES = 4; // Minimum 4 minutes
const MIN_RUN_MILES = 1; // Minimum 1 mile

// Helper function to format pace properly
function formatPace(paceSeconds: number): string {
  const totalMinutes = Math.floor(paceSeconds / 60);
  const remainingSeconds = Math.round(paceSeconds % 60);
  // Handle the case where seconds round up to 60
  if (remainingSeconds === 60) {
    return `${totalMinutes + 1}:00`;
  }
  return `${totalMinutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function analyzeRuns(activities: StravaActivity[]): {
  totalRuns: number;
  runs: RunAnalysis[];
} {
  const runs = activities
    .filter(
      (activity) =>
        (activity.type === "Run" ||
          activity.sport_type === "Run" ||
          activity.type === "VirtualRun" ||
          activity.sport_type === "VirtualRun" ||
          activity.type === "TrailRun" ||
          activity.sport_type === "TrailRun") &&
        activity.moving_time >= MIN_RUN_MINUTES * 60 && // Filter out runs shorter than minimum time
        activity.distance * METERS_TO_MILES >= MIN_RUN_MILES // Filter out runs shorter than minimum distance
    )
    .map((activity) => {
      const distanceMiles = activity.distance * METERS_TO_MILES;
      const durationMinutes = activity.moving_time / 60;
      const paceSecondsPerMile = activity.moving_time / distanceMiles;

      return {
        id: activity.id,
        name: activity.name,
        date: activity.start_date_local,
        distance_miles: parseFloat(distanceMiles.toFixed(2)),
        duration_minutes: parseFloat(durationMinutes.toFixed(2)),
        pace_per_mile: formatPace(paceSecondsPerMile),
        pace_seconds: paceSecondsPerMile,
        elevation_gain_feet: Math.round(
          activity.total_elevation_gain * METERS_TO_FEET
        ),
        average_heartrate: activity.average_heartrate,
        average_speed_mph: parseFloat(
          (activity.average_speed * METERS_PER_SEC_TO_MPH).toFixed(2)
        ),
        max_speed_mph: parseFloat(
          (activity.max_speed * METERS_PER_SEC_TO_MPH).toFixed(2)
        ),
        calories: activity.kilojoules
          ? Math.round(activity.kilojoules * 1.05)
          : undefined,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    totalRuns: runs.length,
    runs,
  };
}

export function getFastestRuns(
  runs: RunAnalysis[],
  count: number = 5,
  minDistance: number = 1
): RunAnalysis[] {
  return runs
    .filter((run) => run.distance_miles >= minDistance)
    .sort((a, b) => a.pace_seconds - b.pace_seconds)
    .slice(0, count);
}

export function getLongestRuns(
  runs: RunAnalysis[],
  count: number = 5
): RunAnalysis[] {
  return runs
    .sort((a, b) => b.distance_miles - a.distance_miles)
    .slice(0, count);
}

export function getRunsByDistance(
  runs: RunAnalysis[],
  minMiles: number,
  maxMiles: number
): RunAnalysis[] {
  return runs
    .filter(
      (run) => run.distance_miles >= minMiles && run.distance_miles <= maxMiles
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getRunsByPace(
  runs: RunAnalysis[],
  maxPacePerMile: string
): RunAnalysis[] {
  const [minutes, seconds] = maxPacePerMile.split(":").map(Number);
  const maxPaceSeconds = minutes * 60 + seconds;

  return runs
    .filter((run) => run.pace_seconds <= maxPaceSeconds)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getRunStats(runs: RunAnalysis[], year?: number): RunStats {
  const filteredRuns = year
    ? runs.filter((run) => new Date(run.date).getFullYear() === year)
    : runs;

  if (filteredRuns.length === 0) {
    return {
      totalRuns: 0,
      totalDistance: 0,
      totalDuration: 0,
      totalElevation: 0,
      averageDistance: 0,
      averagePace: "N/A",
      averageHeartrate: undefined,
      longestRun: null,
      fastestPace: null,
      mostElevation: null,
      weeklyAverage: 0,
      monthlyAverage: 0,
    };
  }

  const totalDistance = filteredRuns.reduce(
    (sum, run) => sum + run.distance_miles,
    0
  );
  const totalDuration = filteredRuns.reduce(
    (sum, run) => sum + run.duration_minutes,
    0
  );
  const totalElevation = filteredRuns.reduce(
    (sum, run) => sum + run.elevation_gain_feet,
    0
  );

  const avgPaceSeconds =
    filteredRuns.reduce((sum, run) => sum + run.pace_seconds, 0) /
    filteredRuns.length;

  const runsWithHR = filteredRuns.filter((run) => run.average_heartrate);
  const averageHeartrate =
    runsWithHR.length > 0
      ? runsWithHR.reduce((sum, run) => sum + (run.average_heartrate || 0), 0) /
        runsWithHR.length
      : undefined;

  const longestRun = filteredRuns.reduce(
    (longest, run) =>
      run.distance_miles > (longest?.distance_miles || 0) ? run : longest,
    null as RunAnalysis | null
  );

  const fastestPace = filteredRuns.reduce(
    (fastest, run) =>
      run.pace_seconds < (fastest?.pace_seconds || Infinity) ? run : fastest,
    null as RunAnalysis | null
  );

  const mostElevation = filteredRuns.reduce(
    (most, run) =>
      run.elevation_gain_feet > (most?.elevation_gain_feet || 0) ? run : most,
    null as RunAnalysis | null
  );

  // Calculate weekly and monthly averages
  const oldestRun = filteredRuns[filteredRuns.length - 1];
  const newestRun = filteredRuns[0];
  const daysDiff = Math.ceil(
    (new Date(newestRun.date).getTime() - new Date(oldestRun.date).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const weeksDiff = Math.max(1, daysDiff / 7);
  const monthsDiff = Math.max(1, daysDiff / 30);

  return {
    totalRuns: filteredRuns.length,
    totalDistance: parseFloat(totalDistance.toFixed(2)),
    totalDuration: parseFloat(totalDuration.toFixed(2)),
    totalElevation: Math.round(totalElevation),
    averageDistance: parseFloat(
      (totalDistance / filteredRuns.length).toFixed(2)
    ),
    averagePace: formatPace(avgPaceSeconds),
    averageHeartrate: averageHeartrate
      ? Math.round(averageHeartrate)
      : undefined,
    longestRun,
    fastestPace,
    mostElevation,
    weeklyAverage: parseFloat((filteredRuns.length / weeksDiff).toFixed(1)),
    monthlyAverage: parseFloat((filteredRuns.length / monthsDiff).toFixed(1)),
  };
}

export function getMonthlyStats(
  runs: RunAnalysis[],
  year?: number,
  month?: number
): MonthlyStats {
  let filteredRuns = runs;

  if (year) {
    filteredRuns = filteredRuns.filter(
      (run) => new Date(run.date).getFullYear() === year
    );
  }

  if (month) {
    filteredRuns = filteredRuns.filter(
      (run) => new Date(run.date).getMonth() + 1 === month
    );
  }

  const monthlyData: MonthlyStats = {};

  filteredRuns.forEach((run) => {
    const date = new Date(run.date);
    const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}`;

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: date.toLocaleString("default", { month: "long" }),
        year: date.getFullYear(),
        runs: 0,
        distance: 0,
        duration: 0,
        elevation: 0,
        averagePace: "",
        longestRun: undefined,
        fastestRun: undefined,
      };
    }

    const monthData = monthlyData[monthKey];
    monthData.runs++;
    monthData.distance += run.distance_miles;
    monthData.duration += run.duration_minutes;
    monthData.elevation += run.elevation_gain_feet;

    if (
      !monthData.longestRun ||
      run.distance_miles > monthData.longestRun.distance_miles
    ) {
      monthData.longestRun = run;
    }

    if (
      !monthData.fastestRun ||
      run.pace_seconds < monthData.fastestRun.pace_seconds
    ) {
      monthData.fastestRun = run;
    }
  });

  // Calculate average pace for each month
  Object.values(monthlyData).forEach((month) => {
    const monthRuns = filteredRuns.filter((run) => {
      const date = new Date(run.date);
      return (
        date.getFullYear() === month.year &&
        date.toLocaleString("default", { month: "long" }) === month.month
      );
    });

    if (monthRuns.length > 0) {
      const avgPaceSeconds =
        monthRuns.reduce((sum, run) => sum + run.pace_seconds, 0) /
        monthRuns.length;
      const avgPaceMinutes = Math.floor(avgPaceSeconds / 60);
      const avgPaceSecondsRemainder = Math.round(avgPaceSeconds % 60);
      month.averagePace = `${avgPaceMinutes}:${avgPaceSecondsRemainder
        .toString()
        .padStart(2, "0")}`;
    }
  });

  return monthlyData;
}

export interface LapAnalysis {
  id: number;
  activity_id: number;
  activity_name: string;
  date: string;
  distance_miles: number;
  duration_minutes: number;
  pace_per_mile: string;
  pace_seconds: number;
  average_speed_mph: number;
  average_heartrate?: number;
}

export async function getFastestLaps(
  activities: StravaActivity[],
  stravaClient: any,
  count: number = 5,
  targetDistanceMiles: number = 1 // Default to 1 mile
): Promise<LapAnalysis[]> {
  const runs = analyzeRuns(activities).runs;
  const allLaps: LapAnalysis[] = [];

  // Get fastest runs first to optimize by looking at most likely candidates
  const fastestRuns = getFastestRuns(runs, 10);

  for (const run of fastestRuns) {
    try {
      const laps = await stravaClient.fetchActivityLaps(run.id);

      const analyzedLaps = laps.map((lap: StravaLap) => {
        const distanceMiles = lap.distance * METERS_TO_MILES;
        const durationMinutes = lap.moving_time / 60;
        const paceSecondsPerMile = lap.moving_time / distanceMiles;

        return {
          id: lap.id,
          activity_id: run.id,
          activity_name: run.name,
          date: lap.start_date_local,
          distance_miles: parseFloat(distanceMiles.toFixed(2)),
          duration_minutes: parseFloat(durationMinutes.toFixed(2)),
          pace_per_mile: formatPace(paceSecondsPerMile),
          pace_seconds: paceSecondsPerMile,
          average_speed_mph: parseFloat(
            (lap.average_speed * METERS_PER_SEC_TO_MPH).toFixed(2)
          ),
          average_heartrate: lap.average_heartrate,
        };
      });

      // Filter laps that are close to the target distance (within 5%)
      const targetLaps = analyzedLaps.filter((lap: LapAnalysis) => {
        const distanceDiff = Math.abs(lap.distance_miles - targetDistanceMiles);
        return distanceDiff / targetDistanceMiles <= 0.05;
      });

      allLaps.push(...targetLaps);
    } catch (error) {
      console.error(`Error fetching laps for activity ${run.id}:`, error);
    }
  }

  // Sort by pace and return the fastest ones
  return allLaps
    .sort((a, b) => a.pace_seconds - b.pace_seconds)
    .slice(0, count);
}

export function getPersonalRecords(runs: RunAnalysis[]): {
  [distance: string]: RunAnalysis | null;
} {
  const standardDistances = [
    { name: "5K", minMiles: 3.1, maxMiles: 3.2 },
    { name: "10K", minMiles: 6.2, maxMiles: 6.3 },
    { name: "Half Marathon", minMiles: 13.1, maxMiles: 13.2 },
    { name: "Marathon", minMiles: 26.2, maxMiles: 26.3 },
  ];

  const prs: { [distance: string]: RunAnalysis | null } = {};

  standardDistances.forEach(({ name, minMiles, maxMiles }) => {
    const distanceRuns = runs.filter(
      (run) => run.distance_miles >= minMiles && run.distance_miles <= maxMiles
    );
    prs[name] =
      distanceRuns.length > 0
        ? distanceRuns.reduce((fastest, run) =>
            run.pace_seconds < fastest.pace_seconds ? run : fastest
          )
        : null;
  });

  return prs;
}

function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor(
    (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)
  );
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

function getWeekRange(date: Date): { startDate: string; endDate: string } {
  const dayOfWeek = date.getDay();
  const startDate = new Date(date);
  startDate.setDate(date.getDate() - dayOfWeek);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

function calculateAggregateStats(runs: RunAnalysis[]): {
  totalMiles: number;
  totalDuration: number;
  totalElevation: number;
  daysRan: number;
  averagePace: string;
  longestRun?: RunAnalysis;
  fastestRun?: RunAnalysis;
} {
  if (runs.length === 0) {
    return {
      totalMiles: 0,
      totalDuration: 0,
      totalElevation: 0,
      daysRan: 0,
      averagePace: "0:00",
    };
  }

  const totalMiles = runs.reduce((sum, run) => sum + run.distance_miles, 0);
  const totalDuration = runs.reduce(
    (sum, run) => sum + run.duration_minutes,
    0
  );
  const totalElevation = runs.reduce(
    (sum, run) => sum + run.elevation_gain_feet,
    0
  );

  // Count unique days
  const uniqueDays = new Set(
    runs.map((run) => new Date(run.date).toISOString().split("T")[0])
  );

  // Calculate average pace
  const totalSeconds = runs.reduce(
    (sum, run) => sum + run.pace_seconds * run.distance_miles,
    0
  );
  const avgPaceSeconds = totalSeconds / totalMiles;

  // Find longest and fastest runs
  const longestRun = runs.reduce(
    (longest, run) =>
      run.distance_miles > (longest?.distance_miles || 0) ? run : longest,
    undefined as RunAnalysis | undefined
  );

  const fastestRun = runs.reduce(
    (fastest, run) =>
      run.pace_seconds < (fastest?.pace_seconds || Infinity) ? run : fastest,
    undefined as RunAnalysis | undefined
  );

  return {
    totalMiles: parseFloat(totalMiles.toFixed(2)),
    totalDuration: parseFloat(totalDuration.toFixed(2)),
    totalElevation: Math.round(totalElevation),
    daysRan: uniqueDays.size,
    averagePace: formatPace(avgPaceSeconds),
    longestRun,
    fastestRun,
  };
}

export function getEnhancedMonthlyStats(
  runs: RunAnalysis[],
  year?: number,
  month?: number
): EnhancedMonthlyStats {
  let filteredRuns = runs;

  if (year) {
    filteredRuns = filteredRuns.filter(
      (run) => new Date(run.date).getFullYear() === year
    );
  }

  if (month) {
    filteredRuns = filteredRuns.filter(
      (run) => new Date(run.date).getMonth() + 1 === month
    );
  }

  const monthlyData: EnhancedMonthlyStats = {};

  // First pass: organize runs by month and week
  filteredRuns.forEach((run) => {
    const date = new Date(run.date);
    const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}`;
    const weekNum = getWeekNumber(date);

    // Initialize month if it doesn't exist
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: date.toLocaleString("default", { month: "long" }),
        year: date.getFullYear(),
        totalRuns: 0,
        totalMiles: 0,
        totalDuration: 0,
        totalElevation: 0,
        daysRan: 0,
        averagePace: "",
        weeklyStats: {},
        runs: [],
      };
    }

    const monthData = monthlyData[monthKey];
    monthData.runs.push(run);

    // Initialize week if it doesn't exist
    if (!monthData.weeklyStats[weekNum]) {
      const weekRange = getWeekRange(date);
      monthData.weeklyStats[weekNum] = {
        weekNumber: weekNum,
        startDate: weekRange.startDate,
        endDate: weekRange.endDate,
        numRuns: 0,
        totalMiles: 0,
        totalDuration: 0,
        totalElevation: 0,
        daysRan: 0,
        averagePace: "",
        runs: [],
      };
    }

    // Add run to week
    monthData.weeklyStats[weekNum].runs.push(run);
  });

  // Second pass: calculate aggregates for each month and week
  Object.values(monthlyData).forEach((monthData: EnhancedMonthStats) => {
    // Calculate month aggregates
    const monthStats = calculateAggregateStats(monthData.runs);
    Object.assign(monthData, monthStats);

    // Calculate week aggregates
    Object.values(monthData.weeklyStats).forEach((weekData: WeekStats) => {
      const weekStats = calculateAggregateStats(weekData.runs);
      weekData.numRuns = weekData.runs.length;
      weekData.totalMiles = weekStats.totalMiles;
      weekData.totalDuration = weekStats.totalDuration;
      weekData.totalElevation = weekStats.totalElevation;
      weekData.daysRan = weekStats.daysRan;
      weekData.averagePace = weekStats.averagePace;
      weekData.longestRun = weekStats.longestRun;
      weekData.fastestRun = weekStats.fastestRun;
    });
  });

  return monthlyData;
}
