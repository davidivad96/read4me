import { SNSClient, DeleteTopicCommand, UnsubscribeCommand } from "@aws-sdk/client-sns";
import { SQSClient, DeleteQueueCommand } from "@aws-sdk/client-sqs";

const snsClient = new SNSClient({ region: process.env.CDK_DEPLOY_REGION });
const sqsClient = new SQSClient({ region: process.env.CDK_DEPLOY_REGION });

const handler = async (event) => {
  // Unsubscribe queue from topic
  const unsubscribeCommand = new UnsubscribeCommand({
    SubscriptionArn: event.subscriptionArn,
  });
  await snsClient.send(unsubscribeCommand);
  // Delete queue
  const deleteQueueCommand = new DeleteQueueCommand({
    QueueUrl: event.queueUrl,
  });
  await sqsClient.send(deleteQueueCommand);
  // Delete topic
  const deleteTopicCommand = new DeleteTopicCommand({
    TopicArn: event.topicArn,
  });
  await snsClient.send(deleteTopicCommand);
  return;
};

export { handler };
