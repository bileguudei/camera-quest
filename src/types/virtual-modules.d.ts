declare module "camera-quest-dev-panel" {
  export function DevPanel(props: {
    onSuccess?: () => void;
    onTimeout?: () => void;
  }): import("react").ReactNode;
}

declare module "camera-quest-environment-repository" {
  export function createEnvironmentRepository(): import("@/features/game/infrastructure/gameRepository").GameRepository;
}
