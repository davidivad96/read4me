import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { getLambdaFunctionProps, getRandom } from "../utils";

export class ReadformeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /** ------------------ Bucket Definition ------------------ */

    const random = getRandom();
    const bucketName = `readforme-${random}`;
    const s3Bucket = new s3.Bucket(this, bucketName, {
      bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // TODO: allow only deployed frontend
      cors: [
        { allowedOrigins: ["*"], allowedHeaders: ["*"], allowedMethods: [s3.HttpMethods.PUT] },
      ],
    });

    /** ------------------ Roles, Policies and Permissions Definition ------------------ */

    const synthesizeSpeechLambdaRolePolicy = new iam.ManagedPolicy(
      this,
      "SynthesizeSpeechLambdaRolePolicy",
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["polly:SynthesizeSpeech"],
            resources: ["*"],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:GetObject", "s3:PutObject"],
            resources: [`${s3Bucket.bucketArn}/audios/*`],
          }),
        ],
      }
    );

    const synthesizeSpeechLambdaRole = new iam.Role(this, "SynthesizeSpeechLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        synthesizeSpeechLambdaRolePolicy,
      ],
    });

    const readformeStateMachinePolicy = new iam.ManagedPolicy(this, "ReadformeStateMachinePolicy", {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["s3:GetObject"],
          resources: [`${s3Bucket.bucketArn}/documents/*`],
        }),
      ],
    });

    const readformeStateMachineRole = new iam.Role(this, "ReadFormeStateMachineRole", {
      assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
      managedPolicies: [readformeStateMachinePolicy],
    });

    /** ------------------ Lambda Handlers Definition ------------------ */

    const parseTextLambda = new lambda.Function(
      this,
      "ParseText",
      getLambdaFunctionProps("parseText")
    );

    const getVoiceIdLambda = new lambda.Function(
      this,
      "GetVoiceId",
      getLambdaFunctionProps("getVoiceId")
    );

    const synthesizeSpeechLambda = new lambda.Function(
      this,
      "SynthesizeSpeech",
      getLambdaFunctionProps("synthesizeSpeech", synthesizeSpeechLambdaRole)
    );

    /** ------------------ Tasks Definition ------------------ */

    const detectDocumentTextTask = new tasks.CallAwsService(this, "DetectDocumentTextTask", {
      service: "textract",
      action: "detectDocumentText",
      parameters: {
        Document: {
          S3Object: {
            Bucket: sfn.JsonPath.stringAt("$.bucketName"),
            Name: sfn.JsonPath.stringAt("$.objectKey"),
          },
        },
      },
      resultPath: "$.detectDocumentTextResult",
      iamResources: ["*"],
    });

    const parseTextTask = new tasks.LambdaInvoke(this, "Parse Text", {
      lambdaFunction: parseTextLambda,
      inputPath: "$.detectDocumentTextResult",
      resultSelector: { "Text.$": "$.Payload" },
      resultPath: "$.detectDocumentTextResult",
    });

    const detectDominantLanguageTask = new tasks.CallAwsService(this, "Detect Dominant Language", {
      service: "comprehend",
      action: "detectDominantLanguage",
      parameters: { Text: sfn.JsonPath.stringAt("$.Text") },
      inputPath: "$.detectDocumentTextResult",
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

    const synthesizeSpeechTask = new tasks.LambdaInvoke(this, "Synthesize Speech", {
      lambdaFunction: synthesizeSpeechLambda,
      resultSelector: { "SignedUrl.$": "$.Payload" },
      resultPath: "$.synthesizeSpeechResult",
    });

    /** ------------------ StepFunctions State Machine Definition ------------------ */

    const definition = detectDocumentTextTask
      .next(parseTextTask)
      .next(detectDominantLanguageTask)
      .next(getVoiceIdTask)
      .next(synthesizeSpeechTask);

    const readformeStateMachine = new sfn.StateMachine(this, "ReadForMeStateMachine", {
      definition,
      timeout: Duration.minutes(5),
      stateMachineName: "ReadForMe",
      stateMachineType: sfn.StateMachineType.EXPRESS,
      tracingEnabled: true,
      role: readformeStateMachineRole,
      logs: {
        destination: new logs.LogGroup(this, "ReadForMeStateMachineLogGroup"),
        includeExecutionData: true,
        level: sfn.LogLevel.ALL,
      },
    });

    /** ------------------ Outputs Definition ------------------ */

    new CfnOutput(this, "ReadForMeStateMachineArnOutput", {
      value: readformeStateMachine.stateMachineArn,
      description: "ReadForMe State Machine Arn",
    });

    new CfnOutput(this, "S3BucketNameOutput", {
      value: s3Bucket.bucketName,
      description: "S3 Bucket Name",
    });
  }
}
