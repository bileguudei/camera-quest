import type { HeadPose } from "./headPose";

export type ExpressionChallengeId =
  | "smile"
  | "surprise"
  | "wink_left"
  | "wink_right"
  | "eyes_closed"
  | "brow_raise"
  | "kiss"
  | "frown"
  | "squint"
  | "mouth_left"
  | "mouth_right"
  | "lip_press";

export type FusionChallengeId =
  | "fusion_smile_wink_left"
  | "fusion_smile_wink_right"
  | "fusion_surprise_brow"
  | "fusion_kiss_eyes"
  | "fusion_frown_squint"
  | "fusion_smile_brow";

export type MotionFusionChallengeId =
  | "fusion_smile_tilt_left"
  | "fusion_surprise_turn_right"
  | "fusion_kiss_tilt_right"
  | "fusion_frown_turn_left"
  | "fusion_brow_nod_up"
  | "fusion_squint_nod_down";

export type HeadChallengeId =
  | "head_tilt_left"
  | "head_tilt_right"
  | "head_turn_left"
  | "head_turn_right"
  | "head_nod_up"
  | "head_nod_down";

export type MimicChallengeId = FusionChallengeId | MotionFusionChallengeId;
export type ScorableMimicChallengeId =
  | ExpressionChallengeId
  | MimicChallengeId
  | HeadChallengeId;
export type MimicRoundKind = "expression-fusion" | "motion-fusion";

export interface NormalizedPoint {
  x: number;
  y: number;
  z?: number;
}

export interface MimicObservation {
  faceLandmarks: NormalizedPoint[];
  blendshapes: Record<string, number>;
  headPose: HeadPose | null;
}

export interface MimicBaseline {
  blendshapes: Record<string, number>;
  headPose: HeadPose | null;
}

export interface MimicRound {
  id: MimicChallengeId;
  title: string;
  shortTitle: string;
  instruction: string;
  kind: MimicRoundKind;
}

export interface MimicScoreComponent {
  id: string;
  label: string;
  score: number;
}

export interface MimicEvaluation {
  score: number;
  feedback: string;
  components: readonly MimicScoreComponent[];
}

export const FUSION_ROUNDS: readonly MimicRound[] = [
  {
    id: "fusion_smile_wink_left",
    title: "ИНЭЭ + ЗҮҮН ИРМЭЛТ",
    shortTitle: "ИНЭЭ + З.ИРМЭ",
    instruction: "Инээмсэглээд зөвхөн зүүн нүдээ ирмээрэй",
    kind: "expression-fusion",
  },
  {
    id: "fusion_smile_wink_right",
    title: "ИНЭЭ + БАРУУН ИРМЭЛТ",
    shortTitle: "ИНЭЭ + Б.ИРМЭ",
    instruction: "Инээмсэглээд зөвхөн баруун нүдээ ирмээрэй",
    kind: "expression-fusion",
  },
  {
    id: "fusion_surprise_brow",
    title: "ГАЙХ + ХӨМСӨГ",
    shortTitle: "ГАЙХ + ХӨМСӨГ",
    instruction: "Амаа ангайгаад хөмсгөө зэрэг өргөөрэй",
    kind: "expression-fusion",
  },
  {
    id: "fusion_kiss_eyes",
    title: "ҮНСЭЛТ + НҮДЭЭ АНЬ",
    shortTitle: "ҮНС + АНЬ",
    instruction: "Уруулаа цорвойлгоод хоёр нүдээ аниарай",
    kind: "expression-fusion",
  },
  {
    id: "fusion_frown_squint",
    title: "УУР + ЖАРТАЙЛТ",
    shortTitle: "УУР + ЖАРТ",
    instruction: "Ууртай царай гаргаад хоёр нүдээ жартайлга",
    kind: "expression-fusion",
  },
  {
    id: "fusion_smile_brow",
    title: "ИНЭЭ + ХӨМСӨГ",
    shortTitle: "ИНЭЭ + ХӨМСӨГ",
    instruction: "Том инээгээд хоёр хөмсгөө дээш өргөөрэй",
    kind: "expression-fusion",
  },
] as const;

export const MOTION_FUSION_ROUNDS: readonly MimicRound[] = [
  {
    id: "fusion_smile_tilt_left",
    title: "ИНЭЭ + ЗҮҮН ХАЗАЙЛТ",
    shortTitle: "ИНЭЭ + З.ХАЗАЙ",
    instruction: "Инээмсэглээд толгойгоо зүүн мөр рүүгээ хазайлгаарай",
    kind: "motion-fusion",
  },
  {
    id: "fusion_surprise_turn_right",
    title: "ГАЙХ + БАРУУН ХАР",
    shortTitle: "ГАЙХ + Б.ХАР",
    instruction: "Гайхсан царай гаргаад баруун тийш хараарай",
    kind: "motion-fusion",
  },
  {
    id: "fusion_kiss_tilt_right",
    title: "ҮНС + БАРУУН ХАЗАЙЛТ",
    shortTitle: "ҮНС + Б.ХАЗАЙ",
    instruction: "Уруулаа цорвойлгоод толгойгоо баруун тийш хазайлгаарай",
    kind: "motion-fusion",
  },
  {
    id: "fusion_frown_turn_left",
    title: "УУР + ЗҮҮН ХАР",
    shortTitle: "УУР + З.ХАР",
    instruction: "Ууртай царай гаргаад зүүн тийш хараарай",
    kind: "motion-fusion",
  },
  {
    id: "fusion_brow_nod_up",
    title: "ХӨМСӨГ + ДЭЭШ ХАР",
    shortTitle: "ХӨМСӨГ + ДЭЭШ",
    instruction: "Хөмсгөө өргөөд эрүүгээ бага зэрэг дээшлүүлээрэй",
    kind: "motion-fusion",
  },
  {
    id: "fusion_squint_nod_down",
    title: "ЖАРТАЙ + ДООШ ХАР",
    shortTitle: "ЖАРТ + ДООШ",
    instruction: "Нүдээ жартайлгаад эрүүгээ бага зэрэг доошлуулаарай",
    kind: "motion-fusion",
  },
] as const;

/** The only production deck: expression pairs first, then expression + head motion. */
export const MIMIC_ROUNDS: readonly MimicRound[] = [
  ...FUSION_ROUNDS,
  ...MOTION_FUSION_ROUNDS,
];

export const PASS_SCORE = 0.68;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const scale = (value: number, start: number, target: number) =>
  clamp01((value - start) / (target - start));

const blendshape = (observation: MimicObservation, name: string) =>
  observation.blendshapes[name] ?? 0;

const baselineShape = (baseline: MimicBaseline | undefined, name: string) =>
  baseline?.blendshapes[name];

const average = (left: number, right: number) => (left + right) / 2;

const baselineAverage = (
  baseline: MimicBaseline | undefined,
  leftName: string,
  rightName: string,
) => {
  const left = baselineShape(baseline, leftName);
  const right = baselineShape(baseline, rightName);
  return left === undefined || right === undefined ? undefined : average(left, right);
};

const adaptiveScore = (
  value: number,
  baselineValue: number | undefined,
  absoluteRange: readonly [number, number],
  deltaRange: readonly [number, number],
) =>
  baselineValue === undefined
    ? scale(value, absoluteRange[0], absoluteRange[1])
    : scale(Math.max(0, value - baselineValue), deltaRange[0], deltaRange[1]);

const directionalWinkScore = (
  observation: MimicObservation,
  baseline: MimicBaseline | undefined,
  closedEye: "eyeBlinkLeft" | "eyeBlinkRight",
  openEye: "eyeBlinkLeft" | "eyeBlinkRight",
) => {
  const closed = adaptiveScore(
    blendshape(observation, closedEye),
    baselineShape(baseline, closedEye),
    [0.42, 0.78],
    [0.16, 0.45],
  );
  const openValue = blendshape(observation, openEye);
  const openBaseline = baselineShape(baseline, openEye);
  const unwantedClosure =
    openBaseline === undefined ? openValue : Math.max(0, openValue - openBaseline);
  const penalty =
    openBaseline === undefined
      ? scale(unwantedClosure, 0.22, 0.62)
      : scale(unwantedClosure, 0.12, 0.38);
  return Math.min(closed, 1 - penalty);
};

/** Builds a noise-resistant neutral-face profile from the framing samples. */
export function buildMimicBaseline(
  samples: readonly MimicObservation[],
): MimicBaseline {
  const names = new Set<string>();
  for (const sample of samples) {
    for (const name of Object.keys(sample.blendshapes)) names.add(name);
  }

  const blendshapes: Record<string, number> = {};
  for (const name of names) {
    const values = samples
      .map((sample) => sample.blendshapes[name] ?? 0)
      .toSorted((left, right) => left - right);
    if (values.length === 0) continue;
    const middle = Math.floor(values.length / 2);
    blendshapes[name] =
      values.length % 2 === 0
        ? average(values[middle - 1] ?? 0, values[middle] ?? 0)
        : (values[middle] ?? 0);
  }

  const poses = samples.flatMap((sample) => (sample.headPose ? [sample.headPose] : []));
  const medianPoseValue = (axis: keyof HeadPose) => {
    const values = poses.map((pose) => pose[axis]).toSorted((left, right) => left - right);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 0
      ? average(values[middle - 1] ?? 0, values[middle] ?? 0)
      : (values[middle] ?? 0);
  };

  return {
    blendshapes,
    headPose:
      poses.length === 0
        ? null
        : {
            pitch: medianPoseValue("pitch"),
            yaw: medianPoseValue("yaw"),
            roll: medianPoseValue("roll"),
          },
  };
}

const component = (
  id: string,
  label: string,
  score: number,
  feedback: string,
): MimicEvaluation => ({
  score,
  feedback: score >= PASS_SCORE ? "Яг зөв — бариарай!" : feedback,
  components: [{ id, label, score }],
});

const expressionEvaluation = (
  challengeId: ExpressionChallengeId,
  observation: MimicObservation,
  baseline?: MimicBaseline,
): MimicEvaluation => {
  switch (challengeId) {
    case "smile": {
      const smile = average(
        blendshape(observation, "mouthSmileLeft"),
        blendshape(observation, "mouthSmileRight"),
      );
      const neutral = baselineAverage(
        baseline,
        "mouthSmileLeft",
        "mouthSmileRight",
      );
      return component(
        "smile",
        "Инээмсэглэл",
        adaptiveScore(smile, neutral, [0.22, 0.52], [0.1, 0.3]),
        "Илүү чанга инээгээрэй",
      );
    }
    case "surprise":
      return component(
        "surprise",
        "Амаа ангайлгах",
        adaptiveScore(
          blendshape(observation, "jawOpen"),
          baselineShape(baseline, "jawOpen"),
          [0.18, 0.48],
          [0.1, 0.3],
        ),
        "Амаа арай том ангайгаарай",
      );
    case "wink_left": {
      const score = directionalWinkScore(
        observation,
        baseline,
        "eyeBlinkLeft",
        "eyeBlinkRight",
      );
      const oppositeClosed = blendshape(observation, "eyeBlinkRight") > 0.48;
      return component(
        "wink_left",
        "Зүүн ирмэлт",
        score,
        oppositeClosed
          ? "Баруун нүдээ нээлттэй байлгаарай"
          : "Зүүн нүдээ арай илүү аниарай",
      );
    }
    case "wink_right": {
      const score = directionalWinkScore(
        observation,
        baseline,
        "eyeBlinkRight",
        "eyeBlinkLeft",
      );
      const oppositeClosed = blendshape(observation, "eyeBlinkLeft") > 0.48;
      return component(
        "wink_right",
        "Баруун ирмэлт",
        score,
        oppositeClosed
          ? "Зүүн нүдээ нээлттэй байлгаарай"
          : "Баруун нүдээ арай илүү аниарай",
      );
    }
    case "eyes_closed":
      return component(
        "eyes_closed",
        "Хоёр нүд",
        Math.min(
        adaptiveScore(
          blendshape(observation, "eyeBlinkLeft"),
          baselineShape(baseline, "eyeBlinkLeft"),
          [0.42, 0.78],
          [0.16, 0.45],
        ),
        adaptiveScore(
          blendshape(observation, "eyeBlinkRight"),
          baselineShape(baseline, "eyeBlinkRight"),
          [0.42, 0.78],
          [0.16, 0.45],
        ),
        ),
        "Хоёр нүдээ зэрэг бүтэн аниарай",
      );
    case "kiss":
      return component(
        "kiss",
        "Уруул",
        Math.max(
          adaptiveScore(
            blendshape(observation, "mouthPucker"),
            baselineShape(baseline, "mouthPucker"),
            [0.45, 0.78],
            [0.06, 0.18],
          ),
          adaptiveScore(
            blendshape(observation, "mouthFunnel"),
            baselineShape(baseline, "mouthFunnel"),
            [0.32, 0.65],
            [0.08, 0.24],
          ),
        ),
        "Уруулаа арай илүү цорвойлгоорой",
      );
    case "frown": {
      const mouth = average(
        blendshape(observation, "mouthFrownLeft"),
        blendshape(observation, "mouthFrownRight"),
      );
      const neutralMouth = baselineAverage(
        baseline,
        "mouthFrownLeft",
        "mouthFrownRight",
      );
      const brows = average(
        blendshape(observation, "browDownLeft"),
        blendshape(observation, "browDownRight"),
      );
      const neutralBrows = baselineAverage(
        baseline,
        "browDownLeft",
        "browDownRight",
      );
      return component(
        "frown",
        "Ууртай хувирал",
        Math.max(
          adaptiveScore(mouth, neutralMouth, [0.14, 0.4], [0.07, 0.22]),
          adaptiveScore(brows, neutralBrows, [0.16, 0.44], [0.08, 0.24]),
        ),
        "Амаа доошлуулж, хөмсгөө илүү зангидаарай",
      );
    }
    case "brow_raise": {
      const outer = average(
        blendshape(observation, "browOuterUpLeft"),
        blendshape(observation, "browOuterUpRight"),
      );
      const neutralOuter = baselineAverage(
        baseline,
        "browOuterUpLeft",
        "browOuterUpRight",
      );
      return component(
        "brow_raise",
        "Хөмсөг",
        Math.max(
          adaptiveScore(
            blendshape(observation, "browInnerUp"),
            baselineShape(baseline, "browInnerUp"),
            [0.17, 0.46],
            [0.08, 0.25],
          ),
          adaptiveScore(outer, neutralOuter, [0.17, 0.46], [0.08, 0.25]),
        ),
        "Хөмсгөө арай дээш өргөөрэй",
      );
    }
    case "squint": {
      const squint = average(
        blendshape(observation, "eyeSquintLeft"),
        blendshape(observation, "eyeSquintRight"),
      );
      const neutral = baselineAverage(
        baseline,
        "eyeSquintLeft",
        "eyeSquintRight",
      );
      return component(
        "squint",
        "Жартайлт",
        adaptiveScore(squint, neutral, [0.3, 0.62], [0.08, 0.28]),
        "Хоёр нүдээ арай илүү жартайлгаарай",
      );
    }
    case "mouth_left":
      return component(
        "mouth_left",
        "Ам зүүн",
        adaptiveScore(
          blendshape(observation, "mouthLeft"),
          baselineShape(baseline, "mouthLeft"),
          [0.32, 0.66],
          [0.08, 0.28],
        ),
        "Уруулаа зүүн тийш арай илүү мурийлгаарай",
      );
    case "mouth_right":
      return component(
        "mouth_right",
        "Ам баруун",
        adaptiveScore(
          blendshape(observation, "mouthRight"),
          baselineShape(baseline, "mouthRight"),
          [0.32, 0.66],
          [0.08, 0.28],
        ),
        "Уруулаа баруун тийш арай илүү мурийлгаарай",
      );
    case "lip_press": {
      const press = average(
        blendshape(observation, "mouthPressLeft"),
        blendshape(observation, "mouthPressRight"),
      );
      const neutral = baselineAverage(
        baseline,
        "mouthPressLeft",
        "mouthPressRight",
      );
      return component(
        "lip_press",
        "Уруул жим",
        adaptiveScore(press, neutral, [0.28, 0.6], [0.08, 0.28]),
        "Хоёр уруулаа арай чанга нийлүүлээрэй",
      );
    }
  }
};

const fuse = (
  left: MimicEvaluation,
  right: MimicEvaluation,
): MimicEvaluation => {
  const weakest = left.score <= right.score ? left : right;
  return {
    score: Math.min(left.score, right.score),
    feedback:
      left.score >= PASS_SCORE && right.score >= PASS_SCORE
        ? "Fusion зөв — хоёуланг нь бариарай!"
        : weakest.feedback,
    components: [left.components[0], right.components[0]].filter(
      (item): item is MimicScoreComponent => Boolean(item),
    ),
  };
};

const headEvaluation = (
  challengeId: HeadChallengeId,
  observation: MimicObservation,
  baseline?: MimicBaseline,
): MimicEvaluation => {
  if (!observation.headPose) {
    return component("head", "Толгойн байрлал", 0, "Нүүрээ бүтнээр нь кадарт бариарай");
  }

  const settings: Record<
    HeadChallengeId,
    {
      axis: keyof HeadPose;
      direction: 1 | -1;
      start: number;
      target: number;
      label: string;
      feedback: string;
    }
  > = {
    head_tilt_left: {
      axis: "roll",
      direction: 1,
      start: 0.08,
      target: 0.27,
      label: "Зүүн хазайлт",
      feedback: "Толгойгоо зүүн мөр рүүгээ арай илүү хазайлгаарай",
    },
    head_tilt_right: {
      axis: "roll",
      direction: -1,
      start: 0.08,
      target: 0.27,
      label: "Баруун хазайлт",
      feedback: "Толгойгоо баруун мөр рүүгээ арай илүү хазайлгаарай",
    },
    head_turn_left: {
      axis: "yaw",
      direction: 1,
      start: 0.09,
      target: 0.29,
      label: "Зүүн эргэлт",
      feedback: "Нүүрээ зүүн тийш арай илүү эргүүлээрэй",
    },
    head_turn_right: {
      axis: "yaw",
      direction: -1,
      start: 0.09,
      target: 0.29,
      label: "Баруун эргэлт",
      feedback: "Нүүрээ баруун тийш арай илүү эргүүлээрэй",
    },
    head_nod_up: {
      axis: "pitch",
      direction: 1,
      start: 0.07,
      target: 0.23,
      label: "Дээш дохилт",
      feedback: "Эрүүгээ арай дээш өргөөрэй",
    },
    head_nod_down: {
      axis: "pitch",
      direction: -1,
      start: 0.07,
      target: 0.23,
      label: "Доош дохилт",
      feedback: "Эрүүгээ арай доош буулгаарай",
    },
  };
  const setting = settings[challengeId];
  const neutral = baseline?.headPose?.[setting.axis] ?? 0;
  const delta =
    (observation.headPose[setting.axis] - neutral) * setting.direction;
  const wrongDirection = delta < -setting.start;
  return component(
    challengeId,
    setting.label,
    scale(delta, setting.start, setting.target),
    wrongDirection ? "Нөгөө тал руугаа хөдөлгөөрэй" : setting.feedback,
  );
};

/** Returns both the calibrated score and the exact next action for the HUD. */
export function evaluateMimic(
  challengeId: ScorableMimicChallengeId,
  observation: MimicObservation,
  baseline?: MimicBaseline,
): MimicEvaluation {
  if (observation.faceLandmarks.length === 0) {
    return { score: 0, feedback: "Нүүрээ кадрын төвд оруулаарай", components: [] };
  }

  if (challengeId.startsWith("head_")) {
    return headEvaluation(challengeId as HeadChallengeId, observation, baseline);
  }
  if (!challengeId.startsWith("fusion_")) {
    return expressionEvaluation(challengeId as ExpressionChallengeId, observation, baseline);
  }

  switch (challengeId as MimicChallengeId) {
    case "fusion_smile_wink_left":
      return fuse(
        expressionEvaluation("smile", observation, baseline),
        expressionEvaluation("wink_left", observation, baseline),
      );
    case "fusion_smile_wink_right":
      return fuse(
        expressionEvaluation("smile", observation, baseline),
        expressionEvaluation("wink_right", observation, baseline),
      );
    case "fusion_surprise_brow":
      return fuse(
        expressionEvaluation("surprise", observation, baseline),
        expressionEvaluation("brow_raise", observation, baseline),
      );
    case "fusion_kiss_eyes":
      return fuse(
        expressionEvaluation("kiss", observation, baseline),
        expressionEvaluation("eyes_closed", observation, baseline),
      );
    case "fusion_frown_squint":
      return fuse(
        expressionEvaluation("frown", observation, baseline),
        expressionEvaluation("squint", observation, baseline),
      );
    case "fusion_smile_brow":
      return fuse(
        expressionEvaluation("smile", observation, baseline),
        expressionEvaluation("brow_raise", observation, baseline),
      );
    case "fusion_smile_tilt_left":
      return fuse(
        expressionEvaluation("smile", observation, baseline),
        headEvaluation("head_tilt_left", observation, baseline),
      );
    case "fusion_surprise_turn_right":
      return fuse(
        expressionEvaluation("surprise", observation, baseline),
        headEvaluation("head_turn_right", observation, baseline),
      );
    case "fusion_kiss_tilt_right":
      return fuse(
        expressionEvaluation("kiss", observation, baseline),
        headEvaluation("head_tilt_right", observation, baseline),
      );
    case "fusion_frown_turn_left":
      return fuse(
        expressionEvaluation("frown", observation, baseline),
        headEvaluation("head_turn_left", observation, baseline),
      );
    case "fusion_brow_nod_up":
      return fuse(
        expressionEvaluation("brow_raise", observation, baseline),
        headEvaluation("head_nod_up", observation, baseline),
      );
    case "fusion_squint_nod_down":
      return fuse(
        expressionEvaluation("squint", observation, baseline),
        headEvaluation("head_nod_down", observation, baseline),
      );
  }
}

/** Compatibility seam for tests and callers that only need the numeric score. */
export function scoreMimic(
  challengeId: ScorableMimicChallengeId,
  observation: MimicObservation,
  baseline?: MimicBaseline,
): number {
  return evaluateMimic(challengeId, observation, baseline).score;
}

const bounds = (landmarks: NormalizedPoint[]) => {
  if (landmarks.length === 0) return null;
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const point of landmarks) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return {
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
};

/** A normal selfie crop: no hips, knees, feet, or stepping across the room. */
export function isSelfieFramed(landmarks: NormalizedPoint[]): boolean {
  const face = bounds(landmarks);
  if (!face) return false;
  return (
    face.width >= 0.18 &&
    face.width <= 0.72 &&
    face.height >= 0.2 &&
    face.height <= 0.82 &&
    face.centerX >= 0.24 &&
    face.centerX <= 0.76 &&
    face.centerY >= 0.2 &&
    face.centerY <= 0.72
  );
}

export function framingHint(landmarks: NormalizedPoint[]): string {
  const face = bounds(landmarks);
  if (!face) return "Нүүрээ кадрын төвд оруулаарай";
  if (face.width < 0.18 || face.height < 0.2) return "Утсаа нүүр рүүгээ ойртуулаарай";
  if (face.width > 0.72 || face.height > 0.82) return "Утсаа жаахан холдуулаарай";
  if (face.centerX < 0.24) return "Нүүрээ зүүн тийш жаахан шилжүүлээрэй";
  if (face.centerX > 0.76) return "Нүүрээ баруун тийш жаахан шилжүүлээрэй";
  return "Нүүрээ хүрээний төвд бариарай";
}
