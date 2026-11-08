import "server-only";

import { AutoConfig, AutoModel, AutoTokenizer } from "@huggingface/transformers";

const modelId = "onnx-community/embeddinggemma-2-ONNX";

async function loadModel() {
  const config = await AutoConfig.from_pretrained(modelId);
  Object.assign(config, { vision_config: null, audio_config: null });

  const tokenizer = await AutoTokenizer.from_pretrained(modelId);
  const model = await AutoModel.from_pretrained(modelId, { config, device: "cpu", dtype: "q4" });

  return { model, tokenizer };
}

let loading: ReturnType<typeof loadModel> | undefined;
let disposing: Promise<void> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let active = 0;

export async function embed(text: string): Promise<number[]> {
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
    const { model, tokenizer } = await loading;
    const inputs = await tokenizer([`task: search result | query: ${text}`]);
    const result = await model(inputs);
    return result.sentence_embedding.tolist()[0] as number[];
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
