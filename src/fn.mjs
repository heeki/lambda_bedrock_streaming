import stream from "stream";
import util from "util";
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

const { Readable } = stream;
const pipeline = util.promisify(stream.pipeline);
const client = new BedrockRuntimeClient({ region: "us-east-1" });

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
    return parsed["completion"].split("\n\n").map(s => s.trim());
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
        output.streaming = streaming;
    }
    return output;
}

// bedrock: helpers
async function doStreamingWithAnthropicSdk(body, responseStream) {
    const anthropic = new AnthropicBedrock();
    const stream = await anthropic.completions.create({
        prompt: `${AnthropicBedrock.HUMAN_PROMPT} ${body.params.prompt} ${AnthropicBedrock.AI_PROMPT}`,
        model: body.model,
        stream: body.streaming,
        max_tokens_to_sample: body.params.max_tokens_to_sample,
      });
      for await (const completion of stream) {
        responseStream.write(completion.completion);
      }
      responseStream.end();
}

// wip
async function doStreamingWithAwsSdk(params, responseStream) {
    const command = new InvokeModelWithResponseStreamCommand(params);
    return new Promise((resolve, reject) => {
        client.send(command, (err, data) => {
            if (err) {
                console.error("failed bedrock.send(): ", err);
            } else {
                console.log("data: ", JSON.stringify(data));
                var stream = data.body.options.messageStream.options.inputStream;
                stream.on("data", (event) => {
                    console.log("event: ", JSON.stringify(event));
                    if (event.chunk) {
                        let partial = parseBase64(event.chunk.bytes);
                        console.log(partial);
                        responseStream.write(partial);
                    } else if (event.internalServerException) {
                        console.error("internalServerException");
                    } else if (event.modelStreamErrorException) {
                        console.error("modelStreamErrorException");
                    } else if (event.modelTimeoutException) {
                        console.error("modelTimeoutException");
                    } else if (event.throttlingException) {
                        console.error("throttlingException");
                    } else if (event.validationException) {
                        console.error("validationException");
                    }
                });
                stream.on("error", (err) => {
                    console.error("error: ", JSON.stringify(err));
                    reject(err);
                });
                stream.on("end", () => {
                    console.log("end");
                    responseStream.end();
                    resolve();
                });
            }
        });
    });
}

async function doInvokeWithAwsSdk(params, responseStream) {
    const command = new InvokeModelCommand(params);
    const response = await client.send(command);
    const parsed = parseBase64(response.body);
    const output = cleanParsed(parsed);
    console.log(JSON.stringify(output));
    doPipeline(output, responseStream);
}

// bedrock: invoke model
async function doBedrock(body, responseStream) {
    const params = getInvokeParams(body.params, body.model, body.streaming);
    if (body.streaming) {
        // await doStreamingWithAwsSdk(params, responseStream);
        await doStreamingWithAnthropicSdk(body, responseStream);
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