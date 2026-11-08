"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Citation = { id: string; title: string; url: string };
type Card = Citation & { excerpt: string; type: "blog" | "listing"; imageUrl?: string | null };
type Turn = { question: string; answer: string; citations: Citation[]; cards: Card[] };

function SourceCard({ card }: { card: Card }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(card.imageUrl && !imageFailed);
  return <li className="overflow-hidden rounded-lg border border-border bg-background">
    <a href={card.url} className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <div className="relative aspect-[16/9] bg-button-bg/10">
        {showImage ? <Image src={card.imageUrl!} alt="" fill sizes="(max-width: 640px) 100vw, 50vw" unoptimized className="object-cover transition-transform group-hover:scale-[1.02]" onError={() => setImageFailed(true)} />
          : <div aria-hidden="true" className="grid size-full place-items-center text-muted-text"><span className="text-3xl">{card.type === "listing" ? "⌂" : "▤"}</span></div>}
      </div>
      <div className="p-4">
        <p className="m-0 text-xs uppercase tracking-wide text-muted-text">{card.type === "listing" ? "Stay" : "Journal"}</p>
        <h2 className="mb-2 mt-1 font-heading text-lg text-heading">{card.title}</h2>
        <p className="m-0 text-sm leading-6 text-body-text">{card.excerpt}</p>
      </div>
    </a>
  </li>;
}

export default function RagAssistant() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true); setError("");
    const asked = question.trim();
    let remaining = 4000 - asked.length;
    const history = turns.slice(-3).flatMap(({ question: q, answer }) => [
      { role: "user" as const, content: q },
      { role: "assistant" as const, content: answer },
    ]).slice(-6).reverse().flatMap(({ role, content }) => {
      if (remaining <= 0) return [];
      const bounded = content.slice(0, Math.min(1200, remaining));
      remaining -= bounded.length;
      return bounded.trim() ? [{ role, content: bounded }] : [];
    }).reverse();
    try {
      const response = await fetch("/api/rag/answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked, history }),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { setError("Your session expired. Sign in again to continue."); return; }
      if (!response.ok || typeof result?.answer !== "string") { setError(result?.error ?? "I couldn't answer just now. Please try again."); return; }
      setTurns((previous) => [...previous, { question: asked, answer: result.answer, citations: result.citations ?? [], cards: result.cards ?? [] }]);
      setQuestion("");
    } catch { setError("Connection problem. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return <section className="mx-auto max-w-4xl">
    <header className="mb-8 border-b border-border pb-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-accent">Getaways · field notes</p>
      <h1 className="m-0 font-heading text-[clamp(2rem,5vw,3.5rem)] leading-tight text-heading">A local answer, with its sources.</h1>
      <p className="mb-0 mt-3 max-w-2xl text-body-text">Ask about stays and published travel information around El Salvador. Prices and availability always need direct confirmation.</p>
    </header>

    <ol aria-label="Conversation" aria-live="polite" className="m-0 grid list-none gap-8 p-0">
      {turns.map((turn, index) => <li key={`${index}-${turn.question}`} className="grid gap-4">
        <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-button-bg px-5 py-3 text-button-text">{turn.question}</p>
        <article className="max-w-3xl">
          <p className="whitespace-pre-wrap leading-7 text-body-text">{turn.answer}</p>
          {turn.cards.length > 0 && <ul aria-label="Related sources" className="grid list-none gap-3 p-0 sm:grid-cols-2">
            {turn.cards.map((card) => <SourceCard key={card.id} card={card} />)}
          </ul>}
          {turn.citations.length > 0 && <p className="mb-0 mt-4 text-sm text-muted-text">Sources: {turn.citations.map((source, i) => <span key={source.id}>{i > 0 ? ", " : ""}<a href={source.url}>{source.title}</a></span>)}</p>}
        </article>
      </li>)}
    </ol>

    {turns.length === 0 && <p className="my-8 border-l-2 border-accent py-2 pl-4 text-body-text">Try asking: “What should I know before choosing a stay near the coast?”</p>}
    <form onSubmit={ask} className="mt-8 rounded-xl border border-border bg-background p-4 sm:p-6">
      <label htmlFor="rag-question" className="mb-2 block font-semibold text-heading">Your question</label>
      <textarea ref={input} id="rag-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} required rows={3} className="w-full rounded-md border border-border bg-background p-3 text-body-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" placeholder="Ask about places to stay or what to explore…" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-text">{question.length}/1000 · Avoid sharing personal or payment details.</span>
        <button type="submit" disabled={busy || !question.trim()} className="min-h-11 rounded-full bg-button-bg px-6 py-2 font-semibold text-button-text disabled:cursor-wait disabled:opacity-60">{busy ? "Looking through the guide…" : "Ask"}</button>
      </div>
      {busy && <p role="status" className="mb-0 mt-3 text-sm text-body-text">Searching published sources. This can take a moment.</p>}
      {error && <p role="alert" className="mb-0 mt-3 text-sm text-red-700">{error}{error.includes("session expired") && <> <Link href="/account/login?returnTo=%2Fassistant">Sign in</Link>.</>}</p>}
    </form>
  </section>;
}
