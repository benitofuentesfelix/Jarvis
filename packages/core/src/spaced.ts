import type { Topic } from "./types";
import { DAY } from "./time";

/**
 * SM-2 spaced repetition update.
 * quality: 0 (blackout) .. 5 (perfect recall). The student answers with a 1-tap rating
 * after a review block; the UI maps "Fatal / Regular / Bien / Perfecto" to 1/3/4/5.
 */
export function reviewTopic(topic: Topic, quality: number, now: Date): Topic {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { easiness, intervalDays, repetitions } = topic;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.round(intervalDays * easiness);
  }
  easiness = Math.max(1.3, easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  // Mastery moves toward the quality signal, slower once it is high.
  const signal = q / 5;
  const mastery = Math.max(0, Math.min(1, topic.mastery + (signal - topic.mastery) * 0.35));

  return {
    ...topic,
    easiness: Number(easiness.toFixed(2)),
    intervalDays,
    repetitions,
    mastery: Number(mastery.toFixed(3)),
    nextReview: new Date(now.getTime() + intervalDays * DAY).toISOString(),
  };
}

export function newTopicState(): Pick<Topic, "easiness" | "intervalDays" | "repetitions" | "mastery"> {
  return { easiness: 2.5, intervalDays: 0, repetitions: 0, mastery: 0.3 };
}
