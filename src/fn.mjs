import stream from "stream";
import util from "util";
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

const { Readable } = stream;
const pipeline = util.promisify(stream.pipeline);
const anthropic = new AnthropicBedrock();
const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

// helpers
function getBody(event) {
    let body = event.isBase64Encoded ? parseBase64(event.body) : event.body;
    console.log(JSON.stringify(body));
    return body;
}

function parseBase64(message) {
    return JSON.parse(Buffer.from(message, "base64").toString("utf-8"));
}

function cleanParsedClaudeV2Response(parsed) {
    return parsed.completion.split("\n\n").map(s => s.trim());
}

// lambda: handle response streaming with a loop
async function doLoop(responses, responseStream) {
    for (let i in responses) {
        responseStream.write(`${responses[i]}\n`);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    responseStream.end();
}

// lambda: handle response streaming with a pipeline
async function doPipeline(responses, responseStream) {
    const requestStream = Readable.from(Buffer.from(responses.join("\n")));
    await pipeline(requestStream, responseStream);
}

// bedrock: prep claude params
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

// bedrock: helpers
async function doStreamingWithAnthropicSdk(body, responseStream) {
    const response = await anthropic.completions.create({
        stream: body.lambdaParams.isStreaming,
        model: body.bedrockParams.modelId,
        max_tokens_to_sample: body.modelParams.max_tokens_to_sample,
        prompt: `${AnthropicBedrock.HUMAN_PROMPT} ${body.modelParams.prompt} ${AnthropicBedrock.AI_PROMPT}`,
    });
    const chunks = [];
    for await (const chunk of response) {
        chunks.push(chunk.completion);
        responseStream.write(chunk.completion);
    }
    console.log(chunks.join(''));
    responseStream.end();
}

async function doInvokeWithAnthropicSdk(body, responseStream) {
    const response = await client.completions.create({
        model: body.bedrockParams.modelId,
        max_tokens_to_sample: body.modelParams.max_tokens_to_sample,
        prompt: `${AnthropicBedrock.HUMAN_PROMPT} ${body.modelParams.prompt} ${AnthropicBedrock.AI_PROMPT}`
    });
    const output = cleanParsedClaudeV2Response(parsed);
    console.log(JSON.stringify(output));
    doPipeline(output, responseStream);
}

async function doStreamingWithAwsSdk(params, responseStream) {
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

async function doInvokeWithAwsSdk(params, responseStream) {
    const command = new InvokeModelCommand(params);
    const response = await bedrock.send(command);
    const parsed = parseBase64(response.body);
    const output = cleanParsedClaudeV2Response(parsed);
    console.log(JSON.stringify(output));
    doPipeline(output, responseStream);
}

// bedrock: invoke model
async function doBedrock(body, responseStream) {
    const params = getInvokeParamsForClaudeV2(body);
    console.log(JSON.stringify(params));
    if (body.lambdaParams.isStreaming) {
        if (body.lambdaParams.useAnthropicSdk) {
            await doStreamingWithAnthropicSdk(body, responseStream);
        } else {
            await doStreamingWithAwsSdk(params, responseStream);
        }
    } else {
        await doInvokeWithAwsSdk(params, responseStream);
    }
}

export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
    console.log(JSON.stringify(event));
    const body = getBody(event);
    if (body.lambdaParams.handler === "bedrock") {
        await doBedrock(body, responseStream);
    } else if (body.lambdaParams.handler === "pipeline") {
        await doPipeline(body.message, responseStream);
    } else {
        await doLoop(body.message, responseStream);
    }
    console.log(JSON.stringify({"status": "complete"}));
});