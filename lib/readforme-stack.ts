import { Stack, StackProps, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { join } from "path";

export class ReadformeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /** ------------------ Bucket Definition ------------------ */

    const uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const bucketName = `readforme-${uuid}`;
    const s3Bucket = new s3.Bucket(this, bucketName, {
      bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
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
            `arn:aws:sns:*:${process.env.CDK_DEPLOY_ACCOUNT}:AmazonTextractJob_*`,
            `arn:aws:sqs:*:${process.env.CDK_DEPLOY_ACCOUNT}:AmazonTextractJob_*`,
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
            `arn:aws:sns:*:${process.env.CDK_DEPLOY_ACCOUNT}:AmazonTextractJob_*`,
            `arn:aws:sqs:*:${process.env.CDK_DEPLOY_ACCOUNT}:AmazonTextractJob_*`,
          ],
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

    const textractSNSPublishRole = new iam.Role(this, "TextractSNSPublishRole", {
      assumedBy: new iam.ServicePrincipal("textract.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonTextractServiceRole")],
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

    /** ------------------ Lambda Handlers Definition ------------------ */

    const checkDocumentLambda = new lambda.Function(this, "CheckDocument", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset(join(__dirname, "../lambdas/checkDocument")),
      handler: "index.handler",
    });

    const setupTopicAndQueueLambda = new lambda.Function(this, "SetupTopicAndQueue", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset(join(__dirname, "../lambdas/setupTopicAndQueue")),
      handler: "index.handler",
      role: setupTopicAndQueueLambdaRole,
      environment: {
        CDK_DEPLOY_REGION: process.env.CDK_DEPLOY_REGION || "us-east-1",
      },
    });

    const startDocumentTextDetectionLambda = new lambda.Function(this, "StartDocumentTextDetection", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset(join(__dirname, "../lambdas/startDocumentTextDetection")),
      handler: "index.handler",
      role: startDocumentTextDetectionLambdaRole,
      environment: {
        CDK_DEPLOY_REGION: process.env.CDK_DEPLOY_REGION || "us-east-1",
        TEXTRACT_SNS_PUBLISH_ROLE_ARN: textractSNSPublishRole.roleArn,
      },
    });

    const cleanupTopicAndQueueLambda = new lambda.Function(this, "CleanupTopicAndQueue", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset(join(__dirname, "../lambdas/cleanupTopicAndQueue")),
      handler: "index.handler",
      role: cleanupTopicAndQueueLambdaRole,
    });

    /** ------------------ Tasks Definition ------------------ */

    const checkDocumentTask = new tasks.LambdaInvoke(this, "Check Document", {
      lambdaFunction: checkDocumentLambda,
      outputPath: "$.Payload",
    });

    const setupTopicAndQueueTask = new tasks.LambdaInvoke(this, "Setup Topic And Queue", {
      lambdaFunction: setupTopicAndQueueLambda,
      outputPath: "$.Payload",
    });

    const cleanupTopicAndQueueTask = new tasks.LambdaInvoke(this, "Cleanup Topic And Queue", {
      lambdaFunction: cleanupTopicAndQueueLambda,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const startDocumentTextDetectionTask = new tasks.LambdaInvoke(this, "Start Document Text Detection", {
      lambdaFunction: startDocumentTextDetectionLambda,
      resultSelector: { "JobId.$": "$.Payload.JobId" },
      resultPath: "$.startDocumentTextDetectionResult",
    });

    const documentTooLargeFailTask = new sfn.Fail(this, "Fail: Document Too Large", {
      error: "DocumentTooLarge",
      cause: "Size limit is 5MB!",
    });

    const unsupportedDocumentFailTask = new sfn.Fail(this, "Fail: Unsupported Document", {
      error: "UnsupportedDocument",
      cause: "Allowed documents: PDF, PNG, JPG, JPEG and TIFF",
    });

    /** ------------------ Step Function Definition ------------------ */

    const definition = checkDocumentTask
      .addCatch(documentTooLargeFailTask, {
        errors: ["DocumentTooLarge"],
      })
      .addCatch(unsupportedDocumentFailTask, {
        errors: ["UnsupportedDocument"],
      })
      .next(setupTopicAndQueueTask)
      .next(startDocumentTextDetectionTask)
      .next(cleanupTopicAndQueueTask);

    new sfn.StateMachine(this, "ReadForMe", {
      definition,
      timeout: Duration.minutes(5),
      stateMachineName: "ReadForMe",
      stateMachineType: sfn.StateMachineType.STANDARD,
      tracingEnabled: true,
    });
  }
}
