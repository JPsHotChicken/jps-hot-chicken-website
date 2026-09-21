import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * `next/font` is compiled away by Next's own build and means nothing to Vite,
 * so any component that loads a font gets a plain class name instead.
 */
vi.mock("next/font/google", () => {
  const font = () => ({ className: "font-stub", style: { fontFamily: "stub" }, variable: "" });
  return { Blinker: font, Dancing_Script: font };
});

/**
 * An in-memory `localStorage`, for the jsdom environment that arrives without
 * one. Only installed when it is genuinely missing, so a future jsdom that
 * brings its own is left alone.
 */
if (typeof window !== "undefined" && !window.localStorage) {
  let data: Record<string, string> = {};

  const storage: Storage = {
    get length() {
      return Object.keys(data).length;
    },
    clear: () => {
      data = {};
    },
    getItem: (key) => (key in data ? data[key] : null),
    key: (index) => Object.keys(data)[index] ?? null,
    removeItem: (key) => {
      delete data[key];
    },
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };

  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
}

afterEach(() => {
  cleanup();
});
