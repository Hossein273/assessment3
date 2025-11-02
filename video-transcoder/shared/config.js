const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

const ssm = new SSMClient({
  region: process.env.AWS_REGION || "ap-southeast-2",
});

async function loadAppConfig() {
  try {
    const param = await ssm.send(
      new GetParameterCommand({
        Name: `/n11030453/app-config`,
        WithDecryption: false,
      })
    );

    // Example: stored JSON in SSM as {"apiBaseUrl":"/","transcodePreset":"720p"}
    const cfg = JSON.parse(param.Parameter.Value);
    return cfg;
  } catch (err) {
    console.error("Failed to load app config from SSM:", err.message);
    // Fallback defaults
    return {
      apiBaseUrl: "/",
      transcodePreset: "720p",
    };
  }
}

module.exports = { loadAppConfig };
