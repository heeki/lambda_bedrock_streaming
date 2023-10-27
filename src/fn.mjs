import stream from "stream";
import util from "util";
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

const { Readable } = stream;
const pipeline = util.promisify(stream.pipeline);
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

function cleanParsed(parsed) {
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
function getInvokeParams(params, model, streaming) {
    let wrapped = params;
    if (model === "anthropic.claude-v2") {
        wrapped.prompt = `\n\nHuman:${params.prompt}Assistant:`;
    }

    const output = {
        "modelId": model,
        "contentType": "application/json",
        "accept": "*/*",
        "body": JSON.stringify(wrapped)
    };
    if (streaming) {
        output.responseStream = true;
    }
    return output;
}

// bedrock: helpers
async function doStreamingWithAnthropicSdk(body, responseStream) {
    const anthropic = new AnthropicBedrock();
    const response = await anthropic.completions.create({
        prompt: `${AnthropicBedrock.HUMAN_PROMPT} ${body.params.prompt} ${AnthropicBedrock.AI_PROMPT}`,
        model: body.model,
        stream: body.streaming,
        max_tokens_to_sample: body.params.max_tokens_to_sample,
    });
    const chunks = [];
    for await (const chunk of response) {
        chunks.push(chunk.completion);
        responseStream.write(chunk.completion);
    }
    console.log(chunks.join(''));
    responseStream.end();
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
    const output = cleanParsed(parsed);
    console.log(JSON.stringify(output));
    doPipeline(output, responseStream);
}

// bedrock: invoke model
async function doBedrock(body, responseStream) {
    const params = getInvokeParams(body.params, body.model, body.streaming);
    console.log(JSON.stringify(params));
    if (body.streaming) {
        if (body.anthropic) {
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
    if (body.handler === "bedrock") {
        await doBedrock(body, responseStream);
    } else if (body.handler === "pipeline") {
        await doPipeline(body.message, responseStream);
    } else {
        await doLoop(body.message, responseStream);
    }
    console.log(JSON.stringify({"status": "complete"}));
});