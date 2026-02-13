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
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Question required" });
  }

  const result = await pool.query(
    "SELECT name, content FROM documents"
  );

  const documents = result.rows;

  if (documents.length === 0) {
    return res.json({
      answer: "No documents available.",
      source: "-",
      snippet: "-"
    });
  }

  const keywords = question
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2);

  let bestDoc = null;
  let bestScore = 0;

  for (const doc of documents) {
    const score = scoreDocument(doc.content, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestDoc = doc;
    }
  }

  if (!bestDoc || bestScore === 0) {
    return res.json({
      answer: "I don't know. The answer is not in the documents.",
      source: "-",
      snippet: "-"
    });
  }

  const prompt = `
Answer the question using ONLY the document below.
If the answer is not present, say "I don't know".

Document:
${bestDoc.content}

Question:
${question}
`;

  const answer = await askLLM(prompt);

  const snippet = extractSnippet(bestDoc.content, keywords);

  res.json({
    answer,
    source: bestDoc.name,
    snippet
  });
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
