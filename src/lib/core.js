import stream from "stream";
import util from "util";

// initialization
const { Readable } = stream;
const pipeline = util.promisify(stream.pipeline);

// initialize enums
const SourceType = {
    FS: "fs",
    S3: "s3"
};
const VectorStoreType = {
    FAISS: "faiss",
    MEMORY: "memory",
    PINECONE: "pinecone"
};

// convert base64 to string
function parseBase64(message) {
    return JSON.parse(Buffer.from(message, "base64").toString("utf-8"));
}

// extract body from event payload
function getBody(event) {
    let body = event.isBase64Encoded ? parseBase64(event.body) : event.body;
    console.log(JSON.stringify(body));
    return body;
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
    SourceType,
    VectorStoreType,
    parseBase64,
    getBody,
    cleanResponse,
    doLoop,
    doPipeline
}