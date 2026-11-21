/**
 * Today's weather for the staff home page, in the restaurant's own words.
 *
 * The forecast comes from Open-Meteo, which reports conditions as WMO weather
 * codes. Those are folded here into the handful of scenes the page can draw.
 */

/** The scenes the weather band knows how to draw. */
export type WeatherKind = "clear" | "partly" | "overcast" | "fog" | "rain" | "snow" | "storm";

export type Weather = {
  kind: WeatherKind;
  /** Daylight right now, so a clear evening gets a moon rather than a sun. */
  isDay: boolean;
  /** "Sunny", "Light rain" — what the band says under the temperature. */
  label: string;
  /** Degrees Fahrenheit, rounded. */
  temperature: number;
  high: number | null;
  low: number | null;
  /** Today's highest chance of rain, 0–100, when the forecast gives one. */
  rainChance: number | null;
};

export const WEATHER_KINDS: readonly WeatherKind[] = [
  "clear",
  "partly",
  "overcast",
  "fog",
  "rain",
  "snow",
  "storm",
];

/** WMO code → scene and wording. Codes not listed fall back to overcast. */
const CODES: Record<number, { kind: WeatherKind; label: string }> = {
  0: { kind: "clear", label: "Sunny" },
  1: { kind: "clear", label: "Mostly sunny" },
  2: { kind: "partly", label: "Partly cloudy" },
  3: { kind: "overcast", label: "Overcast" },
  45: { kind: "fog", label: "Foggy" },
  48: { kind: "fog", label: "Freezing fog" },
  51: { kind: "rain", label: "Light drizzle" },
  53: { kind: "rain", label: "Drizzle" },
  55: { kind: "rain", label: "Heavy drizzle" },
  56: { kind: "rain", label: "Freezing drizzle" },
  57: { kind: "rain", label: "Freezing drizzle" },
  61: { kind: "rain", label: "Light rain" },
  63: { kind: "rain", label: "Rain" },
  65: { kind: "rain", label: "Heavy rain" },
  66: { kind: "rain", label: "Freezing rain" },
  67: { kind: "rain", label: "Freezing rain" },
  71: { kind: "snow", label: "Light snow" },
  73: { kind: "snow", label: "Snow" },
  75: { kind: "snow", label: "Heavy snow" },
  77: { kind: "snow", label: "Snow grains" },
  80: { kind: "rain", label: "Light showers" },
  81: { kind: "rain", label: "Showers" },
  82: { kind: "rain", label: "Heavy showers" },
  85: { kind: "snow", label: "Snow showers" },
  86: { kind: "snow", label: "Heavy snow showers" },
  95: { kind: "storm", label: "Thunderstorms" },
  96: { kind: "storm", label: "Thunderstorms with hail" },
  99: { kind: "storm", label: "Thunderstorms with hail" },
};

/** Scene and wording for a WMO code. A clear night says "Clear", not "Sunny". */
export function describeWeatherCode(
  code: number,
  isDay: boolean,
): { kind: WeatherKind; label: string } {
  const entry = CODES[code] ?? { kind: "overcast", label: "Cloudy" };
  if (!isDay && entry.kind === "clear") {
    return { kind: "clear", label: code === 0 ? "Clear" : "Mostly clear" };
  }
  return entry;
}

/** The shape of the Open-Meteo answer this page asks for. */
export type OpenMeteoResponse = {
  current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
  daily?: {
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
};

const rounded = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;

/** Turn an Open-Meteo answer into `Weather`, or `null` if it is missing the basics. */
export function parseOpenMeteo(data: OpenMeteoResponse): Weather | null {
  const temperature = rounded(data.current?.temperature_2m);
  const code = data.current?.weather_code;
  if (temperature === null || typeof code !== "number") return null;

  const isDay = data.current?.is_day !== 0;
  return {
    ...describeWeatherCode(code, isDay),
    isDay,
    temperature,
    high: rounded(data.daily?.temperature_2m_max?.[0]),
    low: rounded(data.daily?.temperature_2m_min?.[0]),
    rainChance: rounded(data.daily?.precipitation_probability_max?.[0]),
  };
}

/**
 * The only four pictures the weather card draws. Everything the forecast can
 * say folds into one of them: any precipitation reads as rain, fog and heavy
 * cloud as overcast, and a clear or partly clear sky is the sun by day and the
 * moon by night.
 */
export type WeatherScene = "sunny" | "overcast" | "rain" | "moon";

export function weatherScene(weather: Pick<Weather, "kind" | "isDay">): WeatherScene {
  switch (weather.kind) {
    case "rain":
    case "snow":
    case "storm":
      return "rain";
    case "overcast":
    case "fog":
      return "overcast";
    case "clear":
    case "partly":
      return weather.isDay ? "sunny" : "moon";
  }
}

export const WEATHER_SCENE_LABELS: Record<WeatherScene, string> = {
  sunny: "Sunny",
  overcast: "Overcast",
  rain: "Rain",
  moon: "Clear night",
};
