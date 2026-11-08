// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import RagAssistant from "@/modules/rag/client/RagAssistant";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("sends up to six recent real messages within the API history limits", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ answer: "a".repeat(1600), citations: [], cards: [] }), { status: 200 })));
  vi.stubGlobal("fetch", fetch);
  render(<RagAssistant />);

  for (let i = 1; i <= 4; i++) {
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: `question ${i}` } });
    fireEvent.submit(screen.getByRole("button", { name: "Ask" }).closest("form")!);
    await waitFor(() => expect((screen.getByLabelText("Your question") as HTMLTextAreaElement).value).toBe(""));
  }

  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "final question" } });
  fireEvent.submit(screen.getByRole("button", { name: "Ask" }).closest("form")!);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
  const [, request] = fetch.mock.calls.at(-1)!;
  const { history } = JSON.parse(String(request.body));
  expect(history).toHaveLength(6);
  expect(history.map((message: { role: string; content: string }) => [message.role, message.content.length])).toEqual([
    ["user", 10], ["assistant", 1200], ["user", 10], ["assistant", 1200], ["user", 10], ["assistant", 1200],
  ]);
  expect(history.reduce((total: number, message: { content: string }) => total + message.content.length, "final question".length)).toBeLessThanOrEqual(4000);
});
