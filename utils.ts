import { Duration } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";

export const getLambdaFunctionProps = (
  name: string,
  role: iam.IRole | undefined,
  timeout: Duration | undefined,
  environment: { [key: string]: string }
) => ({
  runtime: lambda.Runtime.NODEJS_14_X,
  code: lambda.Code.fromAsset(`./lambdas/${name}`),
  handler: "index.handler",
  role: role || undefined,
  timeout: timeout || undefined,
  environment: {
    CDK_DEPLOY_REGION: process.env.CDK_DEPLOY_REGION || "us-east-1",
    ...environment,
  },
});
