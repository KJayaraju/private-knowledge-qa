import express from "express";
import pool from "./db.js";
import { askLLM } from "./llm.js";

const router = express.Router();

/* ---------------------------------------
   Helper: score document by keyword frequency
---------------------------------------- */
function scoreDocument(text, keywords) {
  const lowerText = text.toLowerCase();
  let score = 0;

  for (const word of keywords) {
    const matches = lowerText.match(new RegExp(`\\b${word}\\b`, "g"));
    if (matches) {
      score += matches.length;
    }
  }

  return score;
}

/* ---------------------------------------
   Helper: extract snippet around keyword
---------------------------------------- */
function extractSnippet(text, keywords) {
  const lowerText = text.toLowerCase();

  for (const word of keywords) {
    const index = lowerText.indexOf(word);
    if (index !== -1) {
      const start = Math.max(0, index - 120);
      const end = Math.min(text.length, index + 180);
      return text.slice(start, end) + "...";
    }
  }

  return text.slice(0, 300) + "...";
}

/* ---------------------------------------
   GET all documents
---------------------------------------- */
router.get("/documents", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name FROM documents ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

/* ---------------------------------------
   Upload document
---------------------------------------- */
router.post("/documents", async (req, res) => {
  const { name, content } = req.body;

  if (!name || !content) {
    return res.status(400).json({ error: "Name and content required" });
  }

  await pool.query(
    "INSERT INTO documents (name, content) VALUES ($1, $2)",
    [name, content]
  );

  res.json({ message: "Document uploaded" });
});

/* ---------------------------------------
   ASK QUESTION (SCAN ALL → BEST MATCH)
---------------------------------------- */
router.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    // 1. Fetch ALL documents
    const result = await pool.query(
      "SELECT name, content FROM documents"
    );
    const documents = result.rows;

    if (documents.length === 0) {
      return res.json({
        answer: "No documents uploaded.",
        source: "-",
        snippet: "-"
      });
    }

    // 2. Extract keywords from question
    const keywords = question
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2);

    // 3. Select ALL relevant documents
    const relevantDocs = documents.filter(doc => {
      const text = doc.content.toLowerCase();
      return keywords.some(word => text.includes(word));
    });

    if (relevantDocs.length === 0) {
      return res.json({
        answer: "I don't know. The uploaded documents do not contain this information.",
        source: "-",
        snippet: "-"
      });
    }

    // 4. Combine ALL relevant documents
    const combinedText = relevantDocs
      .map(
        (doc, i) =>
          `Document ${i + 1} (${doc.name}):\n${doc.content}`
      )
      .join("\n\n---\n\n");

    // 5. STRONG LLM PROMPT (multi-document)
    const prompt = `
You are an assistant that answers questions using ONLY the documents below.

Rules:
- Use ALL documents provided.
- If the answer exists, you MUST answer it.
- Do NOT use external knowledge.
- Do NOT hallucinate.

DOCUMENTS:
${combinedText}

QUESTION:
${question}

ANSWER:
`;

    const answer = await askLLM(prompt);

    // 6. Snippet (first 500 chars from combined docs)
    const snippet =
      combinedText.slice(0, 500) +
      (combinedText.length > 500 ? "..." : "");

    res.json({
      answer: answer.trim(),
      source: relevantDocs.map(d => d.name).join(", "),
      snippet
    });
  } catch (err) {
    console.error("Ask error:", err);
    res.status(500).json({ error: "Failed to answer question" });
  }
});

/* ---------------------------------------
   Status (for frontend)
---------------------------------------- */
router.get("/status", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      backend: "ok",
      database: "connected",
      llm: "reachable"
    });
  } catch {
    res.status(500).json({
      backend: "ok",
      database: "error",
      llm: "unknown"
    });
  }
});

export default router;

