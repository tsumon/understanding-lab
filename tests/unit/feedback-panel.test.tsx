// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import topicJson from "../../content/overfitting.v1.json";
import packJson from "../../public/experiments/overfitting.v1.json";
import { newSession, RECOVERED_FEEDBACK_MODEL, RECOVERED_FEEDBACK_PROMPT_VERSION, TopicSchema, type StoredFeedback } from "../../src/domain/contracts";
import { parsePack } from "../../src/experiment/catalog";
import { FeedbackPanel } from "../../src/client/FeedbackPanel";

afterEach(cleanup);
const topic = TopicSchema.parse(topicJson);
const pack = parsePack(packJson);
const answer = { id: "a1", revision: 1, step: "explain" as const, questionId: "explain-1", text: "<script>alert(1)</script>", confirmedAt: "2026-09-26T00:00:00Z" };
const snapshot = { id: "snap1", packVersion: "overfitting.v1" as const, config: { seed: 17 as const, n: 20 as const, noise: 0.1 as const, degree: 2 }, prediction: "", testRevealed: false, testContaminated: false };
const session = { ...newSession("s1"), answers: [answer], snapshots: [snapshot] };
const feedback: StoredFeedback = {
  id: "f1", contentRevision: 0, model: "test", promptVersion: "v1", createdAt: "2026-09-26T00:00:00Z",
  output: { kind: "supported", claim: "<script>alert(1)</script>", reason: "有证据，也可能有异议", nextAction: "ask", question: "为什么？",
    quotes: [{ answerId: "a1", answerRevision: 1, start: 0, end: answer.text.length, text: answer.text }],
    sources: [{ paragraphId: "p-fit", topicVersion: "overfitting.v1" }],
    metrics: [{ snapshotId: "snap1", metric: "trainMse" }],
  },
};

test("renders model strings as text, resolves topic links, and navigates the cited revision", () => {
  const onQuote = vi.fn();
  const { container } = render(<FeedbackPanel feedback={feedback} session={session} topic={topic} pack={pack} onQuote={onQuote} onDisagree={vi.fn()} />);
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getAllByText("<script>alert(1)</script>")).toHaveLength(2);
  const link = screen.getByRole("link", { name: /p-fit/ });
  expect(link.getAttribute("href")).toBe("https://scikit-learn.org/stable/auto_examples/model_selection/plot_underfitting_overfitting.html");
  expect(link.getAttribute("rel")).toContain("noreferrer");
  fireEvent.click(screen.getByRole("button", { name: /第 1 版原话/ }));
  expect(onQuote).toHaveBeenCalledWith(answer);
  expect(screen.getByText(/结构校验不保证语义正确/)).toBeTruthy();
});

test("labels recovered local feedback so it cannot be mistaken for a model call", () => {
  render(<FeedbackPanel feedback={{ ...feedback, model: RECOVERED_FEEDBACK_MODEL, promptVersion: RECOVERED_FEEDBACK_PROMPT_VERSION }}
    session={session} topic={topic} pack={pack} onQuote={vi.fn()} onDisagree={vi.fn()} />);
  expect(screen.getByText("本机恢复的反馈 · 不能当作模型调用证明")).toBeTruthy();
});

test("does not link unapproved references or reveal hidden test values", () => {
  const altered = { ...feedback, output: { ...feedback.output,
    sources: [{ paragraphId: "not-in-topic", topicVersion: "overfitting.v1" }],
    metrics: [{ snapshotId: "snap1", metric: "testMse" as const }],
  } };
  render(<FeedbackPanel feedback={altered} session={session} topic={topic} pack={pack} onQuote={vi.fn()} onDisagree={vi.fn()} />);
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByText(/测试 MSE/)).toBeNull();
  expect(screen.getByText("引用的测试误差尚未揭示，不显示数值。")).toBeTruthy();
});

test("shows an explicit status when a cited metric cannot be loaded", () => {
  const altered = { ...feedback, output: { ...feedback.output,
    metrics: [{ snapshotId: "missing", metric: "trainMse" as const }],
  } };
  render(<FeedbackPanel feedback={altered} session={session} topic={topic} pack={null} onQuote={vi.fn()} onDisagree={vi.fn()} />);
  expect(screen.getByText("实验数值暂不可用：找不到对应的实验记录。")).toBeTruthy();
});

test("records at most 1000 code points of disagreement without hiding feedback", () => {
  const onDisagree = vi.fn();
  render(<FeedbackPanel feedback={feedback} session={session} topic={topic} pack={pack} onQuote={vi.fn()} onDisagree={onDisagree} />);
  fireEvent.click(screen.getByRole("button", { name: "提出异议" }));
  fireEvent.change(screen.getByRole("textbox", { name: "异议原因" }), { target: { value: "🧠".repeat(1001) } });
  expect(screen.getByRole("textbox", { name: "异议原因" })).toHaveProperty("value", "🧠".repeat(1000));
  fireEvent.click(screen.getByRole("button", { name: "记录异议" }));
  expect(onDisagree).toHaveBeenCalledWith("🧠".repeat(1000));
  expect(screen.getByText("有证据，也可能有异议")).toBeTruthy();
});
