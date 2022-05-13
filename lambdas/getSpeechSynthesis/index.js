import { PollyClient, GetSpeechSynthesisTaskCommand } from "@aws-sdk/client-polly";

const pollyClient = new PollyClient({ region: process.env.CDK_DEPLOY_REGION });

const handler = async (event) =>
  pollyClient.send(
    new GetSpeechSynthesisTaskCommand({
      TaskId: event.taskId,
    })
  );

export { handler };
