const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method === "GET") {
      return json({
        message: "SDC Gemini AI backend is running!"
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: "Gemini API key is missing" }, 500);
    }

    try {
      const body = await request.json();

      const message = String(body.message || "").trim();

      if (!message) {
        return json({ error: "Please enter a message" }, 400);
      }

      const websiteInfo = String(
        body.websiteInfo || ""
      ).slice(0, 18000);

      const systemPrompt = `
You are the official AI assistant of
Sonakandor Development Club (SDC), Rajbari, Bangladesh.

Your responsibilities:
- Answer questions about SDC.
- Be friendly, polite and helpful.
- Speak Bangla, English or Banglish according to the visitor.
- Use the website information provided below.
- Never invent names, dates, projects or contact details.
- If information is unavailable, say so honestly.
- You can also answer general questions.

WEBSITE INFORMATION:
${websiteInfo || "No website information provided."}
`;

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                { text: systemPrompt }
              ]
            },
            contents: [
              {
                role: "user",
                parts: [
                  { text: message.slice(0, 2000) }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 800
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Gemini API error:", data.error?.message);

        return json({
          error: data.error?.message || "Gemini API request failed"
        }, 502);
      }

      const reply = (
        data.candidates?.[0]?.content?.parts || []
      )
        .map(part => part.text || "")
        .join("")
        .trim();

      if (!reply) {
        return json({
          error: "Gemini did not return a response"
        }, 502);
      }

      return json({ reply });

    } catch (error) {
      console.error("Backend error:", error.message);

      return json({
        error: "Something went wrong. Please try again."
      }, 500);
    }
  }
};
