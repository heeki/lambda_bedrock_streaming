import stream from "stream";
import util from "util";

// initialization
const { Readable } = stream;
const pipeline = util.promisify(stream.pipeline);

// convert base64 to string
function parseBase64(message) {
    return JSON.parse(Buffer.from(message, "base64").toString("utf-8"));
}

// split string by newline and trim whitespaces
function cleanResponse(response) {
    return response.completion.split("\n\n").map(s => s.trim());
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

export {
    parseBase64,
    cleanResponse,
    doLoop,
    doPipeline
}