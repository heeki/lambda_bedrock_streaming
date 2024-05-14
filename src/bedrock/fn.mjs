import { invokeWithAnthropicSdk } from "./lib/anthropicClaude.js";
import { invokeWithAwsSdk } from "./lib/awsClaude.js";
import { initializeVectorCache, invokeWithVectorContext } from "./lib/awsTitan.js";
import { doLoop, getBody } from "./lib/core.js";

const vectorStoreRetriever = await initializeVectorCache();

export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
    console.log(JSON.stringify(event));
    const body = getBody(event);
    switch (body.lambdaParams.sdk) {
        case "helloworld":
            await doLoop(body.message, body.lambdaParams.pauseMs, responseStream);
            break;
        case "anthropicClaude":
            await invokeWithAnthropicSdk(body, responseStream);
            break;
        case "awsClaude":
            await invokeWithAwsSdk(body, responseStream);
            break;
        case "awsTitan":
            await invokeWithVectorContext(body.modelParams.prompt, vectorStoreRetriever, responseStream);
            break;
    }
    console.log(JSON.stringify({"status": "complete"}));
})