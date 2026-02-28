import { prepareAntigravityRequest } from "./src/plugin/request.ts";

const req = new Request("http://localhost/v1beta/models/antigravity-claude-sonnet-4-6-thinking:streamGenerateContent", {
  method: "POST",
  headers: { "x-api-key": "test" },
  body: JSON.stringify({
    contents: [{ role: "user", parts: [{ text: "Hello" }] }],
    generationConfig: {
      temperature: 0.5,
      thinkingConfig: { thinkingBudget: 1024 },
      maxOutputTokens: 64000
    }
  })
});

prepareAntigravityRequest(req, "antigravity", "default", "default").then(res => {
  res.req.json().then(b => console.log(JSON.stringify(b, null, 2)));
});
