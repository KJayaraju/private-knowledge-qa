import express from "express";
import pool from "./db.js";
import { askLLM } from "./llm.js";

const router = express.Router();

/* ---------------------------------------
   Helper: score a document by keywords
---------------------------------------- */
function scoreDocument(text, keywords) {
  const lowerText = text.toLowerCase();
  let score = 0;

  for (const word of keywords) {
    if (lowerText.includes(word)) {
      score++;
    }
  }
  return score;
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
    console.error("Fetch documents error:", err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

/* ---------------------------------------
   Upload document
---------------------------------------- */
router.post("/documents", async (req, res) => {
  try {
    const { name, content } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: "Name and content required" });
    }

    await pool.query(
      "INSERT INTO documents (name, content) VALUES ($1, $2)",
      [name, content]
    );

    res.json({ message: "Document uploaded successfully" });
  } catch (err) {
    console.error("Upload document error:", err);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

/* ---------------------------------------
   ASK QUESTION (SCAN ALL DOCS → BEST MATCH)
---------------------------------------- */
router.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    // 1. Fetch ALL documents
    const result = await pool.query(
      "SELECT id, name, content FROM documents"
    );
    const documents = result.rows;

    if (documents.length === 0) {
      return res.json({
        answer: "No documents available.",
        source: "-",
        snippet: "-"
      });
    }

    // 2. Extract keywords from question
    const keywords = question
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2);

    // 3. Find BEST matching document
    let bestDoc = null;
    let bestScore = 0;

    for (const doc of documents) {
      const score = scoreDocument(doc.content, keywords);
      if (score > bestScore) {
        bestScore = score;
        bestDoc = doc;
      }
    }

    // 4. If no document is relevant
    if (!bestDoc || bestScore === 0) {
      return res.json({
        answer:
          "I don't know. (The answer is not present in the uploaded documents.)",
        source: "-",
        snippet: "-"
      });
    }

    // 5. Ask LLM ONLY with best document
    const prompt = `
Answer the question using ONLY the text below.
If the answer is not present, say "I don't know".

Document:
${bestDoc.content}

Question:
${question}
`;

    const answer = await askLLM(prompt);

    // 6. Create snippet
    const snippet =
      bestDoc.content.slice(0, 300) +
      (bestDoc.content.length > 300 ? "..." : "");

    res.json({
      answer,
      source: bestDoc.name,
      snippet
    });
  } catch (err) {
    console.error("Ask question error:", err);
    res.status(500).json({ error: "Failed to answer question" });
  }
});

/* ---------------------------------------
   Health check
---------------------------------------- */
router.get("/health", async (req, res) => {
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
