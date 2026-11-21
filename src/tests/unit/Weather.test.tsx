import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WeatherCard } from "@/components/staff/WeatherCard";
import { describeWeatherCode, parseOpenMeteo, WEATHER_KINDS, weatherScene } from "@/lib/weather";

describe("describeWeatherCode", () => {
  it.each([
    [0, "clear", "Sunny"],
    [2, "partly", "Partly cloudy"],
    [3, "overcast", "Overcast"],
    [45, "fog", "Foggy"],
    [63, "rain", "Rain"],
    [81, "rain", "Showers"],
    [73, "snow", "Snow"],
    [95, "storm", "Thunderstorms"],
  ] as const)("code %i is %s", (code, kind, label) => {
    expect(describeWeatherCode(code, true)).toEqual({ kind, label });
  });

  it("calls a clear night clear, not sunny", () => {
    expect(describeWeatherCode(0, false)).toEqual({ kind: "clear", label: "Clear" });
  });

  it("falls back to cloudy for a code it doesn't know", () => {
    expect(describeWeatherCode(42, true)).toEqual({ kind: "overcast", label: "Cloudy" });
  });
});

describe("parseOpenMeteo", () => {
  it("reads the current conditions and today's range", () => {
    expect(
      parseOpenMeteo({
        current: { temperature_2m: 72.7, weather_code: 61, is_day: 1 },
        daily: {
          temperature_2m_max: [72.9],
          temperature_2m_min: [42.4],
          precipitation_probability_max: [80],
        },
      }),
    ).toEqual({
      kind: "rain",
      label: "Light rain",
      isDay: true,
      temperature: 73,
      high: 73,
      low: 42,
      rainChance: 80,
    });
  });

  it("gives up when the basics are missing", () => {
    expect(parseOpenMeteo({})).toBeNull();
    expect(parseOpenMeteo({ current: { temperature_2m: 50 } })).toBeNull();
  });
});

describe("weatherScene", () => {
  it.each([
    ["clear", true, "sunny"],
    ["partly", true, "sunny"],
    ["clear", false, "moon"],
    ["partly", false, "moon"],
    ["overcast", true, "overcast"],
    ["fog", false, "overcast"],
    ["rain", true, "rain"],
    ["storm", false, "rain"],
    ["snow", true, "rain"],
  ] as const)("%s (day: %s) shows %s", (kind, isDay, scene) => {
    expect(weatherScene({ kind, isDay })).toBe(scene);
  });
});

describe("WeatherCard", () => {
  it.each(WEATHER_KINDS)("draws %s as a picture with no words on it", (kind) => {
    for (const isDay of [true, false]) {
      const { unmount } = render(
        <WeatherCard
          weather={{ kind, isDay, label: kind, temperature: 55, high: 60, low: 40, rainChance: 10 }}
        />,
      );
      const card = screen.getByRole("img", { name: /^Weather: / });
      expect(card).toHaveAttribute("data-scene", weatherScene({ kind, isDay }));
      expect(card.textContent).toBe("");
      unmount();
    }
  });
});
