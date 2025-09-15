import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { probeMedia, asrTranscribeVideo, formatSrt, formatAss, finalHardBurn } from '../tools/subtitleTools';

// Tool definitions
const probeMediaTool = new DynamicStructuredTool({
    name: "probe_media",
    description: "Get video file information including duration, resolution and fps",
    schema: z.object({
        filePath: z.string().describe("Path to the video file")
    }),
    func: async ({ filePath }) => {
        const info = await probeMedia(filePath);
        return JSON.stringify(info);
    }
});

const transcribeVideoTool = new DynamicStructuredTool({
    name: "transcribe_video",
    description: "Transcribe video and generate subtitles",
    schema: z.object({
        filePath: z.string().describe("Path to the video file")
    }),
    func: async ({ filePath }) => {
        const result = await asrTranscribeVideo(filePath);
        return JSON.stringify(result);
    }
});

const formatSubtitleTool = new DynamicStructuredTool({
    name: "format_subtitle",
    description: "Convert subtitle document to SRT or ASS format",
    schema: z.object({
        format: z.enum(["srt", "ass"]).describe("The target format: 'srt' or 'ass'"),
        subtitleDoc: z.string().describe("The subtitle document in JSON format")
    }),
    func: async ({ format, subtitleDoc }) => {
        const doc = JSON.parse(subtitleDoc);
        return format === "srt" ? formatSrt(doc) : formatAss(doc);
    }
});

const burnSubtitleTool = new DynamicStructuredTool({
    name: "burn_subtitle",
    description: "Burn subtitles into video",
    schema: z.object({
        videoPath: z.string().describe("Path to the video file"),
        subtitlePath: z.string().describe("Path to the subtitle file"),
        outputPath: z.string().describe("Path for the output video file")
    }),
    func: async ({ videoPath, subtitlePath, outputPath }) => {
        await finalHardBurn(videoPath, subtitlePath, outputPath);
        return "Video processing completed";
    }
});

// Model configuration
const llm = new ChatOpenAI({
    configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-b232aa165cb340e5b45d4fddc0ab287b',  // Update this
    },
    modelName: 'qwen-turbo',
    temperature: 0,
});

const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant that processes subtitles and helps with video content. You can help with tasks like video transcription, subtitle formatting, and burning subtitles into videos."],
    ["human", "{input}"],
]);

const toolsList = [probeMediaTool, transcribeVideoTool, formatSubtitleTool, burnSubtitleTool];

// Create the agent
export const createSubtitleAgent = async () => {
    const agent = await createOpenAIFunctionsAgent({
        llm,
        tools: toolsList,
        prompt,
    });

    return new AgentExecutor({
        agent,
        tools: toolsList,
        maxIterations: 3,
    });
};

// Example usage
export const runAgent = async (input: string): Promise<string> => {
    const agentExecutor = await createSubtitleAgent();
    const result = await agentExecutor.invoke({
        input,
    });
    return result.output;
};
