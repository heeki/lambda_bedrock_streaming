import fs from "fs";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { S3Loader } from "langchain/document_loaders/web/s3";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { BedrockEmbeddings } from "langchain/embeddings/bedrock";
import { CacheBackedEmbeddings } from "langchain/embeddings/cache_backed";
import { InMemoryStore } from "langchain/storage/in_memory";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { FaissStore } from "langchain/vectorstores/faiss";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { RunnableSequence, RunnablePassthrough } from "langchain/schema/runnable";
import { formatDocumentsAsString } from "langchain/util/document";
import { BedrockChat } from "langchain/chat_models/bedrock";
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from "langchain/prompts";
import { StringOutputParser } from "langchain/schema/output_parser";
import { SourceType, VectorStoreType, parseBase64, doPipeline } from "./core.js";

// initialize constants
const SOURCE_TYPE = SourceType.FS;
const VECTOR_STORE_TYPE = VectorStoreType.MEMORY;
const CHUNK_SIZE = 512;
const SOURCE_CONTEXT_FILE = process.env.RAG_SOURCE_FILE;

// initialize aws clients
const client = new S3Client({
    // region: process.env.AWS_REGION
});

// initialize embeddings
const embeddings = new BedrockEmbeddings({
    model: "amazon.titan-embed-text-v1",
    // region: process.env.AWS_REGION,
    // credentials: {
    //   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    //   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    // }
});

// initialize stores
const inMemoryStore = new InMemoryStore();
const pinecone = new Pinecone();
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX);

// initialize cache
const cacheBackedEmbeddings = CacheBackedEmbeddings.fromBytesStore(
    embeddings,
    inMemoryStore,
    {
      namespace: embeddings.model,
    }
);

// initialize model
const model = new BedrockChat({
    model: "anthropic.claude-v2",
    // region: process.env.AWS_REGION,
    // credentials: {
    //     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    //     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    // },
    streaming: true,
    temperature: 0.2,
    maxTokens: 2048
});

// load the source file
async function loadSource() {
    var loader;
    switch (SOURCE_TYPE) {
        case SourceType.FS:
            const command = new GetObjectCommand({
                Bucket: process.env.RAG_BUCKET,
                Key: "rag/" + SOURCE_CONTEXT_FILE
            });
            const response = await client.send(command);
            const localOutputFile = "/tmp/" + SOURCE_CONTEXT_FILE;
            const inputStream = response.Body;
            const outputStream = fs.createWriteStream(localOutputFile);
            await new Promise((resolve, reject) => {
                inputStream.pipe(outputStream)
                    .on("error", err => reject(err))
                    .on("close", () => resolve())
            });
            loader = new PDFLoader(localOutputFile, {
                splitPages: false
            });
            break;
        // TODO: this requires implementing a local Unstructured API endpoint as an extension
        case SourceType.S3:
            loader = new S3Loader({
                bucket: process.env.RAG_BUCKET,
                key: "rag/" + SOURCE_CONTEXT_FILE,
                s3Config: {
                  region: process.env.AWS_REGION,
                  credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                  },
                },
                unstructuredAPIURL: "http://localhost:8000/general/v0/general",
                unstructuredAPIKey: "U1x9U5qCFV1jed4iqXiy"
            });
            break;
    }
    const docs = await loader.load();
    return docs;
}

// split the document
async function splitDocument(docs) {
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE
    });
    const splits = await splitter.createDocuments([docs[0].pageContent]);
    return splits;
}

// create the vector store
async function createVectorStore(documents) {
    var vectorStore;
    let start = Date.now();
    switch(VECTOR_STORE_TYPE) {
        // TODO: issue with faiss and need to add linux libraries via layer
        case VectorStoreType.FAISS:
            vectorStore = await FaissStore.fromDocuments(documents, cacheBackedEmbeddings);
            break;
        case VectorStoreType.MEMORY:
            vectorStore = await MemoryVectorStore.fromDocuments(documents, cacheBackedEmbeddings);
            break;
        case VectorStoreType.PINECONE:
            vectorStore = await PineconeStore.fromDocuments(documents, cacheBackedEmbeddings, {
                pineconeIndex,
                maxConcurrency: 5
            });
            break;
    }
    let finish = Date.now();
    console.log(JSON.stringify({
        "message": "createVectorStore()",
        "start": start,
        "finish": finish,
        "durationMilliseconds": finish - start
    }));
    return vectorStore;
}

// create query embeddings
async function createPromptEmbeddings(prompt) {
    const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });
    const params = {
        modelId: "amazon.titan-embed-text-v1",
        contentType: "application/json",
        accept: "*/*",
        body: '{ "inputText": "' + prompt + '" }'
    }
    const command = new InvokeModelCommand(params);
    const response = await bedrock.send(command);
    const parsed = parseBase64(response.body);
    return parsed;
}

// initialize embedding cache
async function initializeVectorCache() {
    const raw = await loadSource();
    console.log(raw);

    // split document into smaller chunks
    const documents = await splitDocument(raw);
    console.log(documents);

    // create vector store from split documents
    const vectorStore = await createVectorStore(documents);
    const vectorStoreRetriever = vectorStore.asRetriever();
    const keys = [];
    for await (const key of inMemoryStore.yieldKeys()) {
        keys.push(key);
    }
    console.log(keys.slice(0, 5));
    return vectorStoreRetriever;
}

async function invokeWithVectorContext(question, vectorStoreRetriever, responseStream) {
    // setup runnable chain for queries
    const SYSTEM_TEMPLATE = `Use the following pieces of context to answer the question at the end.
    If you don't know the answer, just say that you don't know, don't try to make up an answer.
    ----------------
    {context}`;
    const messages = [
        SystemMessagePromptTemplate.fromTemplate(SYSTEM_TEMPLATE),
        HumanMessagePromptTemplate.fromTemplate("{question}")
    ];
    const prompt = ChatPromptTemplate.fromMessages(messages);
    const chain = RunnableSequence.from([
        {
            context: vectorStoreRetriever.pipe(formatDocumentsAsString), // vectorStoreRetriever > vectorStore > cacheBackedEmbeddings > embeddings > amazon.titan-embed-text-v1
            question: new RunnablePassthrough()
        },
        prompt,
        model, // model: BedrockChat > anthropic.claude-v2
        new StringOutputParser()
    ]);
    const stream = await chain.stream(question);
    for await (const chunk of stream) {
        console.log(chunk);
        responseStream.write(chunk);
    }
    responseStream.end();
}

export {
    initializeVectorCache,
    invokeWithVectorContext
}
