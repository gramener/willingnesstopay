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

let currentIndex = -1;  // Row index
let currentColIndex = -1;  // Column index
// Make the function globally accessible
window.showAnswersModal = function (rowIndex, colIndex) {
  if (rowIndex < 0 || rowIndex >= results.length || colIndex < 0) return;
  currentIndex = rowIndex;
  currentColIndex = colIndex;  // Remember the clicked column index
  const { answers, transcript, invoice_no } = results[rowIndex];
  // Remove previous highlights and highlight the current row
  document
    .querySelectorAll("tr.table-active")
    .forEach((row) => row.classList.remove("table-active"));
  document
    .querySelector(`tr[data-row-index="${rowIndex}"]`)
    .classList.add("table-active");
  // Get the specific answer related to the clicked cell
  const specificAnswer = answers[colIndex];
  const modal =
    bootstrap.Modal.getInstance("#snippet-modal") || new bootstrap.Modal("#snippet-modal");
  // Render the modal content with specific data
  render(html`${invoice_no}`, document.querySelector("#snippet-modal-title"));
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
          <tr>
            <td>${specificAnswer.question}</td>
            <td>
              ${typeof specificAnswer.answer === "boolean"
                ? specificAnswer.answer
                  ? "✅"
                  : "❌"
                : specificAnswer.answer}
            </td>
            <td>${specificAnswer.reasoning}</td>
            <td>
              <div>${unsafeHTML(marked.parse(specificAnswer.transcript))}</div>
              <small class="text-muted">${specificAnswer.timestamp.toFixed(1)}s</small>
            </td>
          </tr>
        </tbody>
      </table>
    `,
    document.querySelector("#snippet-modal-body")
  );
  modal.show();
};

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
            (row, rowIndex) => html`
              <tr data-row-index="${rowIndex}">
                <td>${row.invoice_no}</td>
                ${row.error
                  ? html`<td class="text-danger" colspan="${terms.length}">${row.error}</td>`
                  : row.answers.map(
                      (answer, colIndex) => html`
                        <td
                          data-row-index="${rowIndex}"
                          data-col-index="${colIndex}"
                        >
                          ${typeof answer.answer === "boolean"
                            ? answer.answer
                              ? "✅"
                              : "❌"
                            : answer.answer}
                        </td>
                      `
                    )}
              </tr>
            `
          )}
        </tbody>
      </table>
    `,
    $results
  );
}
document.querySelector("#results").addEventListener("click", (event) => {
  const cell = event.target.closest("td");
  if (!cell || !cell.hasAttribute("data-row-index") || !cell.hasAttribute("data-col-index")) {
    return;
  }
  const rowIndex = parseInt(cell.getAttribute("data-row-index"), 10);
  const colIndex = parseInt(cell.getAttribute("data-col-index"), 10);
  showAnswersModal(rowIndex, colIndex);
});

// Handle keyboard navigation
document.addEventListener("keydown", (event) => {
  if (!document.querySelector("#snippet-modal").classList.contains("show")) return;

  switch (event.key) {
    case "ArrowUp":
      if (currentIndex > 0) {
        currentIndex--;
        showAnswersModal(currentIndex, currentColIndex);  // Use the remembered column index
      }
      break;
    case "ArrowDown":
      if (currentIndex < results.length - 1) {
        currentIndex++;
        showAnswersModal(currentIndex, currentColIndex);  // Use the remembered column index
      }
      break;
    case "ArrowLeft":
      if (currentColIndex > 0) {
        currentColIndex--;
        showAnswersModal(currentIndex, currentColIndex);  // Move to previous column
      }
      break;
    case "ArrowRight":
      if (currentColIndex < terms.length - 1) {  // Assuming `terms.length` is the number of columns
        currentColIndex++;
        showAnswersModal(currentIndex, currentColIndex);  // Move to next column
      }
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
