import * as z from "zod/v4";
export type AnthropicCitationSearchResultLocation = {
    citedText: string;
    endBlockIndex: number;
    searchResultIndex: number;
    source: string;
    startBlockIndex: number;
    title: string | null;
    type: "search_result_location";
};
/** @internal */
export type AnthropicCitationSearchResultLocation$Outbound = {
    cited_text: string;
    end_block_index: number;
    search_result_index: number;
    source: string;
    start_block_index: number;
    title: string | null;
    type: "search_result_location";
};
/** @internal */
export declare const AnthropicCitationSearchResultLocation$outboundSchema: z.ZodType<AnthropicCitationSearchResultLocation$Outbound, AnthropicCitationSearchResultLocation>;
export declare function anthropicCitationSearchResultLocationToJSON(anthropicCitationSearchResultLocation: AnthropicCitationSearchResultLocation): string;
//# sourceMappingURL=anthropiccitationsearchresultlocation.d.ts.map