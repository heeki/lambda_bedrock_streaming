import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { parseBase64, cleanResponse, doPipeline } from "./core.js";

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

function getInvokeParamsForClaudeV2(body) {
    const modelParams = body.modelParams;
    const prompt = `\n\nHuman:${modelParams.prompt}Assistant:`;
    modelParams.prompt = prompt;

    const bedrockParams = body.bedrockParams;
    bedrockParams.body = JSON.stringify(modelParams);

    if (body.lambdaParams.isStreaming) {
        bedrockParams.responseStream = true;
    }
    return bedrockParams;
}

async function invokeWithAwsSdk(body, responseStream) {
    const originalPrompt = body.modelParams.prompt;
    const params = getInvokeParamsForClaudeV2(body);
    if (body.lambdaParams.isStreaming) {
        responseStream.write(originalPrompt);
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
    } else {
        const command = new InvokeModelCommand(params);
        const response = await bedrock.send(command);
        const parsed = parseBase64(response.body);
        const output = cleanResponse(parsed);
        console.log(JSON.stringify(output));
        doPipeline(output, responseStream);
    }
}

export {
    invokeWithAwsSdk
}