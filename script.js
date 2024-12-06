/* globals bootstrap */
import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";

const { token } = await fetch("https://llmfoundry.straive.com/token", { credentials: "include" }).then((res) =>
  res.json()
);
const url = "https://llmfoundry.straive.com/login?" + new URLSearchParams({ next: location.href });
render(
  token
    ? html`<button type="submit" class="btn btn-primary mt-3">Analyze</button>`
    : html`<a class="btn btn-primary" href="${url}">Log in to try your own contracts</a></p>`,
  document.querySelector("#analyze")
);

const $results = document.querySelector("#results");
const $transcriptForm = document.querySelector("#transcript-form");
const $systemPrompt = document.querySelector("#system-prompt");
const $terms = document.querySelector("#terms");
const $transcript = document.querySelector("#transcript");

const marked = new Marked();
let terms = getTerms();
let results = await fetch("transcripts.json").then((r) => r.json());

// If a timestamp is not provided, generate a random one
results.forEach(({ transcript, answers }) => {
  answers.forEach((answer) => {
    answer.timestamp = answer.timestamp || Math.random() * 100;
  });
});

$transcriptForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  terms = getTerms();
  results = $transcript.value
    .split(/\n\n==========+\n\n/)
    .map((transcript) => ({ transcript: transcript.trim(), answers: [] }))
    .filter(({ transcript }) => transcript);
  render(html`<div class="text-center"><div class="spinner-border my-5" role="status"></div></div>`, $results);
  for (const row of results) {
    for await (const { content, error } of asyncLLM(
      // "https://llmfoundry.straive.com/gemini/v1beta/openai/chat/completions",
      "https://llmfoundry.straive.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}:willingnesstopay` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          stream: true,
          response_format: {
            type: "json_schema",
            json_schema: { name: "answers", strict: true, schema: answerSchema },
          },
          messages: [
            { role: "system", content: $systemPrompt.value.replace("$QUESTIONS", terms.join("\n")) },
            { role: "user", content: row.transcript },
          ],
        }),
      }
    )) {
      if (error) row.error = error;
      else if (content) {
        const answers = parse(content);
        if (typeof answers === "object") Object.assign(row, answers);
      }
      renderResults(results);
    }
  }
  renderResults(results);
});

function renderResults(results) {
  render(
    html`
      <table class="table cursor-pointer">
        <thead>
          <tr>
            <th>Invoice No.</th>
            ${terms.map((term) => html`<th>${term}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${results.map(
            (row, index) => html`
              <tr data-index="${index}">
                <td>${row.invoice_no}</td>
                ${row.error
                  ? html`<td class="text-danger" colspan="${terms.length}">${row.error}</td>`
                  : [
                      html`<td>${row.answers.find(answer => answer.question === "Was the debtor willing to pay?") ? (row.answers.find(answer => answer.question === "Was the debtor willing to pay?").answer ? "High" : "Low") : "N/A"}</td>`,
                      ...row.answers.filter(answer => answer.question !== "Was the debtor willing to pay?").map((answer) =>
                        html`<td>${answer.answer ? "✅" : "❌"}</td>`
                      )
                    ]}
              </tr>
            `
          )}
        </tbody>
      </table>
    `,
    $results
  );
}

let currentIndex = -1;

function showAnswersModal(index) {
  if (index < 0 || index >= results.length) return;

  currentIndex = index;
  const { answers, transcript } = results[index];

  // Remove previous highlights and highlight current row
  document.querySelectorAll("tr.table-active").forEach((row) => row.classList.remove("table-active"));
  document.querySelector(`tr[data-index="${index}"]`).classList.add("table-active");

  const modal = bootstrap.Modal.getInstance("#snippet-modal") || new bootstrap.Modal("#snippet-modal");
  render(html`${results[index].invoice_no}`, document.querySelector("#snippet-modal-title"));
  render(
    html`
      <table class="table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Answer</th>
            <th>Reasoning</th>
            <th>Transcript Snippet</th>
          </tr>
        </thead>
        <tbody>
          ${[
            // Move "Willing to pay" answer to the first position
            answers.find(({ question }) => question === "Was the debtor willing to pay?"),
            ...answers.filter(({ question }) => question !== "Was the debtor willing to pay?")
          ].map(
            ({ question, answer, reasoning, transcript, timestamp }) => html`
              <tr>
                <td>${question}</td>
                <td>${answer ? "✅" : "❌"}</td>
                <td>${reasoning}</td>
                <td>
                  <div>${unsafeHTML(marked.parse(transcript))}</div>
                  <small class="text-muted">${timestamp.toFixed(1)}s</small>
                </td>
              </tr>
            `
          )}
        </tbody>
      </table>
      <section>
        <h1 class="h4 my-5">Transcript</h1>
        ${unsafeHTML(marked.parse(transcript))}
      </section>
    `,
    document.querySelector("#snippet-modal-body")
  );

  modal.show();
}

$results.addEventListener("click", (event) => {
  const $row = event.target.closest("tr");
  if (!$row?.dataset.index) return;
  showAnswersModal(+$row.dataset.index);
});

// Handle keyboard navigation
document.addEventListener("keydown", (event) => {
  if (!document.querySelector("#snippet-modal").classList.contains("show")) return;

  switch (event.key) {
    case "ArrowUp":
      showAnswersModal(currentIndex - 1);
      break;
    case "ArrowDown":
      showAnswersModal(currentIndex + 1);
      break;
  }
});

function getTerms() {
  return $terms.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);
}

const answerSchema = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: {
            type: "string",
          },
          reasoning: {
            type: "string",
          },
          answer: {
            type: "boolean",
          },
          transcript: {
            type: "string",
          },
        },
        required: ["question", "reasoning", "answer", "transcript"],
        additionalProperties: false,
      },
    },
  },
  required: ["answers"],
  additionalProperties: false,
};

renderResults(results);
