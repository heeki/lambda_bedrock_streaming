include etc/environment.sh

lambda: lambda.package lambda.deploy
lambda.build:
	sam build -t ${LAMBDA_TEMPLATE} --parameter-overrides ${LAMBDA_PARAMS} --build-dir build --manifest src/package.json --use-container
	sam package -t build/template.yaml --region ${REGION} --output-template-file ${LAMBDA_OUTPUT} --s3-bucket ${BUCKET} --s3-prefix ${LAMBDA_STACK}
lambda.package:
	sam package -t ${LAMBDA_TEMPLATE} --region ${REGION} --output-template-file ${LAMBDA_OUTPUT} --s3-bucket ${BUCKET} --s3-prefix ${LAMBDA_STACK}
lambda.deploy:
	sam deploy -t ${LAMBDA_OUTPUT} --region ${REGION} --stack-name ${LAMBDA_STACK} --parameter-overrides ${LAMBDA_PARAMS} --capabilities CAPABILITY_NAMED_IAM

lambda.local:
	sam local invoke -t ${LAMBDA_TEMPLATE} --parameter-overrides ${LAMBDA_PARAMS} --env-vars etc/envvars.json -e etc/local.json Fn | jq
lambda.invoke.sync:
	aws --profile ${PROFILE} lambda invoke --function-name ${O_FN} --invocation-type RequestResponse --payload file://etc/event.json --cli-binary-format raw-in-base64-out --log-type Tail tmp/fn.json | jq "." > tmp/response.json
	cat tmp/response.json | jq -r ".LogResult" | base64 --decode
	cat tmp/fn.json | jq
lambda.invoke.async:
	aws --profile ${PROFILE} lambda invoke --function-name ${O_FN} --invocation-type Event --payload file://etc/event.json --cli-binary-format raw-in-base64-out --log-type Tail tmp/fn.json | jq "."

cloudfront: cloudfront.package cloudfront.deploy
cloudfront.package:
	sam package -t ${CLOUDFRONT_TEMPLATE} --region ${REGION} --output-template-file ${CLOUDFRONT_OUTPUT} --s3-bucket ${BUCKET} --s3-prefix ${CLOUDFRONT_STACK}
cloudfront.deploy:
	sam deploy -t ${CLOUDFRONT_OUTPUT} --region ${REGION} --stack-name ${CLOUDFRONT_STACK} --parameter-overrides ${CLOUDFRONT_PARAMS} --capabilities CAPABILITY_NAMED_IAM

iam.assumerole:
	aws --profile ${PROFILE} sts assume-role --role-arn ${O_CLIENT_ROLE} --role-session-name furl | tee tmp/credentials.json | jq

curl:
	curl -s -XPOST -d @etc/streaming.json ${O_FURL} --no-buffer
curl.compressed:
	curl -s -XPOST -d @etc/streaming.json ${O_FURL} --no-buffer --compressed
curl.auth:
	curl -s -XPOST -d @etc/streaming.json ${O_FURL} --netrc --aws-sigv4 aws:amz:${REGION}:lambda --no-buffer
curl.bedrock:
	curl -s -XPOST -d @etc/bedrock.json ${O_FURL} --netrc --aws-sigv4 aws:amz:${REGION}:lambda --no-buffer
curl.bedrock.claude:
	curl -s -XPOST -d @etc/bedrock_claude.json ${O_FURL} --netrc --aws-sigv4 aws:amz:${REGION}:lambda --no-buffer
curl.bedrock.titan:
	curl -s -XPOST -d @etc/bedrock_titan.json ${O_FURL} --netrc --aws-sigv4 aws:amz:${REGION}:lambda --no-buffer
curl.cloudfront:
	curl -s -XPOST -d @etc/streaming.json ${O_DISTRIBUTION_URL} --no-buffer
curl.simple:
	curl -s -XPOST -d @etc/simple.json ${O_FURL} --netrc --aws-sigv4 aws:amz:${REGION}:lambda --no-buffer

get.configuration:
	aws --profile ${PROFILE} lambda get-function-configuration --function-name ${O_FN} | jq
get.furl:
	aws --profile ${PROFILE} lambda get-function-url-config --function-name ${O_FN} | jq
get.policy:
	aws --profile ${PROFILE} lambda get-policy --function-name ${O_FN} | jq

list.models:
	aws --profile ${PROFILE} bedrock list-foundation-models | jq -r -c '.modelSummaries[] | select(.responseStreamingSupported == true) | .modelArn'

rag:
	node src/rag.mjs --trace-warnings
