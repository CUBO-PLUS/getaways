import "server-only";

import { AutoConfig, AutoModel, AutoTokenizer } from "@huggingface/transformers";

const modelId = "onnx-community/embeddinggemma-2-ONNX";
export const EMBEDDING_MODEL_REVISION = "daa72c51243991dfcaf9f9137d2c573d8f7790c0";
export const EMBEDDING_MODEL = modelId;
export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_CONTEXT_TOKENS = 8192;
export const RAG_CHUNK_TOKEN_LIMIT = 7000;

export function documentEmbeddingInput(title: string, text: string) {
  return `title: ${title.trim() || "none"} | text: ${text}`;
}

export function queryEmbeddingInput(text: string) {
  return `task: search result | query: ${text}`;
}

async function loadModel() {
  const config = await AutoConfig.from_pretrained(modelId, { revision: EMBEDDING_MODEL_REVISION });
  Object.assign(config, { vision_config: null, audio_config: null });

  const tokenizer = await AutoTokenizer.from_pretrained(modelId, { revision: EMBEDDING_MODEL_REVISION });
  const model = await AutoModel.from_pretrained(modelId, { config, revision: EMBEDDING_MODEL_REVISION, device: "cpu", dtype: "q4" });

  return { model, tokenizer };
}

let loading: ReturnType<typeof loadModel> | undefined;
let disposing: Promise<void> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let active = 0;

async function withModel<T>(run: (loaded: Awaited<ReturnType<typeof loadModel>>) => Promise<T>): Promise<T> {
  clearTimeout(idleTimer);
  active++;
  try {
    loading ??= (async () => {
      await disposing;
      return loadModel();
    })().catch((error) => {
      loading = undefined;
      throw error;
    });
    return await run(await loading);
  } finally {
    active--;
    if (active === 0 && loading) {
      idleTimer = setTimeout(() => {
        const loaded = loading;
        loading = undefined;
        disposing = loaded!.then(async ({ model }) => { await model.dispose(); }).catch((error) => {
          console.error("Failed to dispose embedding model:", error);
        });
      }, 5 * 60 * 1000);
      idleTimer.unref();
    }
  }
}

async function embedInput(input: string): Promise<number[]> {
  return withModel(async ({ model, tokenizer }) => {
    const inputs = await tokenizer([input]);
    const result = await model(inputs);
    const vector = result.sentence_embedding.tolist()[0] as number[];
    if (vector.length !== EMBEDDING_DIMENSIONS || vector.some((value) => !Number.isFinite(value))) {
      throw new Error(`EmbeddingGemma returned an invalid vector (expected ${EMBEDDING_DIMENSIONS} finite values)`);
    }
    // The checkpoint normally emits normalized vectors; normalize here so dtype/model changes cannot silently alter cosine behavior.
    const norm = Math.hypot(...vector);
    if (!norm) throw new Error("EmbeddingGemma returned a zero vector");
    return vector.map((value) => value / norm);
  });
}

export async function embed(text: string): Promise<number[]> {
  return embedInput(queryEmbeddingInput(text));
}

export async function embedDocument(title: string, text: string): Promise<number[]> {
  return embedInput(documentEmbeddingInput(title, text));
}

/** Counts the fully prefixed document input, including tokenizer special tokens. */
export async function countDocumentTokens(title: string, text: string): Promise<number> {
  return withModel(async ({ tokenizer }) => tokenizer.encode(documentEmbeddingInput(title, text)).length);
}
