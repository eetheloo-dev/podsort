exports.handler = async function(event) {
  const { podcasts } = JSON.parse(event.body);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: "Classify podcasts as energy (podcasts about the energy industry: oil, gas, renewables, solar, wind, nuclear, power sector, electricity, climate, energy policy, energy transition) or other. Reply ONLY with JSON: {\"energy\": [], \"other\": []}",
      messages: [{ role: "user", content: podcasts }],
    }),
  });

  const data = await response.json();
  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
};
