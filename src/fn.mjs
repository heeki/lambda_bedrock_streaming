import { invokeWithAnthropicSdk } from "./lib/anthropicClaude.js";
import { invokeWithAwsSdk } from "./lib/awsClaude.js";
import { parseBase64 } from "./lib/core.js";

// helpers
function getBody(event) {
    let body = event.isBase64Encoded ? parseBase64(event.body) : event.body;
    console.log(JSON.stringify(body));
    return body;
}

export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
    console.log(JSON.stringify(event));
    const body = getBody(event);
    switch (body.lambdaParams.sdk) {
        case "anthropic":
            await invokeWithAnthropicSdk(body, responseStream);
            break;
        case "aws":
            await invokeWithAwsSdk(body, responseStream);
            break;
    }
    console.log(JSON.stringify({"status": "complete"}));
})