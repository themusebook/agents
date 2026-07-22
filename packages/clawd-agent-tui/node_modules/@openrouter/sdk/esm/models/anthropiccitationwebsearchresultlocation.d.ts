import * as z from "zod/v4";
export type AnthropicCitationWebSearchResultLocation = {
    citedText: string;
    encryptedIndex: string;
    title: string | null;
    type: "web_search_result_location";
    url: string;
};
/** @internal */
export type AnthropicCitationWebSearchResultLocation$Outbound = {
    cited_text: string;
    encrypted_index: string;
    title: string | null;
    type: "web_search_result_location";
    url: string;
};
/** @internal */
export declare const AnthropicCitationWebSearchResultLocation$outboundSchema: z.ZodType<AnthropicCitationWebSearchResultLocation$Outbound, AnthropicCitationWebSearchResultLocation>;
export declare function anthropicCitationWebSearchResultLocationToJSON(anthropicCitationWebSearchResultLocation: AnthropicCitationWebSearchResultLocation): string;
//# sourceMappingURL=anthropiccitationwebsearchresultlocation.d.ts.map