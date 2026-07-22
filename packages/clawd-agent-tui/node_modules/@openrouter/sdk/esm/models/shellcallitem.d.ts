import * as z from "zod/v4";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
export type ShellCallItemAction = {
    commands: Array<string>;
    maxOutputLength?: number | null | undefined;
    timeoutMs?: number | null | undefined;
};
export declare const ShellCallItemStatus: {
    readonly InProgress: "in_progress";
    readonly Completed: "completed";
    readonly Incomplete: "incomplete";
};
export type ShellCallItemStatus = OpenEnum<typeof ShellCallItemStatus>;
export declare const ShellCallItemType: {
    readonly ShellCall: "shell_call";
};
export type ShellCallItemType = ClosedEnum<typeof ShellCallItemType>;
/**
 * A shell command execution call (newer variant)
 */
export type ShellCallItem = {
    action: ShellCallItemAction;
    callId: string;
    environment?: any | null | undefined;
    id?: string | null | undefined;
    status?: ShellCallItemStatus | null | undefined;
    type: ShellCallItemType;
};
/** @internal */
export type ShellCallItemAction$Outbound = {
    commands: Array<string>;
    max_output_length?: number | null | undefined;
    timeout_ms?: number | null | undefined;
};
/** @internal */
export declare const ShellCallItemAction$outboundSchema: z.ZodType<ShellCallItemAction$Outbound, ShellCallItemAction>;
export declare function shellCallItemActionToJSON(shellCallItemAction: ShellCallItemAction): string;
/** @internal */
export declare const ShellCallItemStatus$outboundSchema: z.ZodType<string, ShellCallItemStatus>;
/** @internal */
export declare const ShellCallItemType$outboundSchema: z.ZodEnum<typeof ShellCallItemType>;
/** @internal */
export type ShellCallItem$Outbound = {
    action: ShellCallItemAction$Outbound;
    call_id: string;
    environment?: any | null | undefined;
    id?: string | null | undefined;
    status?: string | null | undefined;
    type: string;
};
/** @internal */
export declare const ShellCallItem$outboundSchema: z.ZodType<ShellCallItem$Outbound, ShellCallItem>;
export declare function shellCallItemToJSON(shellCallItem: ShellCallItem): string;
//# sourceMappingURL=shellcallitem.d.ts.map