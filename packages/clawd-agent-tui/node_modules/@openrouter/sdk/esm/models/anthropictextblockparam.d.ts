import * as z from "zod/v4";
import { AnthropicCacheControlDirective, AnthropicCacheControlDirective$Outbound } from "./anthropiccachecontroldirective.js";
import { AnthropicCitationCharLocationParam, AnthropicCitationCharLocationParam$Outbound } from "./anthropiccitationcharlocationparam.js";
import { AnthropicCitationContentBlockLocationParam, AnthropicCitationContentBlockLocationParam$Outbound } from "./anthropiccitationcontentblocklocationparam.js";
import { AnthropicCitationPageLocationParam, AnthropicCitationPageLocationParam$Outbound } from "./anthropiccitationpagelocationparam.js";
import { AnthropicCitationSearchResultLocation, AnthropicCitationSearchResultLocation$Outbound } from "./anthropiccitationsearchresultlocation.js";
import { AnthropicCitationWebSearchResultLocation, AnthropicCitationWebSearchResultLocation$Outbound } from "./anthropiccitationwebsearchresultlocation.js";
export type Citation = AnthropicCitationCharLocationParam | AnthropicCitationContentBlockLocationParam | AnthropicCitationPageLocationParam | AnthropicCitationSearchResultLocation | AnthropicCitationWebSearchResultLocation;
export type AnthropicTextBlockParam = {
    /**
     * Enable automatic prompt caching. When set at the top level, the system automatically applies cache breakpoints to the last cacheable block in the request. Currently supported for Anthropic Claude models.
     */
    cacheControl?: AnthropicCacheControlDirective | undefined;
    citations?: Array<AnthropicCitationCharLocationParam | AnthropicCitationContentBlockLocationParam | AnthropicCitationPageLocationParam | AnthropicCitationSearchResultLocation | AnthropicCitationWebSearchResultLocation> | null | undefined;
    text: string;
    type: "text";
};
/** @internal */
export type Citation$Outbound = AnthropicCitationCharLocationParam$Outbound | AnthropicCitationContentBlockLocationParam$Outbound | AnthropicCitationPageLocationParam$Outbound | AnthropicCitationSearchResultLocation$Outbound | AnthropicCitationWebSearchResultLocation$Outbound;
/** @internal */
export declare const Citation$outboundSchema: z.ZodType<Citation$Outbound, Citation>;
export declare function citationToJSON(citation: Citation): string;
/** @internal */
export type AnthropicTextBlockParam$Outbound = {
    cache_control?: AnthropicCacheControlDirective$Outbound | undefined;
    citations?: Array<AnthropicCitationCharLocationParam$Outbound | AnthropicCitationContentBlockLocationParam$Outbound | AnthropicCitationPageLocationParam$Outbound | AnthropicCitationSearchResultLocation$Outbound | AnthropicCitationWebSearchResultLocation$Outbound> | null | undefined;
    text: string;
    type: "text";
};
/** @internal */
export declare const AnthropicTextBlockParam$outboundSchema: z.ZodType<AnthropicTextBlockParam$Outbound, AnthropicTextBlockParam>;
export declare function anthropicTextBlockParamToJSON(anthropicTextBlockParam: AnthropicTextBlockParam): string;
//# sourceMappingURL=anthropictextblockparam.d.ts.map