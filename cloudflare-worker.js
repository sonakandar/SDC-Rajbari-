const corsHeaders = (origin, allowedOrigin) => ({
  "Access-Control-Allow-Origin": allowedOrigin === "*" ? "*" : allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
});

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...cors
    }
  });
}

function getText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18000);
}

function getOutput(data) {
  return (data.output || [])
    .filter(item => item.type === "message")
    .flatMap(item => item.content || [])
    .filter(part => part.type === "output_text")
    .map(part => part.text)
    .join("\n")
    .trim();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    const cors = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, cors);
    }

    if (allowed !== "*" && origin !== allowed) {
      return json({ error: "Origin not allowed" }, 403, cors);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "AI key is not configured" }, 503, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid request" }, 400, cors);
    }

    const message = String(body.message || "").trim().slice(0, 1500);
    if (!message) {
      return json({ error: "Please enter a question" }, 400, cors);
    }

    let websiteContent = "";

    try {
      const page = new URL(String(body.page || ""));
      if (page.protocol === "https:" &&
          (allowed === "*" || page.origin === allowed)) {
        const siteResponse = await fetch(page.href);
        if (siteResponse.ok) {
          websiteContent = getText(await siteResponse.text());
        }
      }
    } catch (error) {
      console.log("Website context unavailable");
    }

    const instructions = `
You are the official AI assistant of Sonakandor Development Club (SDC), Rajbari, Bangladesh.

Your duties:
- Answer questions about SDC using the website content below.
- Speak naturally in Bangla, English or Banglish.
- Be friendly, respectful and helpful.
- Answer general questions conversationally too.
- Never invent SDC facts, names, dates or contact details.
- If website information is unavailable, say so honestly.
- Do not claim to have performed actions you did not perform.

Website content:
${websiteContent || "Website content could not be loaded."}
`;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: env.OPENAI_MODEL || "gpt-6-astra",
            instructions,
            input: message,
            max_output_tokens: 700,
            store: false
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.log("OpenAI request failed:", response.status);
        return json({ error: "AI service request failed" }, 502, cors);
      }

      const reply = getOutput(result);

      if (!reply) {
        return json({ error: "Empty AI response" }, 502, cors);
      }

      return json({ reply }, 200, cors);

    } catch (error) {
      console.log("Worker error:", error.message);
      return json({ error: "AI temporarily unavailable" }, 502, cors);
    }
  }
};
