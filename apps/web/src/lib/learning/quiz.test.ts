import { describe, expect, it } from "vitest";
import type { ModuleStatus } from "@spindle/schema";
import type { GradedQuestion } from "@spindle/engine";
import { fieldName, MISSING_ANSWERS, moduleStatusView, neededToPass, questionViews, readSubmission, resultState, classifySubmitError } from "./quiz";

const KEY = "6a64a1c2-0000-4000-8000-000000005619";
const Q: GradedQuestion[] = [
  { questionId: "l1:q1", lessonId: "l1", prompt: "Synthetic one?", options: ["A", "B"], answerIndex: 1, explanation: "Synthetic: B." },
  { questionId: "l1:q2", lessonId: "l1", prompt: "Synthetic two?", options: ["A", "B", "C"], answerIndex: 0, explanation: "Synthetic: A." },
  { questionId: "l2:q1", lessonId: "l2", prompt: "Synthetic three?", options: ["A", "B"], answerIndex: 0, explanation: "Synthetic: A." },
];

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}
const full = { attemptKey: KEY, [fieldName("l1:q1")]: "1", [fieldName("l1:q2")]: "2", [fieldName("l2:q1")]: "0" };

describe("questionViews", () => {
  it("keeps the answer key and explanation out of what the learner is sent", () => {
    const views = questionViews(Q, new Map([["l1", "Lesson one"], ["l2", "Lesson two"]]));
    expect(views[0]).toEqual({ questionId: "l1:q1", lessonTitle: "Lesson one", prompt: "Synthetic one?", options: ["A", "B"] });
    expect(JSON.stringify(views)).not.toMatch(/answerIndex|explanation/);
  });
});

describe("readSubmission", () => {
  it("reads one answer per graded question, in order, with the attempt key", () => {
    expect(readSubmission(form(full), Q)).toEqual({
      attemptKey: KEY,
      answers: [
        { questionId: "l1:q1", answerIndex: 1 },
        { questionId: "l1:q2", answerIndex: 2 },
        { questionId: "l2:q1", answerIndex: 0 },
      ],
    });
  });

  it.each([
    ["a missing answer", { ...full, [fieldName("l2:q1")]: "" }],
    ["an answer outside the options", { ...full, [fieldName("l1:q1")]: "2" }],
    ["a non-numeric answer", { ...full, [fieldName("l1:q1")]: "B" }],
    ["a negative answer", { ...full, [fieldName("l1:q1")]: "-1" }],
  ])("refuses %s", (_, entries) => {
    expect(readSubmission(form(entries), Q)).toEqual({ error: MISSING_ANSWERS });
  });

  it("refuses a missing or malformed attempt key", () => {
    expect(readSubmission(form({ ...full, attemptKey: "not-a-uuid" }), Q)).toHaveProperty("error");
    const noKey = form(full);
    noKey.delete("attemptKey");
    expect(readSubmission(noKey, Q)).toHaveProperty("error");
  });

  it("ignores fields that are not graded questions, such as a forged score", () => {
    const read = readSubmission(form({ ...full, passed: "true", [fieldName("l9:q1")]: "0" }), Q);
    expect(read).toHaveProperty("answers");
    expect(JSON.stringify(read)).not.toMatch(/passed|l9/);
  });
});

describe("classifySubmitError", () => {
  it.each([
    [{ code: "22023", message: "invalid answers: every graded question needs exactly one answer" }, "rejected", "Nothing was saved"],
    [{ code: "P0002", message: "no such assignment" }, "rejected", "Nothing was saved"],
    [{ code: "P0001", message: "this version has no graded quiz" }, "rejected", "no graded quiz"],
    [{ code: "28000", message: "not signed in" }, "rejected", "Nothing was saved"],
  ])("a refusal (%j) is rejected and says nothing was saved", (error, kind, text) => {
    const e = classifySubmitError(error);
    expect(e.kind).toBe(kind);
    expect(e.message).toContain(text);
  });

  it("an attempt key reused for other answers is a key conflict, not a failure", () => {
    const e = classifySubmitError({ code: "22023", message: "invalid attemptKey: was already used for different answers" });
    expect(e.kind).toBe("key-conflict");
    expect(e.message).toContain("Start a new attempt");
  });

  it.each([[{ code: "XX000", message: "boom" }], [{ message: "Failed to fetch" }], [null]])("an unknown outcome (%j) is unconfirmed and never claims nothing was saved", (error) => {
    const e = classifySubmitError(error);
    expect(e.kind).toBe("unconfirmed");
    expect(e.message).not.toContain("Nothing was saved");
    expect(e.message).toContain("will not count twice");
  });
});

describe("resultState", () => {
  const answers = [
    { questionId: "l1:q1", answerIndex: 1 },
    { questionId: "l1:q2", answerIndex: 2 },
    { questionId: "l2:q1", answerIndex: 0 },
  ];

  it("explains the server's result question by question when the counts agree", () => {
    const state = resultState({ attemptId: "a1", correct: 2, total: 3, passed: false }, Q, answers);
    expect(state).toMatchObject({ status: "result", correct: 2, total: 3, passed: false });
    expect(state.feedback).toEqual([
      { questionId: "l1:q1", correct: true, explanation: "Synthetic: B." },
      { questionId: "l1:q2", correct: false, explanation: "Synthetic: A." },
      { questionId: "l2:q1", correct: true, explanation: "Synthetic: A." },
    ]);
  });

  it("keeps the server's numbers and withholds feedback when the engine disagrees", () => {
    const state = resultState({ attemptId: "a1", correct: 3, total: 3, passed: true }, Q, answers);
    expect(state).toMatchObject({ correct: 3, total: 3, passed: true, feedback: null });
  });

  it("never derives passed itself", () => {
    // Even a result the engine would call a pass stays as the server reported it.
    const all = [
      { questionId: "l1:q1", answerIndex: 1 },
      { questionId: "l1:q2", answerIndex: 0 },
      { questionId: "l2:q1", answerIndex: 0 },
    ];
    expect(resultState({ attemptId: "a1", correct: 3, total: 3, passed: false }, Q, all).passed).toBe(false);
  });

  it("withholds feedback when the answers do not fit the questions", () => {
    expect(resultState({ attemptId: "a1", correct: 1, total: 3, passed: false }, Q, answers.slice(0, 2)).feedback).toBeNull();
  });
});

describe("module status text", () => {
  const base: ModuleStatus = {
    assignmentId: "as1",
    versionId: "v1",
    lessonsTotal: 8,
    lessonsCompleted: 8,
    quizRequired: true,
    questionsTotal: 20,
    bestAttemptId: null,
    bestCorrect: null,
    bestTotal: null,
    quizPassed: false,
    quizCreditAttemptId: null,
    quizCarried: false,
    complete: false,
  };

  it("needs at least 80% to pass", () => {
    expect([neededToPass(1), neededToPass(5), neededToPass(10), neededToPass(20), neededToPass(21)]).toEqual([1, 4, 8, 16, 17]);
  });

  it("says the quiz is not taken yet, with what a pass needs", () => {
    expect(moduleStatusView(base)).toEqual({
      complete: false,
      headline: "Module not complete yet.",
      lessons: "Every lesson is done.",
      quiz: "Quiz not taken yet: 20 questions, 16 correct to pass.",
      offerQuiz: true,
    });
  });

  it("reports the best attempt and the gap to a pass", () => {
    expect(moduleStatusView({ ...base, bestAttemptId: "a1", bestCorrect: 15, bestTotal: 20 }).quiz).toBe(
      "Quiz not passed yet: your best attempt was 15 of 20. You need 16 to pass.",
    );
  });

  it("is complete only when the server says so", () => {
    const passed = moduleStatusView({ ...base, bestAttemptId: "a1", bestCorrect: 17, bestTotal: 20, quizPassed: true, quizCreditAttemptId: "a1", complete: true });
    expect(passed).toMatchObject({ complete: true, headline: "Module complete.", offerQuiz: false, quiz: "Quiz passed: your best attempt was 17 of 20." });
    // Lessons unfinished: the server says not complete, even with a pass.
    expect(moduleStatusView({ ...base, lessonsCompleted: 7, quizPassed: true, complete: false }).headline).toBe("Module not complete yet.");
  });

  it("names carried credit", () => {
    expect(moduleStatusView({ ...base, quizPassed: true, quizCarried: true, quizCreditAttemptId: "a0", complete: true }).quiz).toContain("credit carried");
  });

  it("does not offer a quiz for versions without one", () => {
    expect(moduleStatusView({ ...base, quizRequired: false, questionsTotal: 0, complete: true })).toMatchObject({ quiz: "This version has no graded quiz.", offerQuiz: false });
  });

  it("says what is left, never repeating the progress label", () => {
    expect(moduleStatusView({ ...base, lessonsCompleted: 5 }).lessons).toBe("3 lessons still to do.");
    expect(moduleStatusView({ ...base, lessonsCompleted: 5 }).lessons).not.toMatch(/of 8/);
  });

  it("uses the singular for one lesson and one question", () => {
    const one = moduleStatusView({ ...base, lessonsTotal: 1, lessonsCompleted: 0, questionsTotal: 1 });
    expect(one.lessons).toBe("1 lesson still to do.");
    expect(one.quiz).toBe("Quiz not taken yet: 1 question, 1 correct to pass.");
  });
});
