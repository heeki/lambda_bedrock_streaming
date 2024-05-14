import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { cleanResponse, doPipeline } from "./core.js";

const anthropic = new AnthropicBedrock();

async function invokeWithAnthropicSdk(body, responseStream) {
    const originalPrompt = body.modelParams.prompt;
    if (body.lambdaParams.isStreaming) {
        responseStream.write(originalPrompt);
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
    } else {
        const response = await anthropic.completions.create({
            model: body.bedrockParams.modelId,
            max_tokens_to_sample: body.modelParams.max_tokens_to_sample,
            prompt: `${AnthropicBedrock.HUMAN_PROMPT} ${body.modelParams.prompt} ${AnthropicBedrock.AI_PROMPT}`
        });
        const output = cleanResponse(response);
        console.log(JSON.stringify(output));
        doPipeline(output, responseStream);
    }
}

export {
    invokeWithAnthropicSdk
}