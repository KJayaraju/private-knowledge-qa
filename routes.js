import express from "express";
import pool from "./db.js";
import { askLLM } from "./llm.js";

const router = express.Router();

/* Upload document */
router.post("/documents", async (req, res) => {
  try {
    const { name, content } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: "Invalid input" });
    }

    await pool.query(
      "INSERT INTO documents (name, content) VALUES ($1, $2)",
      [name, content]
    );

    res.json({ message: "Document uploaded" });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

/* List documents */
router.get("/documents", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name FROM documents"
    );
    res.json(rows);
  } catch (err) {
    console.error("Fetch documents error:", err);
    res.json([]);
  }
});

/* Ask question */
router.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question required" });
    }

    const { rows: docs } = await pool.query(
      "SELECT * FROM documents"
    );

    if (docs.length === 0) {
      return res.json({
        answer: "No documents uploaded yet.",
        source: "-",
        snippet: "-"
      });
    }

    const keyword = question.split(" ")[0].toLowerCase();
    const matchedDoc =
      docs.find(d =>
        d.content.toLowerCase().includes(keyword)
      ) || docs[0];

    const answer = await askLLM(question, matchedDoc.content);

    res.json({
      answer,
      source: matchedDoc.name,
      snippet: matchedDoc.content.substring(0, 200)
    });
  } catch (err) {
    console.error("Ask error:", err);
    res.status(500).json({
      answer: "Error generating answer",
      source: "-",
      snippet: "-"
    });
  }
});

/* Status */
router.get("/status", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      backend: "ok",
      database: "connected",
      llm: "reachable"
    });
  } catch (err) {
    res.status(500).json({
      backend: "ok",
      database: "error",
      llm: "unknown"
    });
  }
});

export default router;