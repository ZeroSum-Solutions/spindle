"use client";

import { CompletionView } from "@/components/learn/complete-lesson";
import { QuizView } from "@/components/learn/module-quiz";
import { QUESTIONS } from "../../quiz-board";

/** The graded quiz before submitting (synthetic questions; nothing is sent). */
export function ScreenQuiz() {
  return <QuizView questions={QUESTIONS} state={{ status: "idle" }} pending={false} action={() => {}} onTryAgain={() => {}} />;
}

/** The completion control as it reads once the lesson is done (nothing is sent). */
export function ScreenCompletion() {
  return (
    <CompletionView
      state={{ status: "idle" }}
      pending={false}
      done
      receipt={
        <>
          <span className="font-medium">Completed.</span> Every lesson in this module is done and the quiz is passed.
        </>
      }
      action={() => {}}
    />
  );
}
