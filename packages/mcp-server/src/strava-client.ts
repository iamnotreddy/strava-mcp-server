// src/strava-client.ts
import axios, { AxiosError } from "axios";
import { config } from "./config";

export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  achievement_count: number;
  kudos_count: number;
  comment_count: number;
  athlete_count: number;
  photo_count: number;
  map: {
    id: string;
    summary_polyline: string;
    resource_state: number;
  };
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  private: boolean;
  flagged: boolean;
  gear_id: string;
  from_accepted_tag: boolean;
  average_speed: number;
  max_speed: number;
  average_watts?: number;
  kilojoules?: number;
  device_watts?: boolean;
  has_heartrate: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  heartrate_opt_out: boolean;
  display_hide_heartrate_option: boolean;
  pr_count: number;
  total_photo_count: number;
  has_kudoed: boolean;
  suffer_score?: number;
  // Additional fields from detailed activity
  calories?: number;
  description?: string;
  perceived_exertion?: number;
  prefer_perceived_exertion?: boolean;
  segment_efforts?: any[];
  laps?: any[];
  best_efforts?: any[];
  splits_metric?: any[];
  splits_standard?: any[];
  weather?: {
    temperature?: number;
    humidity?: number;
    wind_speed?: number;
    condition?: string;
  };
}

export interface StravaAthlete {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  city: string;
  state: string;
  country: string;
  sex: string;
  premium: boolean;
  created_at: string;
  updated_at: string;
  follower_count: number;
  friend_count: number;
  measurement_preference: string;
  weight: number;
}

export interface StravaLap {
  id: number;
  activity: { id: number };
  athlete: { id: number };
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  start_index: number;
  end_index: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  lap_index: number;
  split: number;
  pace_zone: number;
}

export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
}

export class StravaAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public rateLimitExceeded?: boolean
  ) {
    super(message);
    this.name = "StravaAPIError";
  }
}

export class StravaClient {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private rateLimitRemaining: number = 100;
  private rateLimitReset: number = Date.now();

  private async refreshAccessToken(): Promise<void> {
    try {
      const response = await axios.post<StravaTokenResponse>(
        "https://www.strava.com/api/v3/oauth/token",
        {
          client_id: config.strava.clientId,
          client_secret: config.strava.clientSecret,
          grant_type: "refresh_token",
          refresh_token: config.strava.refreshToken,
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + response.data.expires_in * 1000;

      console.error("Successfully refreshed Strava access token");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new StravaAPIError(
          `Failed to refresh access token: ${
            error.response?.data?.message || error.message
          }`,
          error.response?.status
        );
      }
      throw error;
    }
  }

  private async getAccessToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry - 60000) {
      // Refresh 1 minute before expiry
      await this.refreshAccessToken();
    }
    return this.accessToken!;
  }

  private updateRateLimits(headers: any): void {
    if (headers["x-ratelimit-limit"]) {
      this.rateLimitRemaining = parseInt(
        headers["x-ratelimit-usage"]?.split(",")[0] || "0"
      );
      this.rateLimitReset =
        parseInt(headers["x-ratelimit-usage"]?.split(",")[1] || "0") * 1000;
    }
  }

  private async checkRateLimit(): Promise<void> {
    if (this.rateLimitRemaining <= 0 && Date.now() < this.rateLimitReset) {
      const waitTime = Math.ceil((this.rateLimitReset - Date.now()) / 1000);
      throw new StravaAPIError(
        `Rate limit exceeded. Please wait ${waitTime} seconds.`,
        429,
        true
      );
    }
  }

  private async makeRequest<T>(url: string, params?: any): Promise<T> {
    await this.checkRateLimit();
    const token = await this.getAccessToken();

    try {
      const response = await axios.get<T>(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params,
      });

      this.updateRateLimits(response.headers);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.updateRateLimits(axiosError.response?.headers || {});

        if (axiosError.response?.status === 401) {
          // Try refreshing token once more
          await this.refreshAccessToken();
          throw new StravaAPIError(
            "Authentication failed. Please check your credentials.",
            401
          );
        }

        throw new StravaAPIError(
          `Strava API error: ${
            axiosError.response?.data || axiosError.message
          }`,
          axiosError.response?.status
        );
      }
      throw error;
    }
  }

  async fetchAthlete(): Promise<StravaAthlete> {
    return this.makeRequest<StravaAthlete>(
      "https://www.strava.com/api/v3/athlete"
    );
  }

  async fetchActivityById(id: number): Promise<StravaActivity> {
    return this.makeRequest<StravaActivity>(
      `https://www.strava.com/api/v3/activities/${id}`
    );
  }

  async fetchAllActivities(): Promise<StravaActivity[]> {
    console.error("Fetching all activities from Strava...");
    const activities: StravaActivity[] = [];
    let page = 1;
    const perPage = 200; // Max allowed by Strava

    while (true) {
      const pageActivities = await this.makeRequest<StravaActivity[]>(
        "https://www.strava.com/api/v3/athlete/activities",
        { page, per_page: perPage }
      );

      if (pageActivities.length === 0) {
        break;
      }

      activities.push(...pageActivities);
      console.error(
        `Fetched page ${page} (${pageActivities.length} activities, total: ${activities.length})`
      );
      page++;

      // Add a small delay to be respectful of the API
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.error(`Finished fetching ${activities.length} total activities`);
    return activities;
  }

  async fetchActivitiesByDateRange(
    startDate: string,
    endDate: string
  ): Promise<StravaActivity[]> {
    console.error(`Fetching activities from ${startDate} to ${endDate}...`);
    const activities: StravaActivity[] = [];
    let page = 1;
    const perPage = 200;

    const after = Math.floor(new Date(startDate).getTime() / 1000);
    const before = Math.floor(new Date(endDate).getTime() / 1000) + 86400; // Add one day to include the end date

    while (true) {
      const pageActivities = await this.makeRequest<StravaActivity[]>(
        "https://www.strava.com/api/v3/athlete/activities",
        { page, per_page: perPage, after, before }
      );

      if (pageActivities.length === 0) {
        break;
      }

      activities.push(...pageActivities);
      console.error(
        `Fetched page ${page} (${pageActivities.length} activities, total: ${activities.length})`
      );
      page++;

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.error(
      `Finished fetching ${activities.length} activities for date range`
    );
    return activities;
  }

  async fetchActivityStreams(
    activityId: number,
    types: string[] = [
      "time",
      "distance",
      "heartrate",
      "altitude",
      "velocity_smooth",
    ]
  ): Promise<any> {
    const typesParam = types.join(",");
    return this.makeRequest<any>(
      `https://www.strava.com/api/v3/activities/${activityId}/streams`,
      { keys: typesParam, key_by_type: true }
    );
  }

  async fetchActivityLaps(activityId: number): Promise<StravaLap[]> {
    return this.makeRequest<StravaLap[]>(
      `https://www.strava.com/api/v3/activities/${activityId}/laps`
    );
  }

  getRateLimitInfo(): { remaining: number; resetTime: Date } {
    return {
      remaining: this.rateLimitRemaining,
      resetTime: new Date(this.rateLimitReset),
    };
  }
}
