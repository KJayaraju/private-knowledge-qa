import express from "express";
import pool from "./db.js";
import { askLLM } from "./llm.js";

const router = express.Router();

/* ---------------------------------------
   Keyword expansion (CRITICAL FIX)
---------------------------------------- */
function expandKeywords(keywords) {
  const expanded = new Set(keywords);

  if (expanded.has("ai")) {
    expanded.add("artificial intelligence");
  }
  if (expanded.has("ml")) {
    expanded.add("machine learning");
  }

  return Array.from(expanded);
}

/* ---------------------------------------
   GET all documents
---------------------------------------- */
router.get("/documents", async (req, res) => {
  const result = await pool.query(
    "SELECT id, name FROM documents ORDER BY id DESC"
  );
  res.json(result.rows);
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
   ASK QUESTION (READ ALL DOCS)
---------------------------------------- */
router.post("/ask", async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Question required" });
  }

  // 1. Fetch all documents
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

  // 2. Extract & EXPAND keywords
  let keywords = question
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 1);

  keywords = expandKeywords(keywords);

  // 3. Find relevant documents
  const relevantDocs = documents.filter(doc => {
    const text = doc.content.toLowerCase();
    return keywords.some(k => text.includes(k));
  });

  if (relevantDocs.length === 0) {
    return res.json({
      answer: "I don't know. The uploaded documents do not contain this information.",
      source: "-",
      snippet: "-"
    });
  }

  // 4. Combine ALL relevant docs
  const combinedText = relevantDocs
    .map(d => `Document (${d.name}):\n${d.content}`)
    .join("\n\n---\n\n");

  // 5. Ask LLM
  const prompt = `
Answer the question using ONLY the documents below.
If the answer is not present, say "I don't know".

DOCUMENTS:
${combinedText}

QUESTION:
${question}

ANSWER:
`;

  const answer = await askLLM(prompt);

  res.json({
    answer: answer.trim(),
    source: relevantDocs.map(d => d.name).join(", "),
    snippet: combinedText.slice(0, 500) + "..."
  });
});

/* ---------------------------------------
   Status
---------------------------------------- */
router.get("/status", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ backend: "ok", database: "connected", llm: "reachable" });
  } catch {
    res.status(500).json({ backend: "ok", database: "error" });
  }
});

export default router;
