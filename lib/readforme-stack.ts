import { Stack, StackProps, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as eventbridge from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { getLambdaFunctionProps } from "../utils";

export class ReadformeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /** ------------------ Bucket Definition ------------------ */

    const random = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const bucketName = `readforme-${random}`;
    const s3Bucket = new s3.Bucket(this, bucketName, {
      bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
      // TODO: remove "removalPolicy" attribute when the stack is working
      removalPolicy: RemovalPolicy.DESTROY,
    });

    /** ------------------ Roles, Policies and Permissions Definition ------------------ */

    const SNSAndSQSSetupPolicy = new iam.ManagedPolicy(this, "SNSAndSQSPolicy", {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "sns:CreateTopic",
            "sns:Subscribe",
            "sqs:CreateQueue",
            "sqs:GetQueueAttributes",
            "sqs:SetQueueAttributes",
          ],
          resources: [
            `arn:aws:sns:*:${process.env.CDK_DEPLOY_ACCOUNT}:ReadformeJob_*`,
            `arn:aws:sqs:*:${process.env.CDK_DEPLOY_ACCOUNT}:ReadformeJob_*`,
          ],
        }),
      ],
    });

    const SNSAndSQSCleanupPolicy = new iam.ManagedPolicy(this, "SNSAndSQSCleanupPolicy", {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["sns:Unsubscribe"],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["sns:DeleteTopic", "sqs:DeleteQueue"],
          resources: [
            `arn:aws:sns:*:${process.env.CDK_DEPLOY_ACCOUNT}:ReadformeJob_*`,
            `arn:aws:sqs:*:${process.env.CDK_DEPLOY_ACCOUNT}:ReadformeJob_*`,
          ],
        }),
      ],
    });

    const SNSPublishPolicy = new iam.ManagedPolicy(this, "SNSPublishPolicy", {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["sns:Publish"],
          resources: [`arn:aws:sns:*:${process.env.CDK_DEPLOY_ACCOUNT}:ReadformeJob_*`],
        }),
      ],
    });

    const textractStartDocumentTextDetectionPolicy = new iam.ManagedPolicy(
      this,
      "TextractStartDocumentTextDetectionPolicy",
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["textract:StartDocumentTextDetection"],
            resources: ["*"],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:GetObject"],
            resources: [`${s3Bucket.bucketArn}/documents/*`],
          }),
        ],
      }
    );

    const SQSReceiveTextractJobMessagePolicy = new iam.ManagedPolicy(this, "SQSReceiveTextractJobMessagePolicy", {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["sqs:ReceiveMessage"],
          resources: [`arn:aws:sqs:*:${process.env.CDK_DEPLOY_ACCOUNT}:ReadformeJob_*`],
        }),
      ],
    });

    const SQSDeleteTextractJobMessagePolicy = new iam.ManagedPolicy(this, "SQSDeleteTextractJobMessagePolicy", {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["sqs:DeleteMessage"],
          resources: [`arn:aws:sqs:*:${process.env.CDK_DEPLOY_ACCOUNT}:ReadformeJob_*`],
        }),
      ],
    });

    const textractGetDocumentTextDetectionPolicy = new iam.ManagedPolicy(
      this,
      "TextractGetDocumentTextDetectionPolicy",
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["textract:GetDocumentTextDetection"],
            resources: ["*"],
          }),
        ],
      }
    );

    const comprehendDetectDominantLanguagePolicy = new iam.ManagedPolicy(
      this,
      "ComprehendDetectDominantLanguagePolicy",
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["comprehend:DetectDominantLanguage"],
            resources: ["*"],
          }),
        ],
      }
    );

    const textractSNSPublishRole = new iam.Role(this, "TextractSNSPublishRole", {
      assumedBy: new iam.ServicePrincipal("textract.amazonaws.com"),
      managedPolicies: [SNSPublishPolicy],
      roleName: "TextractSNSPublishRole",
    });

    const setupTopicAndQueueLambdaRole = new iam.Role(this, "SetupTopicAndQueueLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        SNSAndSQSSetupPolicy,
      ],
      roleName: "SetupTopicAndQueueLambdaRole",
    });

    const cleanupTopicAndQueueLambdaRole = new iam.Role(this, "CleanupTopicAndQueueLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        SNSAndSQSCleanupPolicy,
      ],
      roleName: "CleanupTopicAndQueueLambdaRole",
    });

    const startDocumentTextDetectionLambdaRole = new iam.Role(this, "StartDocumentTextDetectionLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        textractStartDocumentTextDetectionPolicy,
      ],
      roleName: "StartDocumentTextDetectionLambdaRole",
    });

    const receiveTextractJobMessageLambdaRole = new iam.Role(this, "ReceiveTextractJobMessageLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        SQSReceiveTextractJobMessagePolicy,
      ],
      roleName: "ReceiveTextractJobMessageLambdaRole",
    });

    const deleteTextractJobMessageLambdaRole = new iam.Role(this, "DeleteTextractJobMessageLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        SQSDeleteTextractJobMessagePolicy,
      ],
      roleName: "DeleteTextractJobMessageLambdaRole",
    });

    const getDocumentTextDetectionLambdaRole = new iam.Role(this, "GetDocumentTextDetectionLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        textractGetDocumentTextDetectionPolicy,
      ],
    });

    const detectDominantLanguageLambdaRole = new iam.Role(this, "DetectDominantLanguageLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        comprehendDetectDominantLanguagePolicy,
      ],
    });

    /** ------------------ Lambda Handlers Definition ------------------ */

    const checkDocumentLambda = new lambda.Function(
      this,
      "CheckDocument",
      getLambdaFunctionProps("checkDocument", undefined, undefined, {})
    );

    const setupTopicAndQueueLambda = new lambda.Function(
      this,
      "SetupTopicAndQueue",
      getLambdaFunctionProps("setupTopicAndQueue", setupTopicAndQueueLambdaRole, undefined, {})
    );

    const startDocumentTextDetectionLambda = new lambda.Function(
      this,
      "StartDocumentTextDetection",
      getLambdaFunctionProps("startDocumentTextDetection", startDocumentTextDetectionLambdaRole, undefined, {
        TEXTRACT_SNS_PUBLISH_ROLE_ARN: textractSNSPublishRole.roleArn,
      })
    );

    const receiveTextractJobMessageLambda = new lambda.Function(
      this,
      "ReceiveTextractJobMessage",
      getLambdaFunctionProps("receiveTextractJobMessage", receiveTextractJobMessageLambdaRole, Duration.seconds(30), {})
    );

    const deleteTextractJobMessageLambda = new lambda.Function(
      this,
      "DeleteTextractJobMessage",
      getLambdaFunctionProps("deleteTextractJobMessage", deleteTextractJobMessageLambdaRole, undefined, {})
    );

    const getDocumentTextDetectionLambda = new lambda.Function(
      this,
      "GetDocumentTextDetection",
      getLambdaFunctionProps("getDocumentTextDetection", getDocumentTextDetectionLambdaRole, undefined, {})
    );

    const detectDominantLanguageLambda = new lambda.Function(
      this,
      "DetectDominantLanguage",
      getLambdaFunctionProps("detectDominantLanguage", detectDominantLanguageLambdaRole, undefined, {})
    );

    const cleanupTopicAndQueueLambda = new lambda.Function(
      this,
      "CleanupTopicAndQueue",
      getLambdaFunctionProps("cleanupTopicAndQueue", cleanupTopicAndQueueLambdaRole, undefined, {})
    );

    /** ------------------ Tasks and States Definition ------------------ */

    const checkDocumentTask = new tasks.LambdaInvoke(this, "Check Document", {
      lambdaFunction: checkDocumentLambda,
      inputPath: "$.detail",
      outputPath: "$.Payload",
    });

    const setupTopicAndQueueTask = new tasks.LambdaInvoke(this, "Setup Topic And Queue", {
      lambdaFunction: setupTopicAndQueueLambda,
      outputPath: "$.Payload",
    });

    const cleanupTopicAndQueueTask1 = new tasks.LambdaInvoke(this, "Cleanup Topic And Queue 1", {
      lambdaFunction: cleanupTopicAndQueueLambda,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const cleanupTopicAndQueueTask2 = new tasks.LambdaInvoke(this, "Cleanup Topic And Queue 2", {
      lambdaFunction: cleanupTopicAndQueueLambda,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const startDocumentTextDetectionTask = new tasks.LambdaInvoke(this, "Start Document Text Detection", {
      lambdaFunction: startDocumentTextDetectionLambda,
      resultSelector: { "JobId.$": "$.Payload.JobId" },
      resultPath: "$.startDocumentTextDetectionResult",
    });

    const receiveTextractJobMessageTask = new tasks.LambdaInvoke(this, "Receive Textract Job Message", {
      lambdaFunction: receiveTextractJobMessageLambda,
      resultSelector: { "Message.$": "$.Payload.Message" },
      resultPath: "$.receiveTextractJobMessageResult",
    });

    const deleteTextractJobMessageTask = new tasks.LambdaInvoke(this, "Delete Textract Job Message", {
      lambdaFunction: deleteTextractJobMessageLambda,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const checkTextractJobMessageReceivedChoice = new sfn.Choice(
      this,
      "Choice: Check If Received Textract Job Message"
    );

    const getDocumentTextDetectionTask = new tasks.LambdaInvoke(this, "Get Document Text Detection", {
      lambdaFunction: getDocumentTextDetectionLambda,
      inputPath: "$.receiveTextractJobMessageResult.Message.Body",
      resultSelector: { "Text.$": "$.Payload" },
      resultPath: "$.getDocumentTextDetectionResult",
    });

    const detectDominantLanguageTask = new tasks.LambdaInvoke(this, "Detect Dominant Language", {
      lambdaFunction: detectDominantLanguageLambda,
      inputPath: "$.getDocumentTextDetectionResult",
      resultSelector: { "LanguageCode.$": "$.Payload.Languages[0].LanguageCode" },
      resultPath: "$.detectDominantLanguageResult",
    });

    const documentTooLargeFailTask = new sfn.Fail(this, "Fail: Document Too Large", {
      error: "DocumentTooLarge",
      cause: "Size limit is 5MB!",
    });

    const unsupportedDocumentFailTask = new sfn.Fail(this, "Fail: Unsupported Document", {
      error: "UnsupportedDocument",
      cause: "Allowed documents: PDF, PNG, JPG, JPEG and TIFF",
    });

    const noTextFoundFailTask = new sfn.Fail(this, "Fail: No Text Found", {
      error: "NoTextFound",
      cause: "No text was found in the document!",
    });

    /** ------------------ Step Function Definition ------------------ */

    const definition = checkDocumentTask
      .addCatch(documentTooLargeFailTask, { errors: ["DocumentTooLarge"] })
      .addCatch(unsupportedDocumentFailTask, { errors: ["UnsupportedDocument"] })
      .next(setupTopicAndQueueTask)
      .next(startDocumentTextDetectionTask)
      .next(receiveTextractJobMessageTask)
      .next(
        checkTextractJobMessageReceivedChoice
          .when(
            sfn.Condition.isNotPresent("$.receiveTextractJobMessageResult.Message.Body"),
            receiveTextractJobMessageTask
          )
          .otherwise(
            deleteTextractJobMessageTask
              .next(
                getDocumentTextDetectionTask.addCatch(cleanupTopicAndQueueTask2.next(noTextFoundFailTask), {
                  errors: ["NoTextFound"],
                  resultPath: "$.error",
                })
              )
              .next(detectDominantLanguageTask)
              .next(cleanupTopicAndQueueTask1)
          )
      );

    const readformeStateMachine = new sfn.StateMachine(this, "ReadForMe", {
      definition,
      timeout: Duration.minutes(5),
      stateMachineName: "ReadForMe",
      stateMachineType: sfn.StateMachineType.STANDARD,
      tracingEnabled: true,
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
  }
}
