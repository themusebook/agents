import * as z from "zod/v4";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./errors/sdkvalidationerror.js";
export declare const Logic: {
    readonly And: "and";
    readonly Or: "or";
};
export type Logic = OpenEnum<typeof Logic>;
export declare const Field: {
    readonly Model: "model";
    readonly Provider: "provider";
    readonly SessionId: "session_id";
    readonly UserId: "user_id";
    readonly ApiKeyName: "api_key_name";
    readonly FinishReason: "finish_reason";
    readonly Input: "input";
    readonly Output: "output";
    readonly TotalCost: "total_cost";
    readonly TotalTokens: "total_tokens";
    readonly PromptTokens: "prompt_tokens";
    readonly CompletionTokens: "completion_tokens";
};
export type Field = OpenEnum<typeof Field>;
export declare const Operator: {
    readonly Equals: "equals";
    readonly NotEquals: "not_equals";
    readonly Contains: "contains";
    readonly NotContains: "not_contains";
    readonly Regex: "regex";
    readonly StartsWith: "starts_with";
    readonly EndsWith: "ends_with";
    readonly Gt: "gt";
    readonly Lt: "lt";
    readonly Gte: "gte";
    readonly Lte: "lte";
    readonly Exists: "exists";
    readonly NotExists: "not_exists";
};
export type Operator = OpenEnum<typeof Operator>;
export type ObservabilityFilterRulesConfigValue = string | number;
export type Rule = {
    field: Field;
    operator: Operator;
    value?: string | number | undefined;
};
export type Group = {
    logic?: Logic | undefined;
    rules: Array<Rule>;
};
/**
 * Optional structured filter rules controlling which events are forwarded.
 */
export type ObservabilityFilterRulesConfig = {
    enabled?: boolean | undefined;
    groups: Array<Group>;
};
/** @internal */
export declare const Logic$inboundSchema: z.ZodType<Logic, unknown>;
/** @internal */
export declare const Logic$outboundSchema: z.ZodType<string, Logic>;
/** @internal */
export declare const Field$inboundSchema: z.ZodType<Field, unknown>;
/** @internal */
export declare const Field$outboundSchema: z.ZodType<string, Field>;
/** @internal */
export declare const Operator$inboundSchema: z.ZodType<Operator, unknown>;
/** @internal */
export declare const Operator$outboundSchema: z.ZodType<string, Operator>;
/** @internal */
export declare const ObservabilityFilterRulesConfigValue$inboundSchema: z.ZodType<ObservabilityFilterRulesConfigValue, unknown>;
/** @internal */
export type ObservabilityFilterRulesConfigValue$Outbound = string | number;
/** @internal */
export declare const ObservabilityFilterRulesConfigValue$outboundSchema: z.ZodType<ObservabilityFilterRulesConfigValue$Outbound, ObservabilityFilterRulesConfigValue>;
export declare function observabilityFilterRulesConfigValueToJSON(observabilityFilterRulesConfigValue: ObservabilityFilterRulesConfigValue): string;
export declare function observabilityFilterRulesConfigValueFromJSON(jsonString: string): SafeParseResult<ObservabilityFilterRulesConfigValue, SDKValidationError>;
/** @internal */
export declare const Rule$inboundSchema: z.ZodType<Rule, unknown>;
/** @internal */
export type Rule$Outbound = {
    field: string;
    operator: string;
    value?: string | number | undefined;
};
/** @internal */
export declare const Rule$outboundSchema: z.ZodType<Rule$Outbound, Rule>;
export declare function ruleToJSON(rule: Rule): string;
export declare function ruleFromJSON(jsonString: string): SafeParseResult<Rule, SDKValidationError>;
/** @internal */
export declare const Group$inboundSchema: z.ZodType<Group, unknown>;
/** @internal */
export type Group$Outbound = {
    logic: string;
    rules: Array<Rule$Outbound>;
};
/** @internal */
export declare const Group$outboundSchema: z.ZodType<Group$Outbound, Group>;
export declare function groupToJSON(group: Group): string;
export declare function groupFromJSON(jsonString: string): SafeParseResult<Group, SDKValidationError>;
/** @internal */
export declare const ObservabilityFilterRulesConfig$inboundSchema: z.ZodType<ObservabilityFilterRulesConfig, unknown>;
/** @internal */
export type ObservabilityFilterRulesConfig$Outbound = {
    enabled: boolean;
    groups: Array<Group$Outbound>;
};
/** @internal */
export declare const ObservabilityFilterRulesConfig$outboundSchema: z.ZodType<ObservabilityFilterRulesConfig$Outbound, ObservabilityFilterRulesConfig>;
export declare function observabilityFilterRulesConfigToJSON(observabilityFilterRulesConfig: ObservabilityFilterRulesConfig): string;
export declare function observabilityFilterRulesConfigFromJSON(jsonString: string): SafeParseResult<ObservabilityFilterRulesConfig, SDKValidationError>;
//# sourceMappingURL=observabilityfilterrulesconfig.d.ts.map