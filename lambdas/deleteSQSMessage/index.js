import { SQSClient, DeleteMessageCommand } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({ region: process.env.CDK_DEPLOY_REGION });

const handler = async (event) =>
  sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: event.queueUrl,
      ReceiptHandle: event.receiveTextractJobMessageResult.Message.ReceiptHandle,
    })
  );
export { handler };
