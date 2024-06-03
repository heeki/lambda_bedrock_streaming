import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

// convert base64 to string
function parseBase64(message) {
    return JSON.parse(Buffer.from(message, "base64").toString("utf-8"));
}

// construct parameters for claude v2
function getInvokeParamsForClaudeV2(body) {
    // update prompt to claude v2 format
    const modelParams = body;
    const updatedPrompt = `\n\nHuman:${modelParams.prompt}Assistant:`;
    modelParams.prompt = updatedPrompt;

    // construct parameters for bedrock invoke
    const bedrockParams = {
        "modelId": "anthropic.claude-v2",
        "contentType": "application/json",
        "accept": "*/*",
        "body": JSON.stringify(modelParams),
        "responseStream": true
    }
    return bedrockParams;
}

// invoke bedrock model with a streaming response
async function invokeWithAwsSdk(body, responseStream) {
    responseStream.write(body.prompt);
    const params = getInvokeParamsForClaudeV2(body);
    const command = new InvokeModelWithResponseStreamCommand(params);
    const response = await bedrock.send(command);
    const chunks = [];
    for await (const chunk of response.body) {
        const parsed = parseBase64(chunk.chunk.bytes);
        chunks.push(parsed.completion);
        responseStream.write(parsed.completion);
    }
    console.log(chunks.join(''));
    responseStream.end();
}

// lambda handler
export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
    console.log(JSON.stringify(event));
    let body = event.isBase64Encoded ? parseBase64(event.body) : event.body;
    await invokeWithAwsSdk(body, responseStream);
    console.log(JSON.stringify({"status": "complete"}));
})