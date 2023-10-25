include etc/environment.sh

lambda: lambda.package lambda.deploy
lambda.package:
	sam package -t ${LAMBDA_TEMPLATE} --region ${REGION} --output-template-file ${LAMBDA_OUTPUT} --s3-bucket ${BUCKET} --s3-prefix ${LAMBDA_STACK}
lambda.deploy:
	sam deploy -t ${LAMBDA_OUTPUT} --region ${REGION} --stack-name ${LAMBDA_STACK} --parameter-overrides ${LAMBDA_PARAMS} --capabilities CAPABILITY_NAMED_IAM

lambda.local:
	sam local invoke -t ${LAMBDA_TEMPLATE} --parameter-overrides ${LAMBDA_PARAMS} --env-vars etc/envvars.json -e etc/event.json Fn | jq
lambda.invoke.sync:
	aws --profile ${PROFILE} lambda invoke --function-name ${O_FN} --invocation-type RequestResponse --payload file://etc/event.json --cli-binary-format raw-in-base64-out --log-type Tail tmp/fn.json | jq "." > tmp/response.json
	cat tmp/response.json | jq -r ".LogResult" | base64 --decode
	cat tmp/fn.json | jq
lambda.invoke.async:
	aws --profile ${PROFILE} lambda invoke --function-name ${O_FN} --invocation-type Event --payload file://etc/event.json --cli-binary-format raw-in-base64-out --log-type Tail tmp/fn.json | jq "."

curl:
	curl -s -XPOST -d @etc/payload.json ${O_FURL} --no-buffer
curl.compressed:
	curl -s -XPOST -d @etc/payload.json ${O_FURL} --no-buffer --compressed
curl.auth:
	curl -s -XPOST -d @etc/payload.json ${O_FURL} --user "${AWS_ACCESS_KEY}:${AWS_SECRET_ACCESS_KEY}"" --aws-sigv4 "aws:amz:${REGION}:lambda" --no-buffer