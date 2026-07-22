import * as z from "zod/v4";
import { ApplyPatchServerToolConfig, ApplyPatchServerToolConfig$Outbound } from "./applypatchservertoolconfig.js";
/**
 * OpenRouter built-in server tool: validates V4A diff patches for file operations (create, update, delete). Restricted to the Responses API.
 */
export type ApplyPatchServerToolOpenRouter = {
    /**
     * Configuration for the openrouter:apply_patch server tool
     */
    parameters?: ApplyPatchServerToolConfig | undefined;
    type: "openrouter:apply_patch";
};
/** @internal */
export type ApplyPatchServerToolOpenRouter$Outbound = {
    parameters?: ApplyPatchServerToolConfig$Outbound | undefined;
    type: "openrouter:apply_patch";
};
/** @internal */
export declare const ApplyPatchServerToolOpenRouter$outboundSchema: z.ZodType<ApplyPatchServerToolOpenRouter$Outbound, ApplyPatchServerToolOpenRouter>;
export declare function applyPatchServerToolOpenRouterToJSON(applyPatchServerToolOpenRouter: ApplyPatchServerToolOpenRouter): string;
//# sourceMappingURL=applypatchservertoolopenrouter.d.ts.map