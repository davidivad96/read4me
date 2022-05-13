import { ComprehendClient, DetectDominantLanguageCommand } from "@aws-sdk/client-comprehend";

const comprehendClient = new ComprehendClient({ region: process.env.CDK_DEPLOY_REGION });

const handler = async (event) =>
  comprehendClient.send(
    new DetectDominantLanguageCommand({
      Text: event.Text,
    })
  );

export { handler };
