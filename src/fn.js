const pipeline = require("util").promisify(require("stream").pipeline);
const { Readable } = require('stream');

async function doHelloWorld(message, responseStream) {
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

function getPayload(event) {
    let body = event["isBase64Encoded"] ? Buffer.from(event["body"], "base64") : event["body"];
    let payload = JSON.parse(body.toString("utf-8"));
    console.log(JSON.stringify(payload));
    return payload;
}

exports.handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
    console.log(JSON.stringify(event));
    let payload = getPayload(event);

    if (payload["handler"] === "pipeline") {
        await doPipeline(payload["message"], responseStream);
    } else {
        await doHelloWorld(payload["message"], responseStream);
    }
});
