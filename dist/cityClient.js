"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCityResponse = fetchCityResponse;
// src/cityClient.ts
const axios_1 = __importDefault(require("axios"));
async function fetchCityResponse(address) {
    const { laddr, sdir, sname, stype, faddr } = address;
    const params = new URLSearchParams({
        redir: "y",
        embed: "y",
        laddr: laddr.trim(),
        sdir: (sdir || "").toUpperCase().trim(),
        sname: sname.toUpperCase().trim(),
        stype: stype.toUpperCase().trim(),
        faddr: faddr.toUpperCase().trim(),
        method: "na",
    });
    const url = "https://itmdapps.milwaukee.gov/DpwServletsPublicAll/garbageDayService?" +
        params.toString();
    console.log("[cityClient] calling URL:", url);
    const res = await axios_1.default.get(url, { timeout: 5000 });
    if (res.status !== 200) {
        throw new Error(`City API returned status ${res.status}`);
    }
    // Log raw data so we can see what the city sends back
    console.log("[cityClient] raw data:", res.data);
    return res.data;
}
