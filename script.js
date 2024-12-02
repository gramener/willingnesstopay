/* globals bootstrap */
import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";

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

new bootstrap.Tooltip("body", { selector: '[data-bs-toggle="tooltip"]' });

const $results = document.querySelector("#results");
const $transcriptForm = document.querySelector("#transcript-form");
const $systemPrompt = document.querySelector("#system-prompt");
const $terms = document.querySelector("#terms");
const $transcript = document.querySelector("#transcript");
let terms = getTerms();
let results = await fetch("transcripts.json").then((r) => r.json());

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
      <table class="table">
        <thead>
          <tr>
            <th>Transcript</th>
            ${terms.map((term) => html`<th>${term}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${results.map(
            ({ transcript, answers, error }, index) => html`
              <tr data-index="${index}">
                <td class="no-overflow">${transcript}</td>
                ${error
                  ? html`<td class="text-danger" colspan="${terms.length}">${error}</td>`
                  : answers.map((answer) => html`<td>${answer.answer ? "✅" : "❌"}</td>`)}
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
  render(
    html`
      <table class="table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Answer</th>
            <th>Reasoning</th>
            <th>Transcript</th>
          </tr>
        </thead>
        <tbody>
          ${answers.map(
            ({ question, answer, reasoning, transcript }) => html`
              <tr>
                <td>${question}</td>
                <td>${answer ? "✅" : "❌"}</td>
                <td>${reasoning}</td>
                <td>${transcript}</td>
              </tr>
            `
          )}
        </tbody>
      </table>
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
