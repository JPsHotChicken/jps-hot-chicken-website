import "server-only";

import { siteConfig } from "@/data/site";
import { RESTAURANT_TIME_ZONE } from "@/lib/schedule";
import { parseOpenMeteo, type OpenMeteoResponse, type Weather } from "@/lib/weather";

/** How long one forecast is reused before asking again, in seconds. */
const WEATHER_REVALIDATE_SECONDS = 15 * 60;

/** Give up quickly: the weather is decoration, and the schedule must not wait on it. */
const WEATHER_TIMEOUT_MS = 2500;

/**
 * Today's weather at the restaurant, or `null` when the forecast can't be had.
 *
 * Both stores are a few miles apart, so one forecast covers them; it is taken
 * at the first open one. Only the store's public coordinates leave the server —
 * nothing about who is looking. Open-Meteo needs no key.
 */
export async function loadTodaysWeather(): Promise<Weather | null> {
  const store = siteConfig.locations.find((location) => location.isOpen);
  if (!store) return null;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(store.lat),
    longitude: String(store.lng),
    current: "temperature_2m,weather_code,is_day",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    temperature_unit: "fahrenheit",
    timezone: RESTAURANT_TIME_ZONE,
    forecast_days: "1",
  }).toString();

  try {
    const response = await fetch(url, {
      next: { revalidate: WEATHER_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[weather] Open-Meteo answered ${response.status}`);
      return null;
    }
    return parseOpenMeteo((await response.json()) as OpenMeteoResponse);
  } catch (cause) {
    console.error("[weather] Could not load the forecast:", cause);
    return null;
  }
}
