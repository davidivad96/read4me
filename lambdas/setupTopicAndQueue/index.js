import { SNSClient, CreateTopicCommand, SubscribeCommand } from "@aws-sdk/client-sns";
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

const snsClient = new SNSClient({ region: process.env.CDK_DEPLOY_REGION });
const sqsClient = new SQSClient({ region: process.env.CDK_DEPLOY_REGION });

const handler = async (event) => {
  const bucketName = event.bucket.name;
  const objectKey = event.object.key;
  const filename = objectKey
    .replace("documents/", "")
    .toLowerCase()
    .replace(/[^a-zA-Z\d]/g, "_");
  const topicAndQueueName = `ReadformeJob_${Date.now()}`;
  // Create a topic
  const createTopicCommand = new CreateTopicCommand({
    Name: topicAndQueueName,
  });
  const { TopicArn: topicArn } = await snsClient.send(createTopicCommand);
  // Create a queue
  const createQueueCommand = new CreateQueueCommand({
    QueueName: topicAndQueueName,
    Attributes: {
      ReceiveMessageWaitTimeSeconds: 20,
    },
  });
  const { QueueUrl: queueUrl } = await sqsClient.send(createQueueCommand);
  // Get the queue's ARN
  const getQueueAttributesCommand = new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ["QueueArn"],
  });
  const {
    Attributes: { QueueArn: queueArn },
  } = await sqsClient.send(getQueueAttributesCommand);
  // Set the queue's policy
  const setQueueAttributesCommand = new SetQueueAttributesCommand({
    QueueUrl: queueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2008-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              AWS: "*",
            },
            Action: "SQS:SendMessage",
            Resource: queueArn,
            Condition: {
              ArnLike: {
                "aws:SourceArn": topicArn,
              },
            },
          },
        ],
      }),
    },
  });
  await sqsClient.send(setQueueAttributesCommand);
  // Subscribe queue to topic
  const subscribeCommand = new SubscribeCommand({
    TopicArn: topicArn,
    Protocol: "sqs",
    Endpoint: queueArn,
  });
  const { SubscriptionArn: subscriptionArn } = await snsClient.send(subscribeCommand);
  // Return response
  const response = {
    bucketName,
    objectKey,
    filename,
    topicArn,
    queueUrl,
    queueArn,
    subscriptionArn,
  };
  return response;
};

export { handler };
