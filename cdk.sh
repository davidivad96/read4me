#!/usr/bin/env bash
if [[ $# -ge 4 ]]; then
    command=$1
    export AWS_PROFILE=$2
    export CDK_DEPLOY_ACCOUNT=$3
    export CDK_DEPLOY_REGION=$4
    shift 4;
    if [[ $command == "bootstrap" ]]; then
        cdk bootstrap "$@"
    elif [[ $command == "deploy" ]]; then
        cdk deploy "$@"
    elif [[ $command == "destroy" ]]; then
        cdk destroy "$@"
    else
        echo 1>&2 "Invalid command. First argument must be one of 'bootstrap', 'deploy', or 'destroy'."
    fi
    exit $?
else
    echo 1>&2 "Provide command to execute, AWS profile, account and region as first four args."
    echo 1>&2 "Example: ./cdk.sh deploy my-profile 123456789012 us-east-1"
    echo 1>&2 "Additional args are passed through to cdk command."
    exit 1
fi