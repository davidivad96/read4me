import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";

export const getLambdaFunctionProps = (name: string, role: iam.IRole | undefined = undefined) => ({
  runtime: lambda.Runtime.NODEJS_14_X,
  code: lambda.Code.fromAsset(`./lambdas/${name}`),
  handler: "index.handler",
  role,
  environment: { CDK_DEPLOY_REGION: process.env.CDK_DEPLOY_REGION || "us-east-1" },
});

export const getRandom = () =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
