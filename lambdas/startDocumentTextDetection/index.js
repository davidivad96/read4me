import { TextractClient, StartDocumentTextDetectionCommand } from "@aws-sdk/client-textract";

const textractClient = new TextractClient({ region: process.env.CDK_DEPLOY_REGION });

const handler = async (event) =>
  textractClient.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: event.bucketName,
          Name: event.objectKey,
        },
      },
      NotificationChannel: {
        RoleArn: process.env.TEXTRACT_SNS_PUBLISH_ROLE_ARN,
        SNSTopicArn: event.topicArn,
      },
    })
  );

export { handler };
