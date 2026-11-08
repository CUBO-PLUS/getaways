import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  dispose: vi.fn(),
  infer: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => ({
  AutoConfig: { from_pretrained: async () => ({}) },
  AutoTokenizer: { from_pretrained: async () => async () => ({}) },
  AutoModel: { from_pretrained: mocks.load },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  vi.clearAllMocks();
});

it("reuses the model until five minutes after the last inference and reloads it afterward", async () => {
  vi.useFakeTimers();
  const model = Object.assign(mocks.infer, { dispose: mocks.dispose });
  mocks.load.mockResolvedValue(model);
  mocks.infer.mockResolvedValue({ sentence_embedding: { tolist: () => [[1, 2]] } });
  mocks.dispose.mockResolvedValue(undefined);
  const { embed } = await import("../embedding");

  expect(await embed("first")).toEqual([1, 2]);
  await vi.advanceTimersByTimeAsync(4 * 60_000);
  expect(await embed("second")).toEqual([1, 2]);
  await vi.advanceTimersByTimeAsync(4 * 60_000);
  expect(mocks.dispose).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.dispose).toHaveBeenCalledTimes(1);
  expect(await embed("third")).toEqual([1, 2]);
  expect(mocks.load).toHaveBeenCalledTimes(2);
});

it("does not dispose the model while an inference is running", async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  mocks.load.mockResolvedValue(Object.assign(mocks.infer, { dispose: mocks.dispose }));
  mocks.infer.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  mocks.dispose.mockResolvedValue(undefined);
  const { embed } = await import("../embedding");

  const pending = embed("slow");
  await vi.waitFor(() => expect(mocks.infer).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(mocks.dispose).not.toHaveBeenCalled();
  finish({ sentence_embedding: { tolist: () => [[3]] } });
  expect(await pending).toEqual([3]);
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(mocks.dispose).toHaveBeenCalledTimes(1);
});
