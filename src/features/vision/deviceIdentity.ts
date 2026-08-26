"use client";

const DEVICE_KEY = "camera-quest:device-id";
let memoryId: string | null = null;

export function visionDeviceId(): string {
  if (memoryId) return memoryId;
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored && stored.length >= 8 && stored.length <= 128) {
      memoryId = stored;
      return stored;
    }
  } catch {
    // Storage-restricted browsers still get a stable id for this page load.
  }
  memoryId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    window.localStorage.setItem(DEVICE_KEY, memoryId);
  } catch {
    // The in-memory id remains usable.
  }
  return memoryId;
}
