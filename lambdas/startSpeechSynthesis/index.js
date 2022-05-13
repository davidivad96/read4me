import { PollyClient, StartSpeechSynthesisTaskCommand } from "@aws-sdk/client-polly";

const pollyClient = new PollyClient({ region: process.env.CDK_DEPLOY_REGION });

const handler = async (event) =>
  pollyClient.send(
    new StartSpeechSynthesisTaskCommand({
      OutputFormat: "mp3",
      OutputS3BucketName: event.bucketName,
      OutputS3KeyPrefix: `results/${event.filename}`,
      Text: event.getDocumentTextDetectionResult.Text,
      VoiceId: event.getVoiceIdResult.VoiceId,
      SnsTopicArn: event.topicArn,
    })
  );

export { handler };
