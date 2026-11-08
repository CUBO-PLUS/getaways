import "server-only";

import { anthropic } from "@ai-sdk/anthropic";

export const anthropicModel = anthropic("claude-haiku-5-5");
