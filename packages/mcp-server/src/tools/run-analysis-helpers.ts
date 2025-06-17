import { RunAnalysis } from "./types";

interface TimeOfDayStats {
  earlyMorning: RunStats; // 4:00-7:59
  morning: RunStats; // 8:00-11:59
  afternoon: RunStats; // 12:00-16:59
  evening: RunStats; // 17:00-20:59
  night: RunStats; // 21:00-3:59
}

interface DayOfWeekStats {
  summary: {
    preferredRunningDays: string[];
    isWeekendRunner: boolean;
    mostConsistentDay: string;
    leastActiveDay: string;
    weekdayToWeekendRatio: number;
    averageRunsPerWeek: number;
  };
  weekdayAvg: RunStatsSimple;
  weekendAvg: RunStatsSimple;
  byDay: {
    [key: string]: RunStatsSimple;
  };
}

interface RunStats {
  count: number;
  totalDistance: number;
  averageDistance: number;
  averagePace: string;
  averagePaceSeconds: number;
  runs: RunAnalysis[];
}

interface RunStatsSimple {
  count: number;
  totalDistance: number;
  averageDistance: number;
  averagePace: string;
  consistency: number; // percentage of available days with runs
}

interface WordAnalysis {
  wordFrequency: { [key: string]: number };
  totalTitles: number;
  commonWords: Array<{ word: string; count: number; percentage: number }>;
  sentiment: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

interface ActivityGap {
  startDate: string;
  endDate: string;
  daysOff: number;
  lastRunBefore: RunAnalysis;
  firstRunAfter: RunAnalysis;
  performanceChange: {
    paceChange: number; // negative means faster
    distanceChange: number; // percentage change in average distance
    description: string;
  };
}

interface MonthlyLoadProgression {
  monthlyStats: {
    [key: string]: {
      month: string; // YYYY-MM
      totalMiles: number;
      totalRuns: number;
      averageMilesPerRun: number;
      percentChangeFromPrevMonth: number;
      isOverTenPercent: boolean;
    };
  };
  rampUpPeriods: {
    startMonth: string;
    endMonth: string;
    percentageIncrease: number;
    averageMonthlyIncrease: number;
  }[];
}

interface DoubleDayAnalysis {
  doubleDays: {
    date: string;
    runs: RunAnalysis[];
    totalDistance: number;
    averagePace: string;
  }[];
  patterns: {
    frequency: {
      total: number;
      byMonth: { [key: string]: number };
      byDayOfWeek: { [key: string]: number };
    };
    performance: {
      averageFirstRunDistance: number;
      averageSecondRunDistance: number;
      averageFirstRunPace: string;
      averageSecondRunPace: string;
      averageTimeBetweenRuns: number; // hours
    };
  };
  subsequentDayPerformance: {
    averagePace: string;
    averageDistance: number;
    comparisonToNormal: {
      pacePercentDiff: number;
      distancePercentDiff: number;
    };
  };
}

const getTimeOfDay = (dateStr: string): string => {
  const hour = new Date(dateStr).getHours();
  if (hour >= 4 && hour < 8) return "earlyMorning";
  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
};

const initializeRunStats = (): RunStats => ({
  count: 0,
  totalDistance: 0,
  averageDistance: 0,
  averagePace: "0:00",
  averagePaceSeconds: 0,
  runs: [],
});

const calculateRunStats = (runs: RunAnalysis[]): RunStats => {
  if (runs.length === 0) return initializeRunStats();

  const totalDistance = runs.reduce((sum, run) => sum + run.distance_miles, 0);
  const totalPaceSeconds = runs.reduce((sum, run) => sum + run.pace_seconds, 0);
  const avgPaceSeconds = totalPaceSeconds / runs.length;
  const paceMinutes = Math.floor(avgPaceSeconds / 60);
  const paceSeconds = Math.round(avgPaceSeconds % 60);

  return {
    count: runs.length,
    totalDistance,
    averageDistance: totalDistance / runs.length,
    averagePace: `${paceMinutes}:${paceSeconds.toString().padStart(2, "0")}`,
    averagePaceSeconds: avgPaceSeconds,
    runs,
  };
};

export const analyzeTimeOfDay = (runs: RunAnalysis[]): TimeOfDayStats => {
  const timeSlots: { [key: string]: RunAnalysis[] } = {
    earlyMorning: [],
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
  };

  runs.forEach((run) => {
    const timeOfDay = getTimeOfDay(run.date);
    timeSlots[timeOfDay].push(run);
  });

  return {
    earlyMorning: calculateRunStats(timeSlots.earlyMorning),
    morning: calculateRunStats(timeSlots.morning),
    afternoon: calculateRunStats(timeSlots.afternoon),
    evening: calculateRunStats(timeSlots.evening),
    night: calculateRunStats(timeSlots.night),
  };
};

export const analyzeDayOfWeek = (runs: RunAnalysis[]): DayOfWeekStats => {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const byDay: { [key: string]: RunAnalysis[] } = {};
  const weekdayRuns: RunAnalysis[] = [];
  const weekendRuns: RunAnalysis[] = [];

  // Initialize arrays for each day
  days.forEach((day) => {
    byDay[day] = [];
  });

  // Group runs by day
  runs.forEach((run) => {
    const dayOfWeek = days[new Date(run.date).getDay()];
    byDay[dayOfWeek].push(run);

    if (dayOfWeek === "Saturday" || dayOfWeek === "Sunday") {
      weekendRuns.push(run);
    } else {
      weekdayRuns.push(run);
    }
  });

  // Calculate date range to determine consistency
  const dateRange =
    runs.length > 0
      ? {
          start: new Date(
            Math.min(...runs.map((r) => new Date(r.date).getTime()))
          ),
          end: new Date(
            Math.max(...runs.map((r) => new Date(r.date).getTime()))
          ),
        }
      : null;

  const calculateConsistency = (dayRuns: RunAnalysis[], isWeekend: boolean) => {
    if (!dateRange || dayRuns.length === 0) return 0;
    const totalWeeks = Math.ceil(
      (dateRange.end.getTime() - dateRange.start.getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    );
    const availableDays = totalWeeks * (isWeekend ? 2 : 5);
    return (dayRuns.length / availableDays) * 100;
  };

  const simplifyStats = (
    runs: RunAnalysis[],
    isWeekend: boolean = false
  ): RunStatsSimple => {
    const stats = calculateRunStats(runs);
    return {
      count: stats.count,
      totalDistance: Math.round(stats.totalDistance * 10) / 10,
      averageDistance: Math.round(stats.averageDistance * 10) / 10,
      averagePace: stats.averagePace,
      consistency: Math.round(calculateConsistency(runs, isWeekend) * 10) / 10,
    };
  };

  const dayStats = Object.fromEntries(
    Object.entries(byDay).map(([day, dayRuns]) => [
      day,
      simplifyStats(dayRuns, day === "Saturday" || day === "Sunday"),
    ])
  );

  // Calculate summary statistics
  const weekdayStats = simplifyStats(weekdayRuns, false);
  const weekendStats = simplifyStats(weekendRuns, true);

  const sortedDays = Object.entries(dayStats).sort(
    (a, b) => b[1].count - a[1].count
  );

  const weekdayToWeekendRatio =
    weekendStats.count > 0
      ? weekdayStats.count / 5 / (weekendStats.count / 2)
      : 0;

  const totalWeeks = dateRange
    ? Math.ceil(
        (dateRange.end.getTime() - dateRange.start.getTime()) /
          (7 * 24 * 60 * 60 * 1000)
      )
    : 0;

  const summary = {
    preferredRunningDays: sortedDays.slice(0, 3).map(([day]) => day),
    isWeekendRunner: weekdayToWeekendRatio < 0.8,
    mostConsistentDay: sortedDays.reduce((a, b) =>
      a[1].consistency > b[1].consistency ? a : b
    )[0],
    leastActiveDay: sortedDays.reduce((a, b) =>
      a[1].count < b[1].count ? a : b
    )[0],
    weekdayToWeekendRatio: Math.round(weekdayToWeekendRatio * 100) / 100,
    averageRunsPerWeek:
      totalWeeks > 0 ? Math.round((runs.length / totalWeeks) * 10) / 10 : 0,
  };

  return {
    summary,
    weekdayAvg: weekdayStats,
    weekendAvg: weekendStats,
    byDay: dayStats,
  };
};

const commonWords = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "run",
  "running",
  "mile",
  "miles",
  "km",
  "morning",
  "evening",
  "afternoon",
]);

const positiveWords = new Set([
  "great",
  "good",
  "awesome",
  "amazing",
  "excellent",
  "strong",
  "fast",
  "energetic",
  "happy",
  "fun",
  "enjoyable",
  "solid",
  "nice",
  "perfect",
  "proud",
  "successful",
]);

const negativeWords = new Set([
  "tired",
  "hard",
  "tough",
  "difficult",
  "slow",
  "bad",
  "rough",
  "exhausted",
  "struggling",
  "painful",
  "sore",
  "heavy",
  "weak",
  "terrible",
  "awful",
]);

export const analyzeRunTitles = (runs: RunAnalysis[]): WordAnalysis => {
  const wordFrequency: { [key: string]: number } = {};
  let positive = 0;
  let negative = 0;
  let neutral = 0;

  runs.forEach((run) => {
    const words = run.name
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .split(/\s+/);

    let hasPositive = false;
    let hasNegative = false;

    words.forEach((word) => {
      if (commonWords.has(word)) return;

      wordFrequency[word] = (wordFrequency[word] || 0) + 1;

      if (positiveWords.has(word)) hasPositive = true;
      if (negativeWords.has(word)) hasNegative = true;
    });

    if (hasPositive && !hasNegative) positive++;
    else if (hasNegative && !hasPositive) negative++;
    else neutral++;
  });

  const commonWordsArray = Object.entries(wordFrequency)
    .map(([word, count]) => ({
      word,
      count,
      percentage: (count / runs.length) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    wordFrequency,
    totalTitles: runs.length,
    commonWords: commonWordsArray,
    sentiment: {
      positive,
      negative,
      neutral,
    },
  };
};

export const findActivityGaps = (
  runs: RunAnalysis[],
  minGapDays: number = 14
): ActivityGap[] => {
  // Sort runs by date
  const sortedRuns = [...runs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const gaps: ActivityGap[] = [];

  for (let i = 0; i < sortedRuns.length - 1; i++) {
    const currentRun = sortedRuns[i];
    const nextRun = sortedRuns[i + 1];

    const currentDate = new Date(currentRun.date);
    const nextDate = new Date(nextRun.date);
    const diffDays = Math.floor(
      (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays >= minGapDays) {
      // Calculate performance changes
      const paceChange = nextRun.pace_seconds - currentRun.pace_seconds;
      const distanceChange =
        ((nextRun.distance_miles - currentRun.distance_miles) /
          currentRun.distance_miles) *
        100;

      let description = "After the break, ";
      if (paceChange < 0) {
        description += "pace was faster ";
      } else {
        description += "pace was slower ";
      }
      description += `(${Math.abs(Math.round(paceChange))} seconds per mile). `;

      if (Math.abs(distanceChange) > 10) {
        description += `Distance ${
          distanceChange > 0 ? "increased" : "decreased"
        } by ${Math.abs(Math.round(distanceChange))}%.`;
      }

      gaps.push({
        startDate: currentRun.date,
        endDate: nextRun.date,
        daysOff: diffDays,
        lastRunBefore: currentRun,
        firstRunAfter: nextRun,
        performanceChange: {
          paceChange,
          distanceChange,
          description,
        },
      });
    }
  }

  return gaps;
};

export const analyzeMonthlyLoadProgression = (
  runs: RunAnalysis[]
): MonthlyLoadProgression => {
  const monthlyStats: { [key: string]: any } = {};

  // Group runs by month
  runs.forEach((run) => {
    const date = new Date(run.date);
    const monthKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;

    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = {
        month: monthKey,
        totalMiles: 0,
        totalRuns: 0,
        averageMilesPerRun: 0,
        percentChangeFromPrevMonth: 0,
        isOverTenPercent: false,
      };
    }

    monthlyStats[monthKey].totalMiles += run.distance_miles;
    monthlyStats[monthKey].totalRuns++;
  });

  // Calculate averages and percent changes
  const sortedMonths = Object.keys(monthlyStats).sort();
  const rampUpPeriods = [];
  let currentRampUp: any = null;

  sortedMonths.forEach((month, index) => {
    const stats = monthlyStats[month];
    stats.averageMilesPerRun = stats.totalMiles / stats.totalRuns;

    if (index > 0) {
      const prevMonth = sortedMonths[index - 1];
      const prevStats = monthlyStats[prevMonth];
      const percentChange =
        ((stats.totalMiles - prevStats.totalMiles) / prevStats.totalMiles) *
        100;

      stats.percentChangeFromPrevMonth = Math.round(percentChange * 10) / 10;
      stats.isOverTenPercent = percentChange > 10;

      // Track ramp-up periods
      if (percentChange > 10) {
        if (!currentRampUp) {
          currentRampUp = {
            startMonth: prevMonth,
            endMonth: month,
            percentageIncrease: percentChange,
            monthCount: 1,
          };
        } else {
          currentRampUp.endMonth = month;
          currentRampUp.percentageIncrease += percentChange;
          currentRampUp.monthCount++;
        }
      } else if (currentRampUp) {
        rampUpPeriods.push({
          ...currentRampUp,
          averageMonthlyIncrease:
            currentRampUp.percentageIncrease / currentRampUp.monthCount,
        });
        currentRampUp = null;
      }
    }
  });

  // Add final ramp-up period if exists
  if (currentRampUp) {
    rampUpPeriods.push({
      ...currentRampUp,
      averageMonthlyIncrease:
        currentRampUp.percentageIncrease / currentRampUp.monthCount,
    });
  }

  return {
    monthlyStats,
    rampUpPeriods,
  };
};

export const analyzeDoubleDays = (runs: RunAnalysis[]): DoubleDayAnalysis => {
  const runsByDate: { [key: string]: RunAnalysis[] } = {};
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  // Group runs by date
  runs.forEach((run) => {
    const date = run.date.split("T")[0]; // Get YYYY-MM-DD
    if (!runsByDate[date]) {
      runsByDate[date] = [];
    }
    runsByDate[date].push(run);
  });

  const doubleDays: any[] = [];
  const frequency = {
    total: 0,
    byMonth: {} as { [key: string]: number },
    byDayOfWeek: {} as { [key: string]: number },
  };

  let totalFirstRunDistance = 0;
  let totalSecondRunDistance = 0;
  let totalFirstRunPaceSeconds = 0;
  let totalSecondRunPaceSeconds = 0;
  let totalTimeBetweenRuns = 0;

  // Initialize day of week counters
  days.forEach((day) => {
    frequency.byDayOfWeek[day] = 0;
  });

  // Find double days and calculate statistics
  Object.entries(runsByDate)
    .filter(([_, dateRuns]) => dateRuns.length > 1)
    .forEach(([date, dateRuns]) => {
      // Sort runs by time
      const sortedRuns = dateRuns.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const month = date.substring(0, 7); // YYYY-MM
      const dayOfWeek = days[new Date(date).getDay()];

      frequency.total++;
      frequency.byMonth[month] = (frequency.byMonth[month] || 0) + 1;
      frequency.byDayOfWeek[dayOfWeek]++;

      totalFirstRunDistance += sortedRuns[0].distance_miles;
      totalSecondRunDistance += sortedRuns[1].distance_miles;
      totalFirstRunPaceSeconds += sortedRuns[0].pace_seconds;
      totalSecondRunPaceSeconds += sortedRuns[1].pace_seconds;

      const timeBetween =
        (new Date(sortedRuns[1].date).getTime() -
          new Date(sortedRuns[0].date).getTime()) /
        (1000 * 60 * 60);
      totalTimeBetweenRuns += timeBetween;

      doubleDays.push({
        date,
        runs: sortedRuns,
        totalDistance: sortedRuns.reduce(
          (sum, run) => sum + run.distance_miles,
          0
        ),
        averagePace: calculateRunStats(sortedRuns).averagePace,
      });
    });

  // Calculate average performance for days following double days
  const subsequentDayPerformance = calculateSubsequentDayPerformance(
    runs,
    doubleDays.map((d) => d.date)
  );

  return {
    doubleDays,
    patterns: {
      frequency,
      performance: {
        averageFirstRunDistance: totalFirstRunDistance / frequency.total,
        averageSecondRunDistance: totalSecondRunDistance / frequency.total,
        averageFirstRunPace: formatPace(
          totalFirstRunPaceSeconds / frequency.total
        ),
        averageSecondRunPace: formatPace(
          totalSecondRunPaceSeconds / frequency.total
        ),
        averageTimeBetweenRuns: totalTimeBetweenRuns / frequency.total,
      },
    },
    subsequentDayPerformance,
  };
};

const formatPace = (paceSeconds: number): string => {
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const calculateSubsequentDayPerformance = (
  allRuns: RunAnalysis[],
  doubleDayDates: string[]
): any => {
  const normalRuns = allRuns.filter(
    (run) =>
      !doubleDayDates.includes(run.date.split("T")[0]) &&
      !doubleDayDates.includes(getPreviousDay(run.date))
  );

  const subsequentRuns = allRuns.filter((run) =>
    doubleDayDates.includes(getPreviousDay(run.date))
  );

  const normalStats = calculateRunStats(normalRuns);
  const subsequentStats = calculateRunStats(subsequentRuns);

  return {
    averagePace: subsequentStats.averagePace,
    averageDistance: subsequentStats.averageDistance,
    comparisonToNormal: {
      pacePercentDiff:
        ((subsequentStats.averagePaceSeconds - normalStats.averagePaceSeconds) /
          normalStats.averagePaceSeconds) *
        100,
      distancePercentDiff:
        ((subsequentStats.averageDistance - normalStats.averageDistance) /
          normalStats.averageDistance) *
        100,
    },
  };
};

const getPreviousDay = (dateStr: string): string => {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
};
