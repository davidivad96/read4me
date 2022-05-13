import { SQSClient, ReceiveMessageCommand } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({ region: process.env.CDK_DEPLOY_REGION });

const parseMessage = ({ Body, ReceiptHandle }) => {
  const body = JSON.parse(Body);
  return {
    Body: JSON.parse(body.Message),
    ReceiptHandle,
  };
};

const handler = async (event) => {
  const { Messages } = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: event.queueUrl,
    })
  );
  const Message = Messages ? parseMessage(Messages[0]) : {};
  return { Message };
};
export { handler };
