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

## Testing
In order to use the curl commands with IAM authentication enabled, you can use the `--user access_key:secret_access_key` parameter but this is insecure as it exposes your credentials to the command line history. Alternatively, you can configure a `~/.netrc` file and setup your credentials there. This allows you to instead use `--netrc` which then retrieves the credentials from that file. More details can be found in the [curl](https://everything.curl.dev/usingcurl/netrc) documentation.

You can do some initial Lambda response streaming testing with the `etc/streaming.json` event payload and the following commands:
* If you set `AuthType: NONE`, you can curl your endpoint with `make curl`.
* If you set `AuthType: AWS_IAM`, you can curl your endpoint with `make curl.auth`.
* If you update the field `"handler"` to `"pipeline"` in `etc/streaming.json`, you can run the same curl commands above to test a different method of returning the streaming response payload.

You can now test Bedrock with response streaming with the `etc/bedrock.json` event payload with the `make curl.bedrock`.
* You can enable or disable response streaming by setting `"streaming"` to `true` or `false`.
* You can also test using different SDKs for response streaming by setting `"anthropic"` to `true` (Anthropic SDK) or `false` (AWS SDK).
