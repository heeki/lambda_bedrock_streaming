## Overview
This repository implemented a Lambda function URL with streaming responses from Bedrock. The code implements the Anthropic Claude v2 model specifically, as the model has particular parameters and schema expectations.

## Pre-requisites
Copy `etc/environment.template` to `etc/environment.sh` and update accordingly.
* `PROFILE`: your AWS CLI profile with the appropriate credentials to deploy
* `REGION`: your AWS region
* `BUCKET`: your configuration bucket

For the Lambda stack, update the following accordingly.
* `P_FN_MEMORY`: amount of memory in MB for the Lambda function
* `P_FN_TIMEOUT`: timeout in seconds for the Lambda function

## Deployment
To deploy the stack, run the following command: `make lambda`.

After completing the deployment, capture the following outputs in your `etc/environment.sh` file.
* `O_FN`: output function name
* `O_FURL`: output function url fqdn

## Configuration
The `etc/bedrock.json` event payload file has been setup to simplify invocation of the Bedrock API while giving you flexibility to try different code paths.
* `lambdaParams.handler`:
    * `bedrock`: invokes the Bedrock API
    * `pipeline`: uses `stream.pipeline` to stream responses
    * `helloworld`: any other value will use a loop with a 50 ms delay between each iteration
* `lambdaParams.isStreaming`: `true | false`
* `lambdaParams.useAnthropicSdk`: `true | false`
* `modelParams.prompt`: update this to whatever prompt you want to initially use

## Testing
In order to use the curl commands with IAM authentication enabled, you can use the `--user access_key:secret_access_key` parameter but this is insecure as it exposes your credentials to the command line history. Alternatively, you can configure a `~/.netrc` file and setup your credentials there. This allows you to instead use `--netrc` which then retrieves the credentials from that file. More details can be found in the [curl](https://everything.curl.dev/usingcurl/netrc) documentation.

You can do some initial Lambda response streaming testing with the `etc/streaming.json` event payload and the following commands:
* If you set `AuthType: NONE`, you can curl your endpoint with `make curl`.
* If you set `AuthType: AWS_IAM`, you can curl your endpoint with `make curl.auth`.

You can now test Bedrock with response streaming with the `etc/bedrock.json` event payload with the `make curl.bedrock`.

## Local testing
SAM local does not support streaming responses, so `sam local invoke` command will end in a function timeout:
```
An unexpected error was encountered while executing "sam local invoke".
Function 'Fn' timed out after 30 seconds
```