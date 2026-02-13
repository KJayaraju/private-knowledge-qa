import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export async function askLLM(question, context) {
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // ✅ UPDATED MODEL
      messages: [
        {
          role: "system",
          content:
            "Answer ONLY using the provided document content. If the answer is not present, say you don't know."
        },
        {
          role: "user",
          content: `
Document:
${context}

Question:
${question}

Answer clearly and mention which part of the document was used.
`
        }
      ]
    });

    return completion.choices[0].message.content;
  } catch (err) {
    console.error("LLM ERROR:", err.message);
    throw err;
  }
}