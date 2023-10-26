import stream from "stream";
import util from "util";
import { BedrockRuntime } from "@aws-sdk/client-bedrock-runtime";

const { Readable } = stream;
const pipeline = util.promisify(stream.pipeline);
const bedrock = new BedrockRuntime({ region: "us-east-1" });

// handle response streaming
async function doLoop(message, responseStream) {
    for (let i in message) {
        responseStream.write(`${message[i]}\n`);
        await new Promise(r => setTimeout(r, 50));
    }
    responseStream.end();
}

async function doPipeline(message, responseStream) {
    const requestStream = Readable.from(Buffer.from(message.join("\n")));
    await pipeline(requestStream, responseStream);
}

// bedrock
async function doBedrock(body, responseStream) {
    let wrapped = body;
    wrapped["prompt"] = `\n\nHuman:${body["prompt"]}Assistant:`;
    const params = {
        "body": JSON.stringify(wrapped),
        "modelId": "anthropic.claude-v2",
        "accept": "application/json",
        "contentType": "application/json"
    }
    const response = await new Promise((resolve, reject) => {
        bedrock.invokeModel(params, function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        })
    });
    const parsed = JSON.parse(
        new TextDecoder().decode(response.body)
    )
    const output = parsed["completion"].split("\n\n").map(i => i.trim());
    await doLoop(output, responseStream)
    console.log(JSON.stringify(output));
    return output;
}

// get body from furl event
function getBody(event) {
    let body = event["isBase64Encoded"] ? JSON.parse(Buffer.from(event["body"], "base64").toString("utf-8")) : event["body"];
    console.log(JSON.stringify(body));
    return body;
}

export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
    console.log(JSON.stringify(event));
    const body = getBody(event);
    if (body["handler"] === "bedrock") {
        await doBedrock(body["params"], responseStream);
    } else if (body["handler"] === "pipeline") {
        await doPipeline(body["message"], responseStream);
    } else {
        await doLoop(body["message"], responseStream);
    }
});

// export async function handler(event, context) {
//     console.log(JSON.stringify(event));
//     const body = getBody(event);
//     const response = await doInvokeModel(body)
//     return response;
// };