import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as eventbridge from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { getLambdaFunctionProps, getRandom } from "../utils";

const SQS_QUEUE_ARN = `arn:aws:sqs:${process.env.CDK_DEPLOY_REGION}:${process.env.CDK_DEPLOY_ACCOUNT}:ReadformeJob_*`;
const SNS_TOPIC_ARN = `arn:aws:sns:${process.env.CDK_DEPLOY_REGION}:${process.env.CDK_DEPLOY_ACCOUNT}:ReadformeJob_*`;

export class ReadformeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /** ------------------ Bucket Definition ------------------ */

    const random = getRandom();
    const bucketName = `readforme-${random}`;
    const s3Bucket = new s3.Bucket(this, bucketName, {
      bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
    });

    /** ------------------ Roles, Policies and Permissions Definition ------------------ */

    const setupTopicAndQueueLambdaPolicy = new iam.ManagedPolicy(
      this,
      "SetupTopicAndQueueLambdaPolicy",
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sns:CreateTopic", "sns:Subscribe"],
            resources: [SNS_TOPIC_ARN],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sqs:CreateQueue", "sqs:GetQueueAttributes", "sqs:SetQueueAttributes"],
            resources: [SQS_QUEUE_ARN],
          }),
        ],
      }
    );

    const setupTopicAndQueueLambdaRole = new iam.Role(this, "SetupTopicAndQueueLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        setupTopicAndQueueLambdaPolicy,
      ],
    });

    const textractSNSPublishPolicy = new iam.ManagedPolicy(this, "TextractSNSPublishPolicy", {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["sns:Publish"],
          resources: [SNS_TOPIC_ARN],
        }),
      ],
    });

    const textractSNSPublishRole = new iam.Role(this, "TextractSNSPublishRole", {
      assumedBy: new iam.ServicePrincipal("textract.amazonaws.com"),
      managedPolicies: [textractSNSPublishPolicy],
    });

    const cleanupTopicAndQueueLambdaPolicy = new iam.ManagedPolicy(
      this,
      "CleanupTopicAndQueueLambdaPolicy",
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sns:Unsubscribe"],
            resources: ["*"],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sns:DeleteTopic", "sqs:DeleteQueue"],
            resources: [SNS_TOPIC_ARN, SQS_QUEUE_ARN],
          }),
        ],
      }
    );

    const cleanupTopicAndQueueLambdaRole = new iam.Role(this, "CleanupTopicAndQueueLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        cleanupTopicAndQueueLambdaPolicy,
      ],
    });

    const readformeStateMachinePolicy = new iam.ManagedPolicy(this, "ReadformeStateMachinePolicy", {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["s3:GetObject"],
          resources: [`${s3Bucket.bucketArn}/documents/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["s3:PutObject"],
          resources: [`${s3Bucket.bucketArn}/results/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["sns:Publish"],
          resources: [SNS_TOPIC_ARN],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["sqs:ReceiveMessage", "sqs:DeleteMessage"],
          resources: [SQS_QUEUE_ARN],
        }),
      ],
    });

    const readformeStateMachineRole = new iam.Role(this, "ReadFormeStateMachineRole", {
      assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
      managedPolicies: [readformeStateMachinePolicy],
    });

    /** ------------------ Lambda Handlers Definition ------------------ */

    const checkDocumentLambda = new lambda.Function(
      this,
      "CheckDocument",
      getLambdaFunctionProps("checkDocument")
    );

    const setupTopicAndQueueLambda = new lambda.Function(
      this,
      "SetupTopicAndQueue",
      getLambdaFunctionProps("setupTopicAndQueue", setupTopicAndQueueLambdaRole)
    );

    const transformBlocksToTextLambda = new lambda.Function(
      this,
      "TransformBlocksToText",
      getLambdaFunctionProps("transformBlocksToText")
    );

    const getVoiceIdLambda = new lambda.Function(
      this,
      "GetVoiceId",
      getLambdaFunctionProps("getVoiceId")
    );

    const cleanupTopicAndQueueLambda = new lambda.Function(
      this,
      "CleanupTopicAndQueue",
      getLambdaFunctionProps("cleanupTopicAndQueue", cleanupTopicAndQueueLambdaRole)
    );

    /** ------------------ Tasks and States Definition ------------------ */

    const checkDocumentTask = new tasks.LambdaInvoke(this, "Check Document", {
      lambdaFunction: checkDocumentLambda,
      inputPath: "$.detail",
      outputPath: "$.Payload",
    });

    const documentTooLargeFailTask = new sfn.Fail(this, "Fail: Document Too Large", {
      error: "DocumentTooLarge",
      cause: "Size limit is 5MB!",
    });

    const unsupportedDocumentFailTask = new sfn.Fail(this, "Fail: Unsupported Document", {
      error: "UnsupportedDocument",
      cause: "Allowed documents: PDF, PNG, JPG, JPEG and TIFF",
    });

    const setupTopicAndQueueTask = new tasks.LambdaInvoke(this, "Setup Topic And Queue", {
      lambdaFunction: setupTopicAndQueueLambda,
      outputPath: "$.Payload",
    });

    const startDocumentTextDetectionTask = new tasks.CallAwsService(
      this,
      "Start Document Text Detection",
      {
        service: "textract",
        action: "startDocumentTextDetection",
        parameters: {
          DocumentLocation: {
            S3Object: {
              Bucket: sfn.JsonPath.stringAt("$.bucketName"),
              Name: sfn.JsonPath.stringAt("$.objectKey"),
            },
          },
          NotificationChannel: {
            RoleArn: textractSNSPublishRole.roleArn,
            SnsTopicArn: sfn.JsonPath.stringAt("$.topicArn"),
          },
        },
        resultPath: "$.startDocumentTextDetectionResult",
        iamResources: ["*"],
      }
    );

    const receiveTextractJobMessageTask = new tasks.CallAwsService(
      this,
      "Receive Textract Job Message",
      {
        service: "sqs",
        action: "receiveMessage",
        parameters: { QueueUrl: sfn.JsonPath.stringAt("$.queueUrl") },
        resultPath: "$.receiveTextractJobMessageResult",
        iamResources: [SQS_QUEUE_ARN],
      }
    );

    const checkTextractJobMessageReceivedChoice = new sfn.Choice(
      this,
      "Choice: Check If Received Textract Job Message"
    );

    const deleteTextractJobMessageTask = new tasks.CallAwsService(
      this,
      "Delete Textract Job Message",
      {
        service: "sqs",
        action: "deleteMessage",
        parameters: {
          QueueUrl: sfn.JsonPath.stringAt("$.queueUrl"),
          ReceiptHandle: sfn.JsonPath.stringAt(
            "$.receiveTextractJobMessageResult.Messages[0].ReceiptHandle"
          ),
        },
        resultPath: sfn.JsonPath.DISCARD,
        iamResources: [SQS_QUEUE_ARN],
      }
    );

    const getDocumentTextDetectionTask = new tasks.CallAwsService(
      this,
      "Get Document Text Detection",
      {
        service: "textract",
        action: "getDocumentTextDetection",
        parameters: { JobId: sfn.JsonPath.stringAt("$.JobId") },
        inputPath: "$.startDocumentTextDetectionResult",
        resultPath: "$.getDocumentTextDetectionResult",
        iamResources: ["*"],
      }
    );

    const transformBlocksToText = new tasks.LambdaInvoke(this, "Transform Blocks To Text", {
      lambdaFunction: transformBlocksToTextLambda,
      inputPath: "$.getDocumentTextDetectionResult",
      resultSelector: { "Text.$": "$.Payload" },
      resultPath: "$.getDocumentTextDetectionResult",
    });

    const cleanupTopicAndQueueTask1 = new tasks.LambdaInvoke(this, "Cleanup Topic And Queue 1", {
      lambdaFunction: cleanupTopicAndQueueLambda,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const noTextFoundFailTask = new sfn.Fail(this, "Fail: No Text Found", {
      error: "NoTextFound",
      cause: "No text was found in the document!",
    });

    const detectDominantLanguageTask = new tasks.CallAwsService(this, "Detect Dominant Language", {
      service: "comprehend",
      action: "detectDominantLanguage",
      parameters: { Text: sfn.JsonPath.stringAt("$.Text") },
      inputPath: "$.getDocumentTextDetectionResult",
      resultSelector: { "LanguageCode.$": "$.Languages[0].LanguageCode" },
      resultPath: "$.detectDominantLanguageResult",
      iamResources: ["*"],
    });

    const getVoiceIdTask = new tasks.LambdaInvoke(this, "Get Voice Id", {
      lambdaFunction: getVoiceIdLambda,
      inputPath: "$.detectDominantLanguageResult",
      resultSelector: { "VoiceId.$": "$.Payload" },
      resultPath: "$.getVoiceIdResult",
    });

    const startSpeechSynthesisTask = new tasks.CallAwsService(this, "Start Speech Synthesis", {
      service: "polly",
      action: "startSpeechSynthesisTask",
      parameters: {
        OutputFormat: "mp3",
        OutputS3BucketName: sfn.JsonPath.stringAt("$.bucketName"),
        OutputS3KeyPrefix: sfn.JsonPath.format("results/{}", sfn.JsonPath.stringAt("$.filename")),
        Text: sfn.JsonPath.stringAt("$.getDocumentTextDetectionResult.Text"),
        VoiceId: sfn.JsonPath.stringAt("$.getVoiceIdResult.VoiceId"),
        SnsTopicArn: sfn.JsonPath.stringAt("$.topicArn"),
      },
      resultSelector: { "TaskId.$": "$.SynthesisTask.TaskId" },
      resultPath: "$.startSpeechSynthesisTaskResult",
      iamResources: ["*"],
    });

    const receivePollyTaskMessageTask = new tasks.CallAwsService(
      this,
      "Receive Polly Task Message",
      {
        service: "sqs",
        action: "receiveMessage",
        parameters: { QueueUrl: sfn.JsonPath.stringAt("$.queueUrl") },
        resultPath: "$.receivePollyTaskMessageResult",
        iamResources: [SQS_QUEUE_ARN],
      }
    );

    const checkPollyTaskMessageReceivedChoice = new sfn.Choice(
      this,
      "Choice: Check If Received Polly Task Message"
    );

    const deletePollyTaskMessageTask = new tasks.CallAwsService(this, "Delete Polly Task Message", {
      service: "sqs",
      action: "deleteMessage",
      parameters: {
        QueueUrl: sfn.JsonPath.stringAt("$.queueUrl"),
        ReceiptHandle: sfn.JsonPath.stringAt(
          "$.receivePollyTaskMessageResult.Messages[0].ReceiptHandle"
        ),
      },
      resultPath: sfn.JsonPath.DISCARD,
      iamResources: [SQS_QUEUE_ARN],
    });

    const getSpeechSynthesisTask = new tasks.CallAwsService(this, "Get Speech Synthesis", {
      service: "polly",
      action: "getSpeechSynthesisTask",
      parameters: { TaskId: sfn.JsonPath.stringAt("$.TaskId") },
      inputPath: "$.startSpeechSynthesisTaskResult",
      resultPath: "$.getSpeechSynthesisTaskResult",
      iamResources: ["*"],
    });

    const cleanupTopicAndQueueTask2 = new tasks.LambdaInvoke(this, "Cleanup Topic And Queue 2", {
      lambdaFunction: cleanupTopicAndQueueLambda,
      resultPath: sfn.JsonPath.DISCARD,
    });

    /** ------------------ Step Function Definition ------------------ */

    const definition = checkDocumentTask
      .addCatch(documentTooLargeFailTask, { errors: ["DocumentTooLarge"], resultPath: "$.error" })
      .addCatch(unsupportedDocumentFailTask, {
        errors: ["UnsupportedDocument"],
        resultPath: "$.error",
      })
      .next(setupTopicAndQueueTask)
      .next(startDocumentTextDetectionTask)
      .next(receiveTextractJobMessageTask)
      .next(
        checkTextractJobMessageReceivedChoice
          .when(
            sfn.Condition.isNotPresent("$.receiveTextractJobMessageResult.Messages"),
            receiveTextractJobMessageTask
          )
          .otherwise(
            deleteTextractJobMessageTask.next(
              getDocumentTextDetectionTask.next(
                transformBlocksToText
                  .addCatch(cleanupTopicAndQueueTask1.next(noTextFoundFailTask), {
                    errors: ["NoTextFound"],
                    resultPath: "$.error",
                  })
                  .next(detectDominantLanguageTask)
                  .next(getVoiceIdTask)
                  .next(startSpeechSynthesisTask)
                  .next(receivePollyTaskMessageTask)
                  .next(
                    checkPollyTaskMessageReceivedChoice
                      .when(
                        sfn.Condition.isNotPresent("$.receivePollyTaskMessageResult.Messages"),
                        receivePollyTaskMessageTask
                      )
                      .otherwise(
                        deletePollyTaskMessageTask
                          .next(getSpeechSynthesisTask)
                          .next(cleanupTopicAndQueueTask2)
                      )
                  )
              )
            )
          )
      );

    const readformeStateMachine = new sfn.StateMachine(this, "ReadForMe", {
      definition,
      timeout: Duration.minutes(5),
      stateMachineName: "ReadForMe",
      stateMachineType: sfn.StateMachineType.STANDARD,
      tracingEnabled: true,
      role: readformeStateMachineRole,
    });

    /** ------------------ EventBridge Rule Definition ------------------ */

    new eventbridge.Rule(this, "S3TriggerStateMachineExecution", {
      ruleName: "S3TriggerStateMachineExecution",
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: { name: [s3Bucket.bucketName] },
          object: { key: [{ prefix: "documents/" }] },
        },
      },
      targets: [new targets.SfnStateMachine(readformeStateMachine)],
    });

    /** ------------------ Outputs Definition ------------------ */

    new CfnOutput(this, "ReadForMeStateMachineArn", {
      value: readformeStateMachine.stateMachineArn,
      description: "ReadForMe State Machine Arn",
    });

    new CfnOutput(this, "S3BucketName", {
      value: s3Bucket.bucketName,
      description: "S3 Bucket Name",
    });
  }
}
