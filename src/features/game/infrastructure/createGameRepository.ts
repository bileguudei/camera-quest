"use client";

import { hasProductionBackend } from "@/shared/env/publicEnv";
import { createEnvironmentRepository } from "camera-quest-environment-repository";
import type { GameRepository } from "./gameRepository";
import { SupabaseGameRepository } from "./supabaseGameRepository";

let repository: GameRepository | null = null;

export function getGameRepository(): GameRepository {
  repository ??= hasProductionBackend
    ? new SupabaseGameRepository()
    : createEnvironmentRepository();
  return repository;
}
