"use client";

import { QuizView } from "@/components/learn/module-quiz";
import type { QuizQuestionView, QuizState } from "@/lib/learning/quiz";

// Development-only specimen of the graded quiz states, with synthetic questions.
const QUESTIONS: QuizQuestionView[] = [
  { questionId: "l1:q1", lessonTitle: "Synthetic lesson one", prompt: "Synthetic graded question one?", options: ["Synthetic option A", "Synthetic option B"] },
  { questionId: "l2:q1", lessonTitle: "Synthetic lesson two", prompt: "Synthetic graded question two?", options: ["Synthetic option A", "Synthetic option B", "Synthetic option C"] },
];

const STATES: [string, QuizState][] = [
  ["Not submitted", { status: "idle" }],
  ["Submit refused", { status: "error", kind: "rejected", message: "Your answers did not match this quiz. Nothing was saved. Reload the page and try again." }],
  ["Submit unconfirmed", { status: "error", kind: "unconfirmed", message: "We could not confirm whether your answers were saved. Submit the same answers again: if they were saved, they will not count twice." }],
  ["Attempt key conflict", { status: "error", kind: "key-conflict", message: "These answers differ from an attempt you already submitted. Start a new attempt to submit them." }],
  [
    "Scored: not passed, with feedback",
    {
      status: "result",
      attemptId: "a1",
      correct: 1,
      total: 2,
      passed: false,
      feedback: [
        { questionId: "l1:q1", correct: true, explanation: "Synthetic explanation one." },
        { questionId: "l2:q1", correct: false, explanation: "Synthetic explanation two." },
      ],
    },
  ],
  ["Scored: passed, feedback withheld", { status: "result", attemptId: "a2", correct: 2, total: 2, passed: true, feedback: null }],
];

export function QuizBoard() {
  return (
    <div className="flex flex-col gap-10">
      {STATES.map(([label, state]) => (
        <div key={label} className="flex flex-col gap-3">
          <p className="font-mono text-code text-text-muted">{label}</p>
          <QuizView questions={QUESTIONS} state={state} pending={false} action={() => {}} onTryAgain={() => {}} />
        </div>
      ))}
    </div>
  );
}
