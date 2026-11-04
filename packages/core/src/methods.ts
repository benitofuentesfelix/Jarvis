// Study methods: which technique fits a session, why it works, and the minute-by-minute
// script the student follows. Pure and deterministic, like the rest of the planner.

import type { SessionStep, SubjectStyle, Technique, Topic } from "./types";
import { DAY } from "./time";

export interface TechniqueInfo {
  label: string;
  /** One line on why it works, shown under the block. */
  why: string;
  /** How demanding it is, used to place it at the right time of day. */
  focus: 1 | 2 | 3;
}

export const TECHNIQUES: Record<Technique, TechniqueInfo> = {
  worked_examples: {
    label: "ejemplos resueltos",
    why: "Con un tema que aún no dominas, estudiar ejemplos resueltos antes de practicar solo te ahorra frustración y aprendes antes.",
    focus: 2,
  },
  elaboration: {
    label: "elaboración",
    why: "Explicar el porqué con tus palabras y conectar ideas crea comprensión de verdad, no solo memoria.",
    focus: 2,
  },
  active_recall: {
    label: "recuerdo activo",
    why: "Sacar la información de memoria la fija mucho más que releer o subrayar.",
    focus: 2,
  },
  deliberate_practice: {
    label: "práctica deliberada",
    why: "Practicar justo lo que te cuesta, con corrección inmediata, es lo que más sube la nota.",
    focus: 3,
  },
  interleaved: {
    label: "práctica intercalada",
    why: "Mezclar tipos de ejercicio te obliga a decidir qué método toca, igual que en el examen.",
    focus: 3,
  },
  practice_test: {
    label: "simulacro",
    why: "Un examen de prueba cronometrado es de lo más eficaz que existe: descubre tus fallos con tiempo para corregirlos.",
    focus: 3,
  },
  error_analysis: {
    label: "análisis de errores",
    why: "Entender por qué fallaste en el simulacro evita repetir el mismo error en el examen real.",
    focus: 2,
  },
  light_review: {
    label: "repaso final ligero",
    why: "La víspera rinde más un repaso suave y dormir bien que estudiar materia nueva.",
    focus: 1,
  },
  spaced_review: {
    label: "repaso espaciado",
    why: "Repasar justo cuando empiezas a olvidar hace que cada vez lo recuerdes durante más tiempo.",
    focus: 1,
  },
  task_work: {
    label: "trabajo de la tarea",
    why: "Bloques concretos y con margen evitan dejarlo para la última noche.",
    focus: 2,
  },
};

export function techniqueLabel(t: Technique): string {
  return TECHNIQUES[t].label;
}

type Template = [weight: number, label: string][];

/** Session scripts. `{t}` is replaced with the topic name. */
function template(technique: Technique, style: SubjectStyle): Template {
  const problems = style === "problemas";
  switch (technique) {
    case "worked_examples":
      return [
        [2, "Estudia dos ejemplos resueltos de {t} paso a paso"],
        [2, "Tapa la solución y rehazlos tú"],
        [5, "Ejercicios parecidos, del más fácil al más difícil"],
        [1, "Resume el método en tres pasos"],
      ];
    case "elaboration":
      return problems
        ? [
            [2, "Repasa la teoría clave de {t}"],
            [3, "Explica en voz alta por qué funciona cada fórmula"],
            [4, "Resuelve problemas justificando cada paso"],
            [1, "Mapa de una página: qué fórmula usar y cuándo"],
          ]
        : [
            [2, "Lee el apartado clave de {t}"],
            [4, "Explícalo en voz alta como si se lo contaras a alguien de 14 años"],
            [3, "Responde: ¿por qué pasa? ¿con qué se relaciona?"],
            [1, "Esquema de una página sin mirar"],
          ];
    case "active_recall":
      return problems
        ? [
            [1, "Escribe de memoria fórmulas y pasos clave de {t}"],
            [6, "Resuelve problemas sin mirar la teoría"],
            [2, "Corrige y apunta cada error en tu registro"],
            [1, "Rehaz el problema que peor te salió"],
          ]
        : [
            [1, "Hoja en blanco: escribe todo lo que recuerdes de {t}"],
            [3, "Compara con los apuntes y marca los huecos"],
            [4, "Hazte preguntas tipo examen sin mirar"],
            [2, "Repite el volcado solo de lo que fallaste"],
          ];
    case "interleaved":
      return [
        [1, "Elige ejercicios de varios temas y desordénalos"],
        [7, "Resuélvelos en orden aleatorio"],
        [2, "Revisa: ¿supiste qué método tocaba en cada uno?"],
      ];
    case "practice_test":
      return [
        [1, "Condiciones de examen: sin móvil, cronómetro en marcha"],
        [7, "Examen de prueba completo, sin mirar nada"],
        [2, "Corrige con la solución y ponte nota"],
      ];
    case "error_analysis":
      return [
        [3, "Clasifica los fallos del simulacro: concepto, cálculo o despiste"],
        [5, "Rehaz los ejercicios que fallaste"],
        [2, "Hoja resumen de una cara para la víspera"],
      ];
    case "light_review":
      return [
        [2, "Lee tu hoja resumen"],
        [2, "Diez preguntas rápidas de memoria"],
        [1, "Prepara el material y descansa"],
      ];
    case "spaced_review":
      return [
        [1, "Recuerda sin mirar las ideas clave de {t}"],
        [3, "Preguntas rápidas o tarjetas"],
        [1, "Repasa solo lo que fallaste"],
      ];
    case "deliberate_practice":
      return [
        [1, "Fija un objetivo concreto para esta sesión"],
        [7, "Práctica cronometrada"],
        [2, "Corrige y anota tus errores típicos"],
      ];
    case "task_work":
      return [
        [1, "Decide qué parte terminas hoy"],
        [8, "Trabajo concentrado, sin móvil"],
        [1, "Apunta el siguiente paso para retomarlo"],
      ];
  }
}

/** Splits `minutes` over a template, in 5-minute steps, keeping the total exact. */
export function scaleSteps(tpl: Template, minutes: number, topic = "el tema"): SessionStep[] {
  const total = tpl.reduce((a, [w]) => a + w, 0);
  const steps = tpl.map(([w, label]) => ({
    minutes: Math.max(5, Math.round((minutes * w) / total / 5) * 5),
    label: label.replace("{t}", topic),
  }));
  // Fix rounding on the longest step so the script adds up to the block.
  const diff = minutes - steps.reduce((a, s) => a + s.minutes, 0);
  const longest = steps.reduce((m, s, i) => (s.minutes > steps[m]!.minutes ? i : m), 0);
  steps[longest]!.minutes += diff;
  // Very short block: one step is clearer than a script of slivers.
  if (steps.some((s) => s.minutes < 5)) return [{ minutes, label: steps[0]!.label }];
  return steps;
}

export function sessionScript(args: {
  technique: Technique;
  minutes: number;
  style?: SubjectStyle;
  topic?: string;
  custom?: Template;
}): SessionStep[] {
  return scaleSteps(args.custom ?? template(args.technique, args.style ?? "teoria"), args.minutes, args.topic);
}

/** Below this mastery a topic is treated as not yet understood. */
export const WEAK = 0.5;

/**
 * Technique for a learning session (not the final mock or the eve of the exam),
 * from how well the topic is known.
 */
export function learningTechnique(mastery: number, style: SubjectStyle, multiTopic: boolean): Technique {
  if (mastery < WEAK) return style === "problemas" ? "worked_examples" : "elaboration";
  if (mastery < 0.75) return style === "problemas" ? "deliberate_practice" : "active_recall";
  return multiTopic ? "interleaved" : "active_recall";
}

/** Phase order for exam prep: understand first, then retrieve, then mix. */
export const PHASE_ORDER: Technique[] = [
  "worked_examples",
  "elaboration",
  "deliberate_practice",
  "active_recall",
  "interleaved",
  "practice_test",
  "error_analysis",
  "light_review",
];

/**
 * Distributes `n` sessions over topics, giving more to the weaker ones:
 * each session goes to the topic with the largest remaining gap per session.
 */
export function allocateTopics(topics: Topic[], n: number): Topic[] {
  if (!topics.length || n <= 0) return [];
  const count = new Map<string, number>();
  const out: Topic[] = [];
  for (let i = 0; i < n; i++) {
    let best = topics[0]!;
    let bestScore = -Infinity;
    for (const t of topics) {
      const score = (1.1 - t.mastery) / ((count.get(t.id) ?? 0) + 1);
      if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) < 1e-9 && t.id < best.id)) {
        best = t;
        bestScore = score;
      }
    }
    count.set(best.id, (count.get(best.id) ?? 0) + 1);
    out.push(best);
  }
  return out;
}

/**
 * Estimated probability of remembering a topic right now (0..1).
 * Calibrated so that retention is 90 % exactly when the review comes due.
 */
export function retention(topic: Topic, now: Date): number {
  const interval = Math.max(1, topic.intervalDays) * DAY;
  const due = Date.parse(topic.nextReview);
  const lastSeen = due - interval;
  const elapsed = Math.max(0, now.getTime() - lastSeen);
  return Math.exp((Math.log(0.9) * elapsed) / interval);
}

export type Outcome = "hecho" | "parcial" | "no_hecho";

/**
 * Learned pace per subject: >1 means work takes longer than estimated.
 * "A medias" pulls the factor up; "hecho" pulls it back toward 1. "No pude" says
 * nothing about pace (the session did not happen), so it is ignored.
 */
export function paceFromOutcomes(outcomes: { subjectId: string; outcome: Outcome; at: string }[]): Record<string, number> {
  const pace: Record<string, number> = {};
  const sorted = [...outcomes].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const o of sorted) {
    if (o.outcome === "no_hecho") continue;
    const p = pace[o.subjectId] ?? 1;
    const target = o.outcome === "parcial" ? 1.5 : 0.95;
    pace[o.subjectId] = Math.min(1.5, Math.max(0.8, p + (target - p) * 0.25));
  }
  for (const k of Object.keys(pace)) pace[k] = Number(pace[k]!.toFixed(3));
  return pace;
}
